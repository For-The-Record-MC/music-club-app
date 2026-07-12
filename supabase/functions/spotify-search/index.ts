// spotify-search — Edge Function (first in this repo).
//
// Proxies Spotify track search so every club member can search without
// connecting their own account — the same role iTunes Search plays for Apple,
// but Spotify's API needs a token. We use the app-level *client-credentials*
// flow (no user login): the function holds SPOTIFY_CLIENT_ID/SECRET, mints a
// short-lived app token (cached module-wide until it nears expiry), and returns
// a normalized track list shaped like the app's SpotifySong type.
//
// verify_jwt is on (see config.toml) so only authenticated members can call it,
// which keeps our Spotify rate budget from being hit anonymously.
//
// Returns 200 { results } on success; 200 { results: [] } for empty/short
// queries; { ok:false, message } with a 4xx/5xx for misconfig/upstream errors.

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

interface SpotifySong {
  id: string
  uri: string // spotify:track:<id> — what playlist-add needs later
  trackName: string
  artistName: string
  collectionName: string
  artworkUrl: string
  spotifyUrl: string
  durationMs: number | null // Listening Bingo's time gate
  isrc: string | null // captured at pick time so apple-music can exact-match
}

interface SpotifyAlbum {
  id: string
  uri: string // spotify:album:<id>
  collectionName: string
  artistName: string
  artworkUrl: string
  spotifyUrl: string
  year: number | null
}

interface SpotifyArtist {
  id: string
  uri: string // spotify:artist:<id>
  name: string
  imageUrl: string
  spotifyUrl: string
}

type SearchType = 'track' | 'album' | 'artist'

// Module-scoped client-credentials token cache. Edge Function instances are
// reused across requests, so this avoids re-minting a token every search.
let cachedToken: { value: string; expiresAt: number } | null = null

// 429 circuit breaker. Spotify benches the whole dev-mode app when a burst
// trips its extended limit (Retry-After can be many HOURS — seen 2026-07-12
// after a bracket-seeding burst), and continuing to hit the API risks
// extending the bench. Two layers: this in-memory flag (fast path, per warm
// worker) and the shared spotify_api_state row via _shared/spotifyGuard.ts —
// the DB-backed bench + hourly budget that every worker of every function
// consults, so one 429 anywhere backs everything off at once.
import { acquireSpotifyBudget, benchSpotifyGlobally, guardFromEnv } from '../_shared/spotifyGuard.ts'

let benchedUntil = 0

function benchFrom(res: Response): void {
  const ra = Number(res.headers.get('Retry-After') ?? 60)
  const secs = Math.min(Number.isFinite(ra) ? ra : 60, 86400)
  benchedUntil = Date.now() + secs * 1000
  benchSpotifyGlobally(guardFromEnv(), secs)
}

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
  // Refresh a minute early to avoid using a just-expired token.
  cachedToken = { value: tok.access_token, expiresAt: Date.now() + (tok.expires_in - 60) * 1000 }
  return cachedToken.value
}

function pickArtwork(images: { url: string; width: number | null }[] = []): string {
  if (!images.length) return ''
  // Prefer the smallest image >= 200px; else the smallest available.
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  return (sorted.find((i) => (i.width ?? 0) >= 200) ?? sorted[0]).url
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ ok: false, message: 'Method not allowed' }, 405)

    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return json(
        { ok: false, message: 'spotify-search is missing SPOTIFY_CLIENT_ID/SECRET' },
        500,
      )
    }

    let term = ''
    let type: SearchType = 'track'
    try {
      const body = await req.json()
      term = String(body?.term ?? '').trim()
      // type defaults to 'track'; the album picker passes 'album', the Convince
      // Me composer passes 'artist'.
      if (body?.type === 'album') type = 'album'
      else if (body?.type === 'artist') type = 'artist'
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (term.length < 1) return json({ results: [] })

    if (Date.now() < benchedUntil) {
      const secs = Math.ceil((benchedUntil - Date.now()) / 1000)
      return json({ ok: false, message: `Spotify search failed (429) (retry after ${secs}s): benched` }, 502)
    }

    // Shared budget/bench (fails open if the guard itself is down).
    const verdict = await acquireSpotifyBudget(guardFromEnv(), 1)
    if (!verdict.ok) {
      if (verdict.reason === 'benched' && verdict.until) {
        benchedUntil = new Date(verdict.until).getTime() // remember locally too
      }
      return json(
        { ok: false, message: `Spotify search failed (429): ${verdict.reason ?? 'limited'} until ${verdict.until ?? 'soon'}` },
        502,
      )
    }

    const token = await getAppToken(clientId, clientSecret)
    const limit = type === 'track' ? 10 : 8
    const url = `https://api.spotify.com/v1/search?type=${type}&limit=${limit}&q=${encodeURIComponent(term)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      // Token went stale unexpectedly — drop cache and retry once.
      cachedToken = null
      const fresh = await getAppToken(clientId, clientSecret)
      const retry = await fetch(url, { headers: { Authorization: `Bearer ${fresh}` } })
      if (!retry.ok) return json({ ok: false, message: `Spotify search failed (${retry.status})` }, 502)
      return json({ results: normalize(await retry.json(), type) })
    }
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 300)
      // On 429, Retry-After says how long the app token is benched — surface it
      // so an operator can tell a blip from an hours-long penalty.
      const retryAfter = res.status === 429 ? res.headers.get('Retry-After') : null
      if (res.status === 429) benchFrom(res)
      const suffix = retryAfter ? ` (retry after ${retryAfter}s)` : ''
      return json({ ok: false, message: `Spotify search failed (${res.status})${suffix}: ${snippet}` }, 502)
    }
    return json({ results: normalize(await res.json(), type) })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})

function normalize(payload: any, type: SearchType): SpotifySong[] | SpotifyAlbum[] | SpotifyArtist[] {
  if (type === 'artist') {
    const items = payload?.artists?.items ?? []
    return items
      .filter((a: any) => a?.id && a?.name)
      .map((a: any): SpotifyArtist => ({
        id: a.id,
        uri: a.uri ?? `spotify:artist:${a.id}`,
        name: a.name,
        imageUrl: pickArtwork(a.images),
        spotifyUrl: a.external_urls?.spotify ?? '',
      }))
  }
  if (type === 'album') {
    const items = payload?.albums?.items ?? []
    return items
      .filter((a: any) => a?.id && a?.name)
      .map((a: any): SpotifyAlbum => ({
        id: a.id,
        uri: a.uri ?? `spotify:album:${a.id}`,
        collectionName: a.name,
        artistName: (a.artists ?? []).map((ar: any) => ar.name).join(', '),
        artworkUrl: pickArtwork(a.images),
        spotifyUrl: a.external_urls?.spotify ?? '',
        // release_date may be 'YYYY', 'YYYY-MM', or 'YYYY-MM-DD'.
        year: a.release_date ? Number(String(a.release_date).slice(0, 4)) || null : null,
      }))
  }
  const items = payload?.tracks?.items ?? []
  return items
    .filter((t: any) => t?.id && t?.name)
    .map((t: any): SpotifySong => ({
      id: t.id,
      uri: t.uri ?? `spotify:track:${t.id}`,
      trackName: t.name,
      artistName: (t.artists ?? []).map((a: any) => a.name).join(', '),
      collectionName: t.album?.name ?? '',
      artworkUrl: pickArtwork(t.album?.images),
      spotifyUrl: t.external_urls?.spotify ?? '',
      durationMs: typeof t.duration_ms === 'number' ? t.duration_ms : null,
      isrc: t.external_ids?.isrc ?? null,
    }))
}
