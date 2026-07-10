// Shared Apple Music API helpers for the Edge Functions (apple-music, and
// later the playlist-sync Apple branch). Pure HTTP + token minting — no
// Supabase/DB logic here; callers own persistence. Mirrors _shared/spotify.ts.
//
// Auth model: catalog endpoints (search, ISRC/UPC lookup) need only the
// *developer token* — an ES256 JWT self-signed with the MusicKit .p8 key
// (APPLE_TEAM_ID / APPLE_MUSIC_KEY_ID / APPLE_MUSIC_PRIVATE_KEY secrets).
// Library/playlist endpoints additionally need the bot's Music User Token
// (Phase 3, paid tier) — not handled here yet.

const STOREFRONT = 'us'
const API = 'https://api.music.apple.com/v1'

export interface AppleTrackMatch {
  apple_url: string
  apple_song_id: string
  isrc: string | null
  preview_url: string | null
}

export interface AppleAlbumMatch {
  apple_url: string
  apple_album_id: string
  upc: string | null
}

// Module-scoped developer-token cache. Edge Function instances are reused
// across requests; the JWT is valid for hours, so mint once and reuse.
let cachedToken: { value: string; expiresAt: number } | null = null

const b64url = (data: Uint8Array | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Mint (or return cached) Apple Music developer token — an ES256 JWT signed
 * with the MusicKit private key. WebCrypto ECDSA emits raw r||s signatures,
 * which is exactly the JWS format, so no DER conversion is needed. */
export async function getDeveloperToken(
  teamId: string,
  keyId: string,
  privateKeyPem: string,
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const now = Math.floor(Date.now() / 1000)
  const ttl = 12 * 60 * 60 // 12h; Apple allows up to 6 months
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const payload = b64url(JSON.stringify({ iss: teamId, iat: now, exp: now + ttl }))
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  const token = `${header}.${payload}.${b64url(new Uint8Array(signature))}`
  // Refresh an hour early to avoid using a just-expired token.
  cachedToken = { value: token, expiresAt: Date.now() + (ttl - 3600) * 1000 }
  return token
}

async function catalogGet(token: string, path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 429) throw new Error('Apple Music rate limited (429)')
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`Apple Music GET ${path} failed (${res.status}): ${snippet}`)
  }
  return res.json()
}

function toTrackMatch(song: any): AppleTrackMatch | null {
  const a = song?.attributes
  if (!song?.id || !a?.url) return null
  return {
    apple_url: a.url,
    apple_song_id: String(song.id),
    isrc: a.isrc ?? null,
    preview_url: a.previews?.[0]?.url ?? null,
  }
}

/** Exact-match a track by ISRC. An ISRC can map to several catalog entries
 * (same recording on multiple releases); prefer the first, which Apple ranks
 * by canonical release. */
export async function trackByIsrc(token: string, isrc: string): Promise<AppleTrackMatch | null> {
  const j = await catalogGet(
    token,
    `/catalog/${STOREFRONT}/songs?filter[isrc]=${encodeURIComponent(isrc)}`,
  )
  return toTrackMatch(j?.data?.[0])
}

/** Fallback text search when no ISRC is available or the exact lookup missed. */
export async function searchTrack(
  token: string,
  title: string,
  artist: string,
): Promise<AppleTrackMatch | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim()
  if (!term) return null
  const j = await catalogGet(
    token,
    `/catalog/${STOREFRONT}/search?types=songs&limit=1&term=${encodeURIComponent(term)}`,
  )
  return toTrackMatch(j?.results?.songs?.data?.[0])
}

function toAlbumMatch(album: any): AppleAlbumMatch | null {
  const a = album?.attributes
  if (!album?.id || !a?.url) return null
  return {
    apple_url: a.url,
    apple_album_id: String(album.id),
    upc: a.upc ?? null,
  }
}

/** Exact-match an album by UPC (Spotify albums carry it in external_ids). */
export async function albumByUpc(token: string, upc: string): Promise<AppleAlbumMatch | null> {
  const j = await catalogGet(
    token,
    `/catalog/${STOREFRONT}/albums?filter[upc]=${encodeURIComponent(upc)}`,
  )
  return toAlbumMatch(j?.data?.[0])
}

export async function searchAlbum(
  token: string,
  title: string,
  artist: string,
): Promise<AppleAlbumMatch | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim()
  if (!term) return null
  const j = await catalogGet(
    token,
    `/catalog/${STOREFRONT}/search?types=albums&limit=1&term=${encodeURIComponent(term)}`,
  )
  return toAlbumMatch(j?.results?.albums?.data?.[0])
}
