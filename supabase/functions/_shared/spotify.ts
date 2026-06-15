// Shared Spotify Web API helpers for the Edge Functions (spotify-oauth,
// spotify-sync). Pure HTTP — no Supabase/DB logic here; callers own persistence.
// Supabase bundles files imported from functions/_shared at deploy time.

export interface SpotifyTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

/** Authorization Code → tokens (initial connect). */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<SpotifyTokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Token exchange failed (${res.status}): ${snippet}`);
  }
  return res.json();
}

/** Refresh an expired access token. Spotify may omit a new refresh_token. */
export async function refreshTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<SpotifyTokens> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Token refresh failed (${res.status}): ${snippet}`);
  }
  return res.json();
}

export async function getMe(accessToken: string): Promise<{ id: string; display_name: string | null }> {
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify /me failed (${res.status})`);
  const j = await res.json();
  return { id: j.id, display_name: j.display_name ?? null };
}

// NOTE: use /me/playlists, NOT /users/{id}/playlists — the latter currently
// returns 403 Forbidden even with a valid token + playlist-modify-public scope,
// while /me/playlists (the current user's) works. Same result, no user id needed.
export async function createPlaylist(
  accessToken: string,
  name: string,
  description: string,
): Promise<{ id: string; url: string }> {
  const res = await fetch('https://api.spotify.com/v1/me/playlists', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, public: true }),
  });
  if (!res.ok) {
    const snippet = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Create playlist failed (${res.status}): ${snippet}`);
  }
  const j = await res.json();
  return { id: j.id, url: j.external_urls?.spotify ?? '' };
}

/** Append track URIs to a playlist (max 100 per call).
 * Uses /items — Spotify replaced the old /tracks add endpoint on 2026-02-11
 * (the old path now 403s "Forbidden" even with the right scope). */
export async function addTracks(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: batch }),
    });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Add tracks failed (${res.status}): ${snippet}`);
    }
  }
}

/** Remove every occurrence of the given track URIs from a playlist (max 100 per
 * call). Uses the /items DELETE endpoint — the classic /tracks path is
 * deprecated and 403s, the same migration addTracks made for POST. Note /items
 * takes an `items` array (not `tracks`) of { uri } objects. */
export async function removeTracks(
  accessToken: string,
  playlistId: string,
  uris: string[],
): Promise<void> {
  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: batch.map((uri) => ({ uri })) }),
    });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Remove tracks failed (${res.status}): ${snippet}`);
    }
  }
}

/** Best-effort track lookup for posts that lack a stored Spotify URI. */
export async function searchTrackUri(
  accessToken: string,
  title: string,
  artist: string,
): Promise<string | null> {
  const q = [title, artist].filter(Boolean).join(' ').trim();
  if (!q) return null;
  const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const j = await res.json();
  return j?.tracks?.items?.[0]?.uri ?? null;
}
