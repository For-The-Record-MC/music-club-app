// bracket-seed — Edge Function that builds the Track Madness candidate list.
//
// Two modes, split on the request body:
//
// • Artist ({ artistId, artistName }): the artist's most-played songs. Spotify's
//   own top-tracks endpoint caps at 10 and exposes no play counts, so ranking
//   comes from Last.fm's artist.getTopTracks (real all-time scrobble counts,
//   secret LASTFM_API_KEY); each ranked title is then matched against the
//   artist's Spotify catalog for links + artwork. When Last.fm has thin data,
//   ranking falls back to Spotify's popularity score across the catalog.
//
// • Theme ({ tag, probe? }): a Last.fm tag's top tracks (genre/decade/mood).
//   Tag relevance selects the candidate POOL (with a two-per-artist cap so a
//   narrow tag doesn't collapse into an artist bracket); seeding ORDER is
//   all-time playcount (track.getInfo) — crossover bias is handled by the cap
//   plus review-screen swaps, and Last.fm's raw tag ordering proved erratic.
//   { probe: true } skips Spotify resolution and returns just { count, artists }
//   — the creation screen's debounced is-this-tag-any-good check.
//
// Returns more candidates than the largest bracket (64 + alternates) so the
// creation screen can enable/disable sizes and offer remove+promote swaps.
// Apple links + preview URLs are resolved client-side at publish time (iTunes
// Search is keyless but throttles bursts per IP — a phone resolving ~32 tracks
// is fine, one function instance doing it for every bracket is not).
//
// verify_jwt is on (see config.toml) so only authenticated members can call it.
//
// Returns 200 { results, source } on success ({ count, artists } for probes);
// { ok:false, message } with a 4xx/5xx for misconfig/upstream errors.

import { tagTopTracks, trackPlaycount } from '../_shared/lastfm.ts'
import {
  acquireSpotifyBudget,
  benchSpotifyGlobally,
  cacheGetTracks,
  cachePutTracks,
  guardFromEnv,
  type CachedTrack,
} from '../_shared/spotifyGuard.ts'

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

// One seeded candidate, ordered best-first. playcount is Last.fm scrobbles
// (0 when ranking fell back to Spotify popularity, or the tag track is unknown
// to track.getInfo). artist is set in theme mode only — artist brackets carry
// it on the bracket itself.
interface BracketCandidate {
  title: string
  album: string
  artworkUrl: string
  spotifyUrl: string
  spotifyId: string
  playcount: number
  artist?: string
}

const MAX_CANDIDATES = 74 // 64-bracket + ~10 alternates for remove+promote

// ── Spotify app token (same client-credentials cache as spotify-search) ──

let cachedToken: { value: string; expiresAt: number } | null = null

async function getAppToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`Spotify token request failed (${res.status}): ${snippet}`)
  }
  const tok = await res.json()
  cachedToken = { value: tok.access_token, expiresAt: Date.now() + (tok.expires_in - 60) * 1000 }
  return cachedToken.value
}

// 429 circuit breaker (same rationale as spotify-search): a benched dev-mode
// app can be locked out for hours, and resolveAll's per-title error swallowing
// would otherwise keep firing ~100 futile searches per creation attempt.
let benchedUntil = 0

function spotifyBenched(): boolean {
  return Date.now() < benchedUntil
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Two kinds of 429: a rolling-limit BLIP (Retry-After of seconds — normal at
// sustained concurrency; wait it out and retry, or a seeding silently loses
// every in-flight title, which cost "90s hip hop" ~30 tracks on 2026-07-12)
// vs an EXTENDED penalty (Retry-After of hours — persist the global bench and
// fail fast).
const BLIP_MAX_SECS = 60

async function spotifyGet(path: string, token: string, attempt = 0): Promise<any> {
  if (spotifyBenched()) {
    const waitMs = benchedUntil - Date.now()
    if (attempt === 0 && waitMs <= BLIP_MAX_SECS * 1000) {
      await sleep(waitMs + 250)
      return spotifyGet(path, token, 1)
    }
    throw new Error('Spotify is rate-limited — benched')
  }
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) {
    const ra = Number(res.headers.get('Retry-After') ?? 5)
    const secs = Math.min(Number.isFinite(ra) ? ra : 5, 86400)
    benchedUntil = Date.now() + secs * 1000
    if (secs > BLIP_MAX_SECS) {
      // Persist so every worker of every function backs off, not just this one.
      benchSpotifyGlobally(guardFromEnv(), secs)
    } else if (attempt === 0) {
      await sleep(secs * 1000 + 250)
      return spotifyGet(path, token, 1)
    }
  }
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`Spotify request failed (${res.status}) ${path}: ${snippet}`)
  }
  return res.json()
}

// ── Title normalization / dedupe ──
//
// The same song shows up as "Song", "Song - 2011 Remaster", "Song (Deluxe
// Edition)", "Song (feat. X)" across releases on both APIs. Everything merges
// on a normalized key; live cuts are dropped outright (a bracket of studio
// songs, per the locked design).

const VERSION_TAG =
  /\b(remaster(ed)?|deluxe|anniversary|edition|version|mix|mono|stereo|single|radio edit|extended|bonus track|re-?recorded|taylor'?s version|demo|instrumental|acoustic|edit)\b/i

function isLive(title: string): boolean {
  // "(Live)", "- Live at ...", "[Live 1994]" — but not words like "Alive".
  return /[([\-–]\s*live\b/i.test(title) || /\blive (at|in|from)\b/i.test(title)
}

function normTitle(raw: string): string {
  let t = raw.toLowerCase()
  // Drop bracketed qualifiers that are version/feature tags, keep ones that are
  // part of the actual title (e.g. "(Don't Fear) The Reaper").
  t = t.replace(/[([]([^)\]]*)[)\]]/g, (m, inner) =>
    VERSION_TAG.test(inner) || /\b(feat|ft|with)\b/i.test(inner) ? '' : m,
  )
  // Trailing " - 2011 Remaster" style suffixes.
  const dash = t.split(/\s+[-–]\s+/)
  if (dash.length > 1 && dash.slice(1).every((part) => VERSION_TAG.test(part) || /\d{4}/.test(part))) {
    t = dash[0]
  }
  return t
    .replace(/[’'"!?.,:;*]/g, '')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Last.fm ranking ──

async function lastfmTopTracks(
  apiKey: string,
  artist: string,
): Promise<{ title: string; playcount: number }[]> {
  const out: { title: string; playcount: number }[] = []
  // Two pages of 100 gives plenty of headroom past dedupe losses.
  for (let page = 1; page <= 2; page++) {
    const url =
      `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&format=json&autocorrect=1` +
      `&limit=100&page=${page}&artist=${encodeURIComponent(artist)}&api_key=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) break
    const payload = await res.json().catch(() => null)
    const tracks = payload?.toptracks?.track
    if (!Array.isArray(tracks) || tracks.length === 0) break
    for (const t of tracks) {
      const title = String(t?.name ?? '').trim()
      const playcount = Number(t?.playcount ?? 0)
      if (title) out.push({ title, playcount })
    }
    if (tracks.length < 100) break
  }
  return out
}

// ── Spotify resolution via /search ──
//
// This Spotify app runs in the post-2025 restricted dev mode: batch endpoints
// (/albums?ids=, /tracks?ids=), /top-tracks, and large page limits are all
// blocked. /search still works (it's what spotify-search relies on daily), so
// both the per-title link resolution and the no-Last.fm fallback go through it.

interface ResolvedTrack {
  id: string
  title: string
  norm: string
  album: string
  albumType: string // 'album' | 'single' | 'compilation'
  releaseDate: string
  artworkUrl: string
  spotifyUrl: string
  popularity: number
}

function pickArtwork(images: { url: string; width: number | null }[] = []): string {
  if (!images.length) return ''
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  return (sorted.find((i) => (i.width ?? 0) >= 200) ?? sorted[0]).url
}

// Prefer the canonical release of a duplicated track: album over single over
// compilation, then the earliest release (originals beat greatest-hits).
function releaseRank(t: ResolvedTrack): number {
  return { album: 0, single: 1, compilation: 2 }[t.albumType] ?? 3
}

function betterRelease(a: ResolvedTrack, b: ResolvedTrack): ResolvedTrack {
  if (releaseRank(a) !== releaseRank(b)) return releaseRank(a) < releaseRank(b) ? a : b
  return a.releaseDate <= b.releaseDate ? a : b
}

function fromSearchItem(t: any): ResolvedTrack | null {
  if (!t?.id || !t?.name) return null
  return {
    id: t.id,
    title: t.name,
    norm: normTitle(t.name),
    album: t.album?.name ?? '',
    albumType: t.album?.album_type ?? 'album',
    releaseDate: String(t.album?.release_date ?? '9999'),
    artworkUrl: pickArtwork(t.album?.images),
    spotifyUrl: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    popularity: Number(t.popularity ?? 0),
  }
}

function byThisArtist(t: any, artistId: string, artistName: string): boolean {
  const lc = artistName.toLowerCase()
  return (t?.artists ?? []).some((a: any) => a?.id === artistId || a?.name?.toLowerCase() === lc)
}

// Resolve one Last.fm title to its canonical Spotify track. Null when nothing
// by this artist matches (the candidate is then skipped).
async function resolveTrack(
  title: string,
  artistId: string,
  artistName: string,
  token: string,
): Promise<ResolvedTrack | null> {
  const clean = title.replace(/"/g, '')
  const q = encodeURIComponent(`track:"${clean}" artist:"${artistName.replace(/"/g, '')}"`)
  const payload = await spotifyGet(`/search?type=track&limit=5&q=${q}`, token)
  const want = normTitle(title)
  const hits = (payload?.tracks?.items ?? [])
    .filter((t: any) => byThisArtist(t, artistId, artistName))
    .map(fromSearchItem)
    .filter((t: ResolvedTrack | null): t is ResolvedTrack => !!t && !isLive(t.title) && !isLive(t.album))
  if (!hits.length) return null
  // Exact normalized-title matches first, then the most canonical release.
  const exact = hits.filter((t: ResolvedTrack) => t.norm === want)
  const pool = exact.length ? exact : hits
  return pool.reduce((a: ResolvedTrack, b: ResolvedTrack) => betterRelease(a, b))
}

// ── Cache-first, budget-checked resolution (both modes) ──
//
// After the 2026-07-12 outage (a ~150-search burst benched the whole dev-mode
// app for ~18h), resolution goes through three gates:
//   1. spotify_track_cache — resolutions never change, and tag fields repeat
//      across clubs, so repeat seedings cost ~zero searches.
//   2. spotify_acquire — a shared hourly budget; only cache-unknown titles
//      cost budget, and a denied acquire fails the seeding cleanly instead of
//      bursting past Spotify's penalty threshold.
//   3. concurrency 3 (was 6) — half the burst rate; the creation screen's
//      building state absorbs the slower seeding.

interface ResolveItem {
  title: string
  artist: string // the search artist (bracket artist in artist mode)
  playcount?: number // artist mode: known from Last.fm merge
}

const cacheKey = (t: ResolveItem) => `${normArtist(t.artist)}|${normTitle(t.title)}`

// Resolve cache-unknown items via /search. Returns ATTEMPTED outcomes only:
// hit → candidate, confirmed no-match → null (cached as a miss so it's never
// searched again), transient error / dupe / unattempted → absent.
async function resolveMisses(
  items: ResolveItem[],
  needed: number,
  artistId: string,
  token: string,
  alreadySeenIds: Set<string>,
  withArtist: boolean,
): Promise<Map<string, BracketCandidate | null>> {
  const outcomes = new Map<string, BracketCandidate | null>()
  const seenIds = new Set<string>(alreadySeenIds)
  const seenNorms = new Set<string>()
  let next = 0
  let resolved = 0
  const worker = async () => {
    while (next < items.length && resolved < needed + 6) {
      const i = next++
      const t = items[i]
      try {
        const hit = await resolveTrack(t.title, artistId, t.artist, token)
        if (!hit) {
          outcomes.set(cacheKey(t), null)
          continue
        }
        const normKey = `${normArtist(t.artist)}|${hit.norm}`
        if (seenIds.has(hit.id) || seenNorms.has(normKey)) continue // dupe of another entry — not a miss
        seenIds.add(hit.id)
        seenNorms.add(normKey)
        resolved++
        outcomes.set(cacheKey(t), {
          title: hit.title,
          album: hit.album,
          artworkUrl: hit.artworkUrl,
          spotifyUrl: hit.spotifyUrl,
          spotifyId: hit.id,
          playcount: t.playcount ?? 0,
          ...(withArtist ? { artist: t.artist } : {}),
        })
      } catch {
        // Transient error — skip, and do NOT cache-poison it as a miss.
      }
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker))
  return outcomes
}

function toCacheRows(outcomes: Map<string, BracketCandidate | null>): CachedTrack[] {
  return [...outcomes].map(([key, c]) =>
    c
      ? {
          key,
          miss: false,
          spotify_id: c.spotifyId,
          title: c.title,
          album: c.album,
          artwork_url: c.artworkUrl || null,
          spotify_url: c.spotifyUrl || null,
        }
      : { key, miss: true, spotify_id: '', title: '', album: '', artwork_url: null, spotify_url: null },
  )
}

// Build the seeded field for ranked items: cache first, then budget-metered
// live resolution of the unknowns, merged back in rank order. denied=true
// means the budget/bench blocked live resolution (the field may still be
// complete from cache alone).
async function resolveField(opts: {
  items: ResolveItem[]
  target: number
  artistId: string
  withArtist: boolean
  getToken: () => Promise<string>
}): Promise<{ results: BracketCandidate[]; denied: boolean }> {
  const { target, artistId, withArtist, getToken } = opts
  const guard = guardFromEnv()
  const items = opts.items.slice(0, target + 40) // don't chase a miss-heavy tail forever
  const cached = await cacheGetTracks(guard, items.map(cacheKey))
  const cachedHitCount = [...cached.values()].filter((c) => !c.miss).length
  const unknown = items.filter((t) => !cached.has(cacheKey(t)))

  let denied = false
  let resolvedNew = new Map<string, BracketCandidate | null>()
  if (unknown.length > 0 && cachedHitCount < target) {
    if (spotifyBenched()) {
      denied = true
    } else {
      const verdict = await acquireSpotifyBudget(guard, unknown.length)
      const granted = verdict.ok ? verdict.granted ?? unknown.length : 0
      // Partial grant: resolve the best-ranked slice the window allows — a
      // smaller field beats no field. denied flags any shortfall so the
      // handler can explain when the result is too thin to play.
      denied = granted < unknown.length
      if (granted > 0) {
        const token = await getToken()
        const hitIds = new Set(
          [...cached.values()].filter((c) => !c.miss && c.spotify_id).map((c) => c.spotify_id),
        )
        resolvedNew = await resolveMisses(
          unknown.slice(0, granted),
          Math.max(0, target - cachedHitCount),
          artistId,
          token,
          hitIds,
          withArtist,
        )
        cachePutTracks(guard, toCacheRows(resolvedNew))
      }
    }
  }

  // Merge in rank order, dedupe by Spotify id across cache + fresh.
  const out: BracketCandidate[] = []
  const seenIds = new Set<string>()
  for (const t of items) {
    if (out.length >= target) break
    const key = cacheKey(t)
    const c = cached.get(key)
    if (c) {
      if (!c.miss && c.spotify_id && !seenIds.has(c.spotify_id)) {
        seenIds.add(c.spotify_id)
        out.push({
          title: c.title,
          album: c.album,
          artworkUrl: c.artwork_url ?? '',
          spotifyUrl: c.spotify_url ?? '',
          spotifyId: c.spotify_id,
          playcount: t.playcount ?? 0,
          ...(withArtist ? { artist: t.artist } : {}),
        })
      }
      continue
    }
    const fresh = resolvedNew.get(key)
    if (fresh && !seenIds.has(fresh.spotifyId)) {
      seenIds.add(fresh.spotifyId)
      out.push(fresh)
    }
  }
  return { results: out, denied }
}

// Display playcounts for theme candidates (Last.fm, unaffected by any Spotify
// bench). Small pool; a failed lookup just leaves 0.
async function attachPlaycounts(cands: BracketCandidate[], lastfmKey: string): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < cands.length) {
      const c = cands[next++]
      if (!c.artist) continue
      const plays = await trackPlaycount(lastfmKey, c.title, c.artist).catch(() => null)
      c.playcount = plays?.playcount ?? 0
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
}

// No-Last.fm fallback: page artist:"name" searches (10 per page — dev mode
// rejects bigger limits) and rank this artist's deduped tracks by popularity.
async function popularityRanked(
  artistId: string,
  artistName: string,
  token: string,
): Promise<BracketCandidate[]> {
  const byNorm = new Map<string, ResolvedTrack>()
  const q = encodeURIComponent(`artist:"${artistName.replace(/"/g, '')}"`)
  for (let offset = 0; offset < 100; offset += 10) {
    const payload = await spotifyGet(`/search?type=track&limit=10&offset=${offset}&q=${q}`, token)
    const items = payload?.tracks?.items ?? []
    for (const raw of items) {
      if (!byThisArtist(raw, artistId, artistName)) continue
      const t = fromSearchItem(raw)
      if (!t || !t.norm || isLive(t.title) || isLive(t.album)) continue
      const existing = byNorm.get(t.norm)
      if (!existing) byNorm.set(t.norm, t)
      else if (t.popularity > existing.popularity) byNorm.set(t.norm, t)
      else if (t.popularity === existing.popularity) byNorm.set(t.norm, betterRelease(existing, t))
    }
    if (items.length < 10) break
  }
  return [...byNorm.values()]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, MAX_CANDIDATES)
    .map((t) => ({
      title: t.title,
      album: t.album,
      artworkUrl: t.artworkUrl,
      spotifyUrl: t.spotifyUrl,
      spotifyId: t.id,
      playcount: 0,
    }))
}

// ── Theme (tag) mode ──

const PER_ARTIST_CAP = 2 // a narrow tag shouldn't collapse into an artist bracket

function normArtist(raw: string): string {
  return raw.toLowerCase().replace(/[’'"!?.,:;*]/g, '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim()
}

// The tag's ranked field after dedupe, live-cut filtering, and the per-artist
// cap. Rank order (tag relevance) is the seeding order — locked design.
async function tagCandidateTitles(
  lastfmKey: string,
  tag: string,
): Promise<{ title: string; artist: string }[]> {
  const ranked = await tagTopTracks(lastfmKey, tag)
  const out: { title: string; artist: string }[] = []
  const seen = new Set<string>()
  const perArtist = new Map<string, number>()
  for (const t of ranked) {
    if (isLive(t.title)) continue
    const titleKey = normTitle(t.title)
    const artistKey = normArtist(t.artist)
    if (!titleKey || !artistKey) continue
    const key = `${artistKey}|${titleKey}`
    if (seen.has(key)) continue
    const used = perArtist.get(artistKey) ?? 0
    if (used >= PER_ARTIST_CAP) continue
    seen.add(key)
    perArtist.set(artistKey, used + 1)
    out.push({ title: t.title, artist: t.artist })
  }
  return out
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
    const lastfmKey = Deno.env.get('LASTFM_API_KEY')
    if (!clientId || !clientSecret) {
      return json({ ok: false, message: 'bracket-seed is missing SPOTIFY_CLIENT_ID/SECRET' }, 500)
    }

    let artistId = ''
    let artistName = ''
    let tag = ''
    let probe = false
    try {
      const body = await req.json()
      artistId = String(body?.artistId ?? '').trim()
      artistName = String(body?.artistName ?? '').trim()
      tag = String(body?.tag ?? '').trim()
      probe = body?.probe === true
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }

    // Theme mode: the tag IS the ranking source — no Spotify-popularity
    // fallback (a tag Last.fm doesn't know has no honest field to build).
    if (tag) {
      if (tag.length > 100) return json({ ok: false, message: 'Theme is too long' }, 400)
      if (!lastfmKey) return json({ ok: false, message: 'bracket-seed is missing LASTFM_API_KEY' }, 500)
      const titles = await tagCandidateTitles(lastfmKey, tag)
      if (probe) {
        // Cheap viability check for the debounced input: how deep is the
        // field, and who headlines it (first distinct artists in rank order).
        // No Spotify calls, so a bench doesn't block probing.
        const artists: string[] = []
        for (const t of titles) {
          if (!artists.includes(t.artist)) artists.push(t.artist)
          if (artists.length >= 4) break
        }
        return json({ count: titles.length, artists })
      }
      const field = await resolveField({
        items: titles,
        target: MAX_CANDIDATES,
        artistId: '',
        withArtist: true,
        getToken: () => getAppToken(clientId, clientSecret),
      })
      // A bench/budget shortfall only matters if the result is too thin to play.
      if (field.denied && field.results.length < 16) {
        return json({ ok: false, message: 'Spotify is cooling down from a rate limit — try again later.' }, 503)
      }
      // Tag rank picks WHICH songs make the field; seeding order is all-time
      // plays. (Originally seeded by tag rank, but Last.fm's ordering is
      // erratic for broad tags — "90s hip hop" ranked MC Breed over Biggie —
      // and seeds that ignore the visible playcounts read as a bug. Decided
      // with Jordan 2026-07-12.)
      await attachPlaycounts(field.results, lastfmKey)
      field.results.sort((a, b) => b.playcount - a.playcount)
      return json({ results: field.results, source: 'lastfm-tag' })
    }

    if (!artistId || !artistName) {
      return json({ ok: false, message: 'artistId and artistName are required' }, 400)
    }

    const ranked = lastfmKey ? await lastfmTopTracks(lastfmKey, artistName) : []

    // Merge Last.fm's list on the normalized key (playcounts of variants sum —
    // "Song" and "Song - Remastered" are the same song's listens; the first
    // occurrence keeps the display title) and drop live cuts.
    const merged = new Map<string, { title: string; playcount: number }>()
    for (const t of ranked) {
      if (isLive(t.title)) continue
      const key = normTitle(t.title)
      if (!key) continue
      const existing = merged.get(key)
      if (existing) existing.playcount += t.playcount
      else merged.set(key, { title: t.title, playcount: t.playcount })
    }
    const titles = [...merged.values()].sort((a, b) => b.playcount - a.playcount)

    // Resolve the ranked titles to Spotify tracks (links + artwork). Titles
    // that don't resolve are skipped and lower-ranked ones fill in.
    if (titles.length >= 16) {
      const field = await resolveField({
        items: titles.map((t) => ({ title: t.title, artist: artistName, playcount: t.playcount })),
        target: MAX_CANDIDATES,
        artistId,
        withArtist: false,
        getToken: () => getAppToken(clientId, clientSecret),
      })
      if (field.results.length >= 16) {
        return json({ results: field.results, source: 'lastfm' })
      }
      if (field.denied) {
        return json({ ok: false, message: 'Spotify is cooling down from a rate limit — try again later.' }, 503)
      }
    }

    // Thin Last.fm data (or no key): rank this artist's searchable tracks by
    // Spotify popularity so a bracket can still be built. ~10 paged searches.
    if (spotifyBenched()) {
      return json({ ok: false, message: 'Spotify is cooling down from a rate limit — try again later.' }, 503)
    }
    const fbBudget = await acquireSpotifyBudget(guardFromEnv(), 10)
    if (!fbBudget.ok) {
      return json({ ok: false, message: 'Spotify is cooling down from a rate limit — try again later.' }, 503)
    }
    const token = await getAppToken(clientId, clientSecret)
    const fallback = await popularityRanked(artistId, artistName, token)
    return json({ results: fallback, source: 'spotify' })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
