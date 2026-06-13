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
}

// Module-scoped client-credentials token cache. Edge Function instances are
// reused across requests, so this avoids re-minting a token every search.
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
    try {
      const body = await req.json()
      term = String(body?.term ?? '').trim()
    } catch {
      return json({ ok: false, message: 'Invalid request body' }, 400)
    }
    if (term.length < 1) return json({ results: [] })

    const token = await getAppToken(clientId, clientSecret)
    const url = `https://api.spotify.com/v1/search?type=track&limit=10&q=${encodeURIComponent(term)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401) {
      // Token went stale unexpectedly — drop cache and retry once.
      cachedToken = null
      const fresh = await getAppToken(clientId, clientSecret)
      const retry = await fetch(url, { headers: { Authorization: `Bearer ${fresh}` } })
      if (!retry.ok) return json({ ok: false, message: `Spotify search failed (${retry.status})` }, 502)
      return json({ results: normalize(await retry.json()) })
    }
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 300)
      return json({ ok: false, message: `Spotify search failed (${res.status}): ${snippet}` }, 502)
    }
    return json({ results: normalize(await res.json()) })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500)
  }
})

function normalize(payload: any): SpotifySong[] {
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
    }))
}
