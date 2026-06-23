// cycle-highlights — builds a closed cycle's Spotify playlists from the
// combined-signal ranking (get_cycle_highlights).
//
// Triggered by the client right after close_cycle (and by a manual "generate"
// button on the cycle's history page, for clubs that connect Spotify after a
// close). Runs on the OWNER's stored token via the service role, mirroring
// spotify-sync:
//   1. load the club's connection; refresh the token if expiring (mark
//      needs_reconnect on failure)
//   2. idempotent — skip if the cycle already has a highlights playlist
//   3. read the ranked top songs via the caller's JWT (get_cycle_highlights is
//      member-gated); resolve each to a Spotify URI (feed posts use their stored
//      uri, else best-effort search; album tracks search by track + artist)
//   4. create "{Club} — Cycle N Highlights" and append the matched URIs
//   5. enshrine the top 1–3 not-yet-saved songs into the club's All-Time
//      Favorites playlist (+ club_favorite_tracks rows)
//
// Returns 200 { ok:false, reason } for recoverable states (not_connected,
// needs_reconnect, no_open_cycle-style cases) so the client can react quietly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { addTracks, createPlaylist, refreshTokens, searchTrackUri } from '../_shared/spotify.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// How many of the cycle's top songs get enshrined into all-time favorites.
const FAVORITES_PER_CYCLE = 3
// Cap the per-cycle highlights playlist so a noisy feed can't balloon it.
const MAX_HIGHLIGHTS = 30

interface TopSong {
  source: 'album' | 'feed'
  title: string
  artist: string | null
  score: number
  spotify_uri?: string | null
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY || !clientId || !clientSecret) {
      return json({ ok: false, message: 'Function is missing required secrets' }, 500)
    }

    let clubId = ''
    let cycleId = ''
    try {
      const body = await req.json()
      clubId = String(body?.club_id ?? '').trim()
      cycleId = String(body?.cycle_id ?? '').trim()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (!clubId || !cycleId) return json({ ok: false, message: 'club_id and cycle_id are required' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ ok: false, message: 'Not authenticated' }, 401)

    // Caller must belong to the club.
    const { data: membership } = await admin
      .from('club_members').select('role').eq('club_id', clubId).eq('profile_id', user.id).maybeSingle()
    if (!membership) return json({ ok: false, message: 'Not a club member' }, 403)

    // ── Connection ────────────────────────────────────────────────────────────
    const { data: conn } = await admin
      .from('streaming_connections').select('*').eq('club_id', clubId).maybeSingle()
    if (!conn) return json({ ok: false, reason: 'not_connected' })
    if (conn.status === 'needs_reconnect') return json({ ok: false, reason: 'needs_reconnect' })

    const markReconnect = async () => {
      await admin.from('streaming_connections')
        .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
        .eq('club_id', clubId)
    }
    const isAuthError = (e: unknown) => /\(401\)/.test(String(e))

    let accessToken: string = conn.access_token
    if (new Date(conn.expires_at).getTime() - Date.now() < 60_000) {
      try {
        const t = await refreshTokens(clientId, clientSecret, conn.refresh_token)
        accessToken = t.access_token
        await admin.from('streaming_connections').update({
          access_token: t.access_token,
          refresh_token: t.refresh_token ?? conn.refresh_token,
          expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
          status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('club_id', clubId)
      } catch {
        await markReconnect()
        return json({ ok: false, reason: 'needs_reconnect' })
      }
    }

    // ── Cycle (idempotent) ──────────────────────────────────────────────────────
    const { data: cycle } = await admin
      .from('cycles')
      .select('id, number, club_id, spotify_highlights_playlist_id, spotify_highlights_playlist_url, clubs(name, spotify_favorites_playlist_id, spotify_favorites_playlist_url)')
      .eq('id', cycleId).eq('club_id', clubId).maybeSingle()
    if (!cycle) return json({ ok: false, message: 'Cycle not found' }, 404)
    if (cycle.spotify_highlights_playlist_id) {
      return json({ ok: true, already: true, playlist_url: cycle.spotify_highlights_playlist_url })
    }
    const clubName = (cycle as any).clubs?.name ?? 'Music club'

    // ── Ranked songs (member-gated RPC, run as the caller) ──────────────────────
    const { data: highlights, error: hErr } = await userClient.rpc('get_cycle_highlights', { p_cycle: cycleId })
    if (hErr) return json({ ok: false, message: hErr.message }, 400)
    const topSongs: TopSong[] = ((highlights as any)?.top_songs ?? []) as TopSong[]
    if (topSongs.length === 0) return json({ ok: true, added: 0, reason: 'no_top_songs' })

    // Resolve each ranked song to a Spotify URI, preserving rank order and
    // de-duplicating. Album tracks have no stored uri → best-effort search.
    const resolved: { uri: string; song: TopSong }[] = []
    const seen = new Set<string>()
    for (const s of topSongs.slice(0, MAX_HIGHLIGHTS)) {
      let uri = s.spotify_uri ?? null
      if (!uri) uri = await searchTrackUri(accessToken, s.title ?? '', s.artist ?? '')
      if (uri && !seen.has(uri)) {
        seen.add(uri)
        resolved.push({ uri, song: s })
      }
    }
    if (resolved.length === 0) return json({ ok: true, added: 0, reason: 'no_matches' })

    // ── Cycle Highlights playlist ───────────────────────────────────────────────
    let playlistUrl = ''
    try {
      const created = await createPlaylist(
        accessToken,
        `${clubName} — Cycle ${cycle.number} Highlights`,
        `The club's most-loved songs from cycle ${cycle.number} of ${clubName}.`,
      )
      playlistUrl = created.url
      await addTracks(accessToken, created.id, resolved.map((r) => r.uri))
      await admin.from('cycles')
        .update({ spotify_highlights_playlist_id: created.id, spotify_highlights_playlist_url: created.url })
        .eq('id', cycle.id)
    } catch (e) {
      if (isAuthError(e)) { await markReconnect(); return json({ ok: false, reason: 'needs_reconnect' }) }
      return json({ ok: false, reason: 'playlist_error', message: String(e) })
    }

    // ── All-Time Favorites: enshrine the top 1–3 not already saved ──────────────
    let favoritesAdded = 0
    try {
      const { data: existing } = await admin
        .from('club_favorite_tracks').select('spotify_uri').eq('club_id', clubId)
      const have = new Set((existing ?? []).map((r: any) => r.spotify_uri).filter(Boolean))
      const fresh = resolved.filter((r) => !have.has(r.uri)).slice(0, FAVORITES_PER_CYCLE)

      if (fresh.length > 0) {
        let favPlaylistId = (cycle as any).clubs?.spotify_favorites_playlist_id as string | null
        let favPlaylistUrl = (cycle as any).clubs?.spotify_favorites_playlist_url as string | null
        if (!favPlaylistId) {
          const created = await createPlaylist(
            accessToken,
            `${clubName} — All-Time Favorites`,
            `The best songs from every cycle of ${clubName}.`,
          )
          favPlaylistId = created.id
          favPlaylistUrl = created.url
          await admin.from('clubs')
            .update({ spotify_favorites_playlist_id: favPlaylistId, spotify_favorites_playlist_url: favPlaylistUrl })
            .eq('id', clubId)
        }
        await addTracks(accessToken, favPlaylistId!, fresh.map((r) => r.uri))
        await admin.from('club_favorite_tracks').insert(
          fresh.map((r) => ({
            club_id: clubId,
            cycle_id: cycle.id,
            title: r.song.title,
            artist: r.song.artist,
            spotify_uri: r.uri,
            source: r.song.source,
          })),
        )
        favoritesAdded = fresh.length
      }
    } catch (e) {
      // The cycle playlist already succeeded; don't fail the whole call if only
      // the favorites step trips. Surface it but report partial success.
      if (isAuthError(e)) await markReconnect()
      return json({ ok: true, added: resolved.length, favorites_added: 0, playlist_url: playlistUrl, favorites_error: String(e) })
    }

    return json({ ok: true, added: resolved.length, favorites_added: favoritesAdded, playlist_url: playlistUrl })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
