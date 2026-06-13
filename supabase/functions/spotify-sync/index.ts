// spotify-sync — pushes the open cycle's feed songs to a Spotify playlist.
//
// Any club member can trigger this (the app calls it after a track post, and a
// "Re-sync" button calls it manually). It runs entirely on the OWNER's stored
// token via the service role:
//   1. load the club's connection; refresh the access token if it's expiring
//      (mark needs_reconnect if the refresh fails / was revoked)
//   2. find the open cycle; lazily create its PUBLIC playlist if missing and
//      record the id/url on the cycle row
//   3. collect track posts in this cycle not yet synced; resolve each to a
//      Spotify URI (stored metadata.spotify_uri, else a best-effort search;
//      skip unmatched), append them, and stamp playlist_synced_at
//
// Returns 200 { ok:false, reason } for recoverable states (not connected, no
// open cycle, needs_reconnect) so the client can react without treating them as
// errors.

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
    try {
      const body = await req.json()
      clubId = String(body?.club_id ?? '').trim()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (!clubId) return json({ ok: false, message: 'club_id is required' }, 400)

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
    // Only a 401 means the token is truly bad (revoked/expired) → needs reconnect.
    // Other failures (e.g. 403 dev-mode allowlist) are surfaced WITHOUT severing.
    const isAuthError = (e: unknown) => /\(401\)/.test(String(e))

    // Refresh the access token if it expires within 60s.
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

    // ── Open cycle + lazy playlist ──────────────────────────────────────────────
    const { data: cycle } = await admin
      .from('cycles')
      .select('id, number, created_at, spotify_playlist_id, spotify_playlist_url, clubs(name)')
      .eq('club_id', clubId).eq('status', 'open').maybeSingle()
    if (!cycle) return json({ ok: true, added: 0, reason: 'no_open_cycle' })

    let playlistId: string | null = cycle.spotify_playlist_id
    let playlistUrl: string | null = cycle.spotify_playlist_url
    if (!playlistId) {
      const clubName = (cycle as any).clubs?.name ?? 'Music club'
      try {
        const created = await createPlaylist(
          accessToken,
          `${clubName} — Cycle ${cycle.number}`,
          `Songs shared in the ${clubName} feed during cycle ${cycle.number}.`,
        )
        playlistId = created.id
        playlistUrl = created.url
        await admin.from('cycles')
          .update({ spotify_playlist_id: playlistId, spotify_playlist_url: playlistUrl })
          .eq('id', cycle.id)
      } catch (e) {
        if (isAuthError(e)) { await markReconnect(); return json({ ok: false, reason: 'needs_reconnect' }) }
        return json({ ok: false, reason: 'playlist_error', message: String(e) })
      }
    }

    // ── Unsynced track posts this cycle ─────────────────────────────────────────
    const { data: posts } = await admin
      .from('feed_posts')
      .select('id, title, artist, metadata')
      .eq('club_id', clubId)
      .eq('kind', 'track')
      .gte('created_at', cycle.created_at)
      .is('playlist_synced_at', null)
      .order('created_at')
    if (!posts || posts.length === 0) {
      return json({ ok: true, added: 0, playlist_url: playlistUrl })
    }

    const addedIds: string[] = []
    const uris: string[] = []
    for (const p of posts) {
      const meta = (p.metadata ?? {}) as { spotify_uri?: string }
      let uri = meta.spotify_uri ?? null
      if (!uri) uri = await searchTrackUri(accessToken, p.title ?? '', p.artist ?? '')
      if (uri) {
        uris.push(uri)
        addedIds.push(p.id)
      }
    }

    if (uris.length === 0) {
      return json({ ok: true, added: 0, playlist_url: playlistUrl, reason: 'no_matches' })
    }

    try {
      await addTracks(accessToken, playlistId!, uris)
    } catch (e) {
      if (isAuthError(e)) { await markReconnect(); return json({ ok: false, reason: 'needs_reconnect' }) }
      return json({ ok: false, reason: 'playlist_error', message: String(e) })
    }

    await admin.from('feed_posts')
      .update({ playlist_synced_at: new Date().toISOString() })
      .in('id', addedIds)

    return json({ ok: true, added: addedIds.length, playlist_url: playlistUrl })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
