// apple-music — resolves song/album rows to verified Apple Music matches
// (APPLE_MUSIC_PLAN.md Phase 1).
//
// Not client-facing: called by the request_apple_match DB trigger via pg_net
// after a song row lands ({ source_table, source_id }), and by the hourly
// pg_cron sweep ({ action: 'sweep' }) that retries queued misses. verify_jwt is
// off (see config.toml); callers must instead present the x-apple-secret shared
// secret (APPLE_MATCH_SECRET env var — the same value stored in Vault for the
// trigger), like send-push's x-push-secret.
//
// Match strategy per row:
//   1. ISRC — from the row when captured at pick time, else recovered via
//      Spotify: /search returns full track objects incl. external_ids.isrc, so
//      matching the row's spotify_url track id against search results yields
//      the exact ISRC without the (dev-mode-restricted) /tracks endpoint.
//      ISRC → Apple catalog exact lookup → OVERWRITES any fuzzy client match.
//   2. No ISRC / exact miss → Apple text search; fills apple_url only when the
//      row has none (an existing fuzzy link isn't churned for equally-fuzzy
//      data — Phase 2's backfill re-verifies those).
//   3. Nothing at all → upsert into apple_match_queue for the hourly sweep;
//      new releases often reach Apple days after Spotify.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  type AppleTrackMatch,
  albumByUpc,
  getDeveloperToken,
  searchAlbum,
  searchTrack,
  trackByIsrc,
} from '../_shared/apple.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// ── Row registry ─────────────────────────────────────────
// Everything table-specific lives here: how to read the song fields off a row
// and how to write the match back. `isrc` is a pick-time hint where one exists.

interface SongRow {
  kind: 'track' | 'album'
  title: string
  artist: string
  spotify_url: string | null
  apple_url: string | null
  isrc: string | null
  metadata?: Record<string, unknown> // feed_posts only, for the merge-back
}

interface TableSpec {
  select: string
  read: (raw: any) => SongRow | null
  write: (row: SongRow, m: AppleTrackMatch) => Record<string, unknown>
}

const plainTrack = (select = 'title, artist, spotify_url, apple_url'): TableSpec => ({
  select,
  read: (r) => ({
    kind: 'track',
    title: r.title ?? '',
    artist: r.artist ?? '',
    spotify_url: r.spotify_url ?? null,
    apple_url: r.apple_url ?? null,
    isrc: null,
  }),
  write: (_row, m) => ({ apple_url: m.apple_url }),
})

const TABLES: Record<string, TableSpec> = {
  best_bars: plainTrack(),
  aux_battle_songs: plainTrack(),
  convince_tracks: plainTrack(),
  showdown_submissions: plainTrack(),
  bingo_boxes: plainTrack(),
  perfect_playlist_songs: {
    select: 'title, artist, spotify_url, apple_url, isrc',
    read: (r) => ({
      kind: 'track',
      title: r.title ?? '',
      artist: r.artist ?? '',
      spotify_url: r.spotify_url ?? null,
      apple_url: r.apple_url ?? null,
      isrc: r.isrc ?? null,
    }),
    write: (_row, m) => ({ apple_url: m.apple_url, apple_song_id: m.apple_song_id, isrc: m.isrc }),
  },
  // Track title is on the row; the artist lives on the parent bracket.
  bracket_tracks: {
    select: 'title, spotify_url, apple_url, preview_url, brackets ( artist_name )',
    read: (r) => ({
      kind: 'track',
      title: r.title ?? '',
      artist: r.brackets?.artist_name ?? '',
      spotify_url: r.spotify_url ?? null,
      apple_url: r.apple_url ?? null,
      isrc: null,
    }),
    write: (_row, m) => ({ apple_url: m.apple_url, preview_url: m.preview_url }),
  },
  // Song links live in metadata jsonb; kind 'album' rows are queue suggestions.
  feed_posts: {
    select: 'kind, title, artist, metadata',
    read: (r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>
      return {
        kind: r.kind === 'album' ? 'album' : 'track',
        title: r.title ?? '',
        artist: r.artist ?? '',
        spotify_url: (meta.spotify_url as string) ?? null,
        apple_url: (meta.apple_url as string) ?? null,
        isrc: (meta.isrc as string) ?? null,
        metadata: meta,
      }
    },
    write: (row, m) => ({
      metadata: {
        ...row.metadata,
        apple_url: m.apple_url,
        apple_song_id: m.apple_song_id,
        ...(m.isrc ? { isrc: m.isrc } : {}),
        ...(m.preview_url ? { preview_url: m.preview_url } : {}),
      },
    }),
  },
  albums: {
    select: 'title, artist, spotify_url, apple_url',
    read: (r) => ({
      kind: 'album',
      title: r.title ?? '',
      artist: r.artist ?? '',
      spotify_url: r.spotify_url ?? null,
      apple_url: r.apple_url ?? null,
      isrc: null,
    }),
    write: (_row, m) => ({ apple_url: m.apple_url }),
  },
}

// ── Spotify (ISRC/UPC recovery) ──────────────────────────
// Dev-mode app credentials: /search is the only reliable endpoint (albums GET
// is attempted for UPC but treated as best-effort).

let spotifyToken: { value: string; expiresAt: number } | null = null

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  if (spotifyToken && Date.now() < spotifyToken.expiresAt) return spotifyToken.value
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`)
  const tok = await res.json()
  spotifyToken = { value: tok.access_token, expiresAt: Date.now() + (tok.expires_in - 60) * 1000 }
  return spotifyToken.value
}

const spotifyTrackId = (url: string | null): string | null =>
  /track\/([A-Za-z0-9]+)/.exec(url ?? '')?.[1] ?? null
const spotifyAlbumId = (url: string | null): string | null =>
  /album\/([A-Za-z0-9]+)/.exec(url ?? '')?.[1] ?? null

/** Recover a track's ISRC: search by title+artist and demand the exact track id
 * from the row's spotify_url among the results. Strict on purpose — a near-miss
 * ISRC would "verify" the wrong recording. */
async function recoverIsrc(
  token: string,
  title: string,
  artist: string,
  trackId: string,
): Promise<string | null> {
  const q = [title, artist].filter(Boolean).join(' ').trim()
  if (!q) return null
  const res = await fetch(
    `https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const j = await res.json()
  const hit = (j?.tracks?.items ?? []).find((t: any) => t?.id === trackId)
  return hit?.external_ids?.isrc ?? null
}

/** Album UPC via GET /v1/albums/{id} — 403s under dev-mode restrictions, so
 * strictly best-effort. */
async function recoverUpc(token: string, albumId: string): Promise<string | null> {
  const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const j = await res.json()
  return j?.external_ids?.upc ?? null
}

// ── Resolution ───────────────────────────────────────────

type Outcome = 'verified' | 'filled' | 'kept' | 'queued' | 'gone' | 'skipped'

interface Ctx {
  admin: SupabaseClient
  appleToken: string
  spotify: { id: string; secret: string } | null
}

async function resolveSource(ctx: Ctx, sourceTable: string, sourceId: string): Promise<Outcome> {
  const spec = TABLES[sourceTable]
  if (!spec) return 'skipped'

  const { data: raw } = await ctx.admin
    .from(sourceTable)
    .select(spec.select)
    .eq('id', sourceId)
    .maybeSingle()
  if (!raw) {
    // Row deleted before we got here — nothing left to match.
    await ctx.admin
      .from('apple_match_queue')
      .delete()
      .match({ source_table: sourceTable, source_id: sourceId })
    return 'gone'
  }

  const row = spec.read(raw)
  if (!row || !row.title.trim()) return 'skipped'

  let match: AppleTrackMatch | null = null
  let verified = false

  if (row.kind === 'track') {
    let isrc = row.isrc
    if (!isrc && ctx.spotify) {
      const trackId = spotifyTrackId(row.spotify_url)
      if (trackId) {
        const tok = await getSpotifyToken(ctx.spotify.id, ctx.spotify.secret).catch(() => null)
        if (tok) isrc = await recoverIsrc(tok, row.title, row.artist, trackId)
      }
    }
    if (isrc) {
      match = await trackByIsrc(ctx.appleToken, isrc)
      if (match) {
        verified = true
        match.isrc = match.isrc ?? isrc
      }
    }
    if (!match) match = await searchTrack(ctx.appleToken, row.title, row.artist)
  } else {
    let upc: string | null = null
    if (ctx.spotify) {
      const albumId = spotifyAlbumId(row.spotify_url)
      if (albumId) {
        const tok = await getSpotifyToken(ctx.spotify.id, ctx.spotify.secret).catch(() => null)
        if (tok) upc = await recoverUpc(tok, albumId)
      }
    }
    if (upc) {
      const m = await albumByUpc(ctx.appleToken, upc)
      if (m) {
        verified = true
        match = { apple_url: m.apple_url, apple_song_id: m.apple_album_id, isrc: null, preview_url: null }
      }
    }
    if (!match) {
      const m = await searchAlbum(ctx.appleToken, row.title, row.artist)
      if (m) match = { apple_url: m.apple_url, apple_song_id: m.apple_album_id, isrc: null, preview_url: null }
    }
  }

  if (match && (verified || !row.apple_url)) {
    const { error } = await ctx.admin
      .from(sourceTable)
      .update(spec.write(row, match))
      .eq('id', sourceId)
    if (error) throw new Error(`Write-back to ${sourceTable} failed: ${error.message}`)
    await ctx.admin
      .from('apple_match_queue')
      .update({ resolved_at: new Date().toISOString() })
      .match({ source_table: sourceTable, source_id: sourceId })
      .is('resolved_at', null)
    return verified ? 'verified' : 'filled'
  }

  if (match) {
    // Unverified match but the row already has a (fuzzy) link — leave it; the
    // Phase 2 backfill re-verifies existing links wholesale.
    return 'kept'
  }

  // Total miss → queue for the hourly sweep.
  const { data: existing } = await ctx.admin
    .from('apple_match_queue')
    .select('id, attempts')
    .match({ source_table: sourceTable, source_id: sourceId })
    .maybeSingle()
  await ctx.admin.from('apple_match_queue').upsert(
    {
      source_table: sourceTable,
      source_id: sourceId,
      kind: row.kind,
      title: row.title,
      artist: row.artist,
      spotify_url: row.spotify_url,
      isrc: row.isrc,
      attempts: (existing?.attempts ?? 0) + 1,
      last_attempt_at: new Date().toISOString(),
    },
    { onConflict: 'source_table,source_id' },
  )
  return 'queued'
}

// Retry cap: ~30 hourly attempts covers a month of "not on Apple yet"; after
// that the row keeps whatever fuzzy link it has and stops costing API calls.
const SWEEP_BATCH = 25
const MAX_ATTEMPTS = 30

async function sweep(ctx: Ctx): Promise<Record<string, number>> {
  const { data: rows } = await ctx.admin
    .from('apple_match_queue')
    .select('source_table, source_id')
    .is('resolved_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .lt('last_attempt_at', new Date(Date.now() - 55 * 60 * 1000).toISOString())
    .order('last_attempt_at', { ascending: true })
    .limit(SWEEP_BATCH)
  const counts: Record<string, number> = {}
  for (const r of rows ?? []) {
    // Sequential on purpose — a burst of parallel lookups is how you meet
    // Apple's undocumented rate limit.
    const outcome = await resolveSource(ctx, r.source_table, r.source_id).catch(() => 'error')
    counts[outcome] = (counts[outcome] ?? 0) + 1
  }
  return counts
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

    const secret = Deno.env.get('APPLE_MATCH_SECRET')
    if (!secret || req.headers.get('x-apple-secret') !== secret) {
      return json({ ok: false, message: 'Forbidden' }, 403)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const teamId = Deno.env.get('APPLE_TEAM_ID')
    const keyId = Deno.env.get('APPLE_MUSIC_KEY_ID')
    const privateKey = Deno.env.get('APPLE_MUSIC_PRIVATE_KEY')
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !teamId || !keyId || !privateKey) {
      return json({ ok: false, message: 'apple-music is missing required secrets' }, 500)
    }
    const spotifyId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const spotifySecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')

    let body: any
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }

    const ctx: Ctx = {
      admin: createClient(SUPABASE_URL, SERVICE_ROLE_KEY),
      appleToken: await getDeveloperToken(teamId, keyId, privateKey),
      spotify: spotifyId && spotifySecret ? { id: spotifyId, secret: spotifySecret } : null,
    }

    if (body?.action === 'sweep') {
      const counts = await sweep(ctx)
      console.log('apple-music sweep:', JSON.stringify(counts))
      return json({ ok: true, counts })
    }

    const sourceTable = String(body?.source_table ?? '')
    const sourceId = String(body?.source_id ?? '')
    if (!sourceTable || !sourceId) {
      return json({ ok: false, message: 'source_table and source_id are required' }, 400)
    }
    const outcome = await resolveSource(ctx, sourceTable, sourceId)
    console.log(`apple-music resolve ${sourceTable}/${sourceId}: ${outcome}`)
    return json({ ok: true, outcome })
  } catch (e) {
    console.error('apple-music error:', e)
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
