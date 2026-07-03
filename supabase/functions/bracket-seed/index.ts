// bracket-seed — Edge Function that builds the Track Madness candidate list.
//
// Given an artist (Spotify id + name), returns their most-played songs ranked
// for bracket seeding. Spotify's own top-tracks endpoint caps at 10 and exposes
// no play counts, so ranking comes from Last.fm's artist.getTopTracks (real
// all-time scrobble counts, secret LASTFM_API_KEY); each ranked title is then
// matched against the artist's Spotify catalog for links + artwork. When
// Last.fm has thin data for an artist, ranking falls back to Spotify's
// popularity score across the catalog.
//
// Returns more candidates than the largest bracket (64 + alternates) so the
// creation screen can enable/disable sizes and offer remove+promote swaps.
// Apple links + preview URLs are resolved client-side at publish time (iTunes
// Search is keyless but throttles bursts per IP — a phone resolving ~32 tracks
// is fine, one function instance doing it for every bracket is not).
//
// verify_jwt is on (see config.toml) so only authenticated members can call it.
//
// Returns 200 { results, source } on success; { ok:false, message } with a
// 4xx/5xx for misconfig/upstream errors.

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
// (0 when ranking fell back to Spotify popularity).
interface BracketCandidate {
  title: string
  album: string
  artworkUrl: string
  spotifyUrl: string
  spotifyId: string
  playcount: number
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

async function spotifyGet(path: string, token: string): Promise<any> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
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

// Resolve titles with a small concurrency pool, preserving rank order, until
// `target` have resolved (misses are skipped, later titles fill the gaps).
async function resolveAll(
  titles: { title: string; playcount: number }[],
  target: number,
  artistId: string,
  artistName: string,
  token: string,
): Promise<BracketCandidate[]> {
  const out: (BracketCandidate | null)[] = new Array(titles.length).fill(null)
  const seen = new Set<string>() // resolved spotify ids + norms — two Last.fm titles can hit one track
  let next = 0
  let resolved = 0
  const worker = async () => {
    while (next < titles.length && resolved < target + 6) {
      const i = next++
      const t = titles[i]
      try {
        const hit = await resolveTrack(t.title, artistId, artistName, token)
        if (hit && !seen.has(hit.id) && !seen.has(hit.norm)) {
          seen.add(hit.id)
          seen.add(hit.norm)
          resolved++
          out[i] = {
            title: hit.title,
            album: hit.album,
            artworkUrl: hit.artworkUrl,
            spotifyUrl: hit.spotifyUrl,
            spotifyId: hit.id,
            playcount: t.playcount,
          }
        }
      } catch {
        // One bad search shouldn't sink the seeding — skip the candidate.
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return out.filter((c): c is BracketCandidate => c !== null).slice(0, target)
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
    try {
      const body = await req.json()
      artistId = String(body?.artistId ?? '').trim()
      artistName = String(body?.artistName ?? '').trim()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (!artistId || !artistName) {
      return json({ ok: false, message: 'artistId and artistName are required' }, 400)
    }

    const token = await getAppToken(clientId, clientSecret)
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
      const fromLastfm = await resolveAll(titles, MAX_CANDIDATES, artistId, artistName, token)
      if (fromLastfm.length >= 16) {
        return json({ results: fromLastfm, source: 'lastfm' })
      }
    }

    // Thin Last.fm data (or no key): rank this artist's searchable tracks by
    // Spotify popularity so a bracket can still be built.
    const fallback = await popularityRanked(artistId, artistName, token)
    return json({ results: fallback, source: 'spotify' })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})
