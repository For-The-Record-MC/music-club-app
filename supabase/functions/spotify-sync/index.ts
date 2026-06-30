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
import { addTracks, createPlaylist, refreshTokens, removeTracks, searchTrackUri } from '../_shared/spotify.ts'

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

// Derive a spotify:track URI from an open.spotify.com/track/<id> URL, so a song
// picked via Spotify search syncs without a second catalog lookup.
function uriFromSpotifyUrl(url: string | null | undefined): string | null {
  const m = /track\/([A-Za-z0-9]+)/.exec(url ?? '')
  return m ? `spotify:track:${m[1]}` : null
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
    let removePostId = ''
    let mode = 'feed'
    try {
      const body = await req.json()
      clubId = String(body?.club_id ?? '').trim()
      // When set, this is a removal request (a deleted feed post) rather than the
      // default append-the-cycle's-songs sync.
      removePostId = String(body?.remove_post_id ?? '').trim()
      // playlist: 'perfect' syncs the cycle's Perfect Playlist (its own Spotify
      // playlist) instead of the feed's. Defaults to the feed sync.
      if (body?.playlist === 'perfect') mode = 'perfect'
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
    // A club either has its own personal connection (allowlisted owners — Jordan,
    // Tim) or none, in which case we fall back to the shared APP account whose
    // refresh token lives in SPOTIFY_APP_REFRESH_TOKEN. The app account silently
    // creates and owns playlists for every non-allowlisted club.
    const { data: conn } = await admin
      .from('streaming_connections').select('*').eq('club_id', clubId).maybeSingle()

    // appManaged: using the shared app token (no per-club row to update / sever).
    const appManaged = !conn
    if (conn?.status === 'needs_reconnect') return json({ ok: false, reason: 'needs_reconnect' })

    const markReconnect = async () => {
      // Only personal connections can be "reconnected" — the app token is ours.
      if (appManaged) return
      await admin.from('streaming_connections')
        .update({ status: 'needs_reconnect', updated_at: new Date().toISOString() })
        .eq('club_id', clubId)
    }
    // Only a 401 means the token is truly bad (revoked/expired) → needs reconnect.
    // Other failures (e.g. 403 dev-mode allowlist) are surfaced WITHOUT severing.
    const isAuthError = (e: unknown) => /\(401\)/.test(String(e))

    let accessToken: string
    if (appManaged) {
      const appRefresh = Deno.env.get('SPOTIFY_APP_REFRESH_TOKEN')
      if (!appRefresh) return json({ ok: false, reason: 'not_connected' })
      try {
        const t = await refreshTokens(clientId, clientSecret, appRefresh)
        accessToken = t.access_token
      } catch (e) {
        // The shared token is misconfigured/revoked — a server-side problem, not
        // something this club's members can fix by "reconnecting".
        return json({ ok: false, reason: 'app_token_error', message: String(e) })
      }
    } else {
      // Refresh the access token if it expires within 60s.
      accessToken = conn.access_token
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
    }

    // ── Open cycle + lazy playlist ──────────────────────────────────────────────
    const { data: cycle } = await admin
      .from('cycles')
      .select('id, number, created_at, spotify_playlist_id, spotify_playlist_url, clubs(name)')
      .eq('club_id', clubId).eq('status', 'open').maybeSingle()
    if (!cycle) return json({ ok: true, added: 0, reason: 'no_open_cycle' })

    // ── Perfect Playlist sync ───────────────────────────────────────────────────
    // A sibling of the feed sync: the cycle's Perfect Playlist gets its OWN
    // Spotify playlist (lazily created, id stored on perfect_playlists), and its
    // unsynced songs are appended. Reuses all the connection/token plumbing above.
    if (mode === 'perfect') {
      const { data: pp } = await admin
        .from('perfect_playlists')
        .select('id, theme_text, spotify_playlist_id, spotify_playlist_url')
        .eq('cycle_id', cycle.id)
        .maybeSingle()
      if (!pp) return json({ ok: true, added: 0, reason: 'no_playlist' })

      let ppId: string | null = pp.spotify_playlist_id
      let ppUrl: string | null = pp.spotify_playlist_url
      const clubName = (cycle as any).clubs?.name ?? 'Music club'
      if (!ppId) {
        try {
          const created = await createPlaylist(
            accessToken,
            `${clubName} — ${pp.theme_text} (Cycle ${cycle.number})`,
            `The club's "${pp.theme_text}" perfect playlist for cycle ${cycle.number}.`,
          )
          ppId = created.id
          ppUrl = created.url
          await admin.from('perfect_playlists')
            .update({ spotify_playlist_id: ppId, spotify_playlist_url: ppUrl })
            .eq('id', pp.id)
        } catch (e) {
          if (isAuthError(e)) { await markReconnect(); return json({ ok: false, reason: 'needs_reconnect' }) }
          return json({ ok: false, reason: 'playlist_error', message: String(e) })
        }
      }

      const { data: songs } = await admin
        .from('perfect_playlist_songs')
        .select('id, title, artist, spotify_url')
        .eq('playlist_id', pp.id)
        .is('playlist_synced_at', null)
        .order('created_at')
      if (!songs || songs.length === 0) return json({ ok: true, added: 0, playlist_url: ppUrl })

      const ppAdded: string[] = []
      const ppUris: string[] = []
      for (const s of songs) {
        let uri = uriFromSpotifyUrl(s.spotify_url)
        if (!uri) uri = await searchTrackUri(accessToken, s.title ?? '', s.artist ?? '')
        if (uri) { ppUris.push(uri); ppAdded.push(s.id) }
      }
      if (ppUris.length === 0) return json({ ok: true, added: 0, playlist_url: ppUrl, reason: 'no_matches' })
      try {
        await addTracks(accessToken, ppId!, ppUris)
      } catch (e) {
        if (isAuthError(e)) { await markReconnect(); return json({ ok: false, reason: 'needs_reconnect' }) }
        return json({ ok: false, reason: 'playlist_error', message: String(e) })
      }
      await admin.from('perfect_playlist_songs')
        .update({ playlist_synced_at: new Date().toISOString() })
        .in('id', ppAdded)
      return json({ ok: true, added: ppAdded.length, playlist_url: ppUrl })
    }

    let playlistId: string | null = cycle.spotify_playlist_id
    let playlistUrl: string | null = cycle.spotify_playlist_url

    // ── Removal path: a deleted feed post → drop its track from the playlist ────
    // Runs before lazy playlist creation (a delete should never create one). The
    // post row still exists here (the client deletes it after this returns), so
    // we can resolve its URI and check whether any sibling post still needs it.
    if (removePostId) {
      if (!playlistId) return json({ ok: true, removed: 0 })
      const { data: post } = await admin
        .from('feed_posts')
        .select('id, club_id, kind, title, artist, metadata, playlist_synced_at, created_at')
        .eq('id', removePostId)
        .maybeSingle()
      // Only a synced track from this club's open cycle has anything in the playlist.
      if (
        !post ||
        post.club_id !== clubId ||
        post.kind !== 'track' ||
        !post.playlist_synced_at ||
        new Date(post.created_at).getTime() < new Date(cycle.created_at).getTime()
      ) {
        return json({ ok: true, removed: 0 })
      }
      const meta = (post.metadata ?? {}) as { spotify_uri?: string }
      let uri = meta.spotify_uri ?? null
      if (!uri) uri = await searchTrackUri(accessToken, post.title ?? '', post.artist ?? '')
      if (!uri) return json({ ok: true, removed: 0, reason: 'no_match' })
      // Leave it if another post in this cycle still references the same track —
      // removing by URI drops every occurrence from the playlist.
      const { data: others } = await admin
        .from('feed_posts')
        .select('id')
        .eq('club_id', clubId)
        .eq('kind', 'track')
        .gte('created_at', cycle.created_at)
        .neq('id', removePostId)
        .eq('metadata->>spotify_uri', uri)
        .limit(1)
      if (others && others.length) return json({ ok: true, removed: 0, reason: 'still_referenced' })
      try {
        await removeTracks(accessToken, playlistId, [uri])
      } catch (e) {
        if (isAuthError(e)) { await markReconnect(); return json({ ok: false, reason: 'needs_reconnect' }) }
        return json({ ok: false, reason: 'playlist_error', message: String(e) })
      }
      return json({ ok: true, removed: 1, playlist_url: playlistUrl })
    }

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
