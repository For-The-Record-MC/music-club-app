// Shared Spotify guardrails for the Edge Functions (spotify-search,
// bracket-seed), backed by the spotify_api_state / spotify_track_cache tables
// (see the 20260712110000 migration for the outage story).
//
// Everything here FAILS OPEN: if the guard infrastructure itself errors, the
// caller proceeds and the callers' in-memory breakers remain the backstop —
// guard downtime must never take Spotify features down with it.

export interface Guard {
  url: string
  key: string
}

export function guardFromEnv(): Guard | null {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return url && key ? { url, key } : null
}

async function rpc(g: Guard, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${g.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: g.key,
      Authorization: `Bearer ${g.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${fn} failed (${res.status})`)
  // 204 (void RPCs) has no body.
  return res.status === 204 ? null : res.json()
}

export interface BudgetVerdict {
  ok: boolean
  granted?: number // may be less than requested — resolve what the window allows
  reason?: 'benched' | 'budget'
  until?: string
}

/** Reserve up to `calls` from the shared hourly budget (partial grants).
 * Fails open with a full grant. */
export async function acquireSpotifyBudget(g: Guard | null, calls: number): Promise<BudgetVerdict> {
  if (!g || calls <= 0) return { ok: true, granted: calls }
  try {
    const v = (await rpc(g, 'spotify_acquire', { p_calls: calls })) as BudgetVerdict
    if (!v || typeof v.ok !== 'boolean') return { ok: true, granted: calls }
    if (v.ok && typeof v.granted !== 'number') v.granted = calls // pre-v2 RPC shape
    return v
  } catch {
    return { ok: true, granted: calls }
  }
}

/** Persist a 429 bench so every worker of every function backs off. Best effort. */
export function benchSpotifyGlobally(g: Guard | null, seconds: number): void {
  if (!g) return
  rpc(g, 'spotify_bench', { p_seconds: Math.ceil(seconds) }).catch(() => {})
}

export interface CachedTrack {
  key: string
  miss: boolean
  spotify_id: string
  title: string
  album: string
  artwork_url: string | null
  spotify_url: string | null
}

/** Bulk-read cached resolutions. Missing keys are simply absent. Fails open (empty). */
export async function cacheGetTracks(g: Guard | null, keys: string[]): Promise<Map<string, CachedTrack>> {
  const out = new Map<string, CachedTrack>()
  if (!g || keys.length === 0) return out
  try {
    const rows = (await rpc(g, 'spotify_cache_get', { p_keys: keys })) as CachedTrack[]
    for (const r of rows ?? []) if (r?.key) out.set(r.key, r)
  } catch {
    // fail open — the caller just resolves everything live
  }
  return out
}

/** Bulk-write resolutions (hits and attempted misses). Best effort. */
export function cachePutTracks(g: Guard | null, rows: CachedTrack[]): void {
  if (!g || rows.length === 0) return
  rpc(g, 'spotify_cache_put', { p_rows: rows }).catch(() => {})
}
