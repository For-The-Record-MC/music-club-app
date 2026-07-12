// Shared Last.fm helpers for the Edge Functions (track-stats, bracket-seed).
// Pure HTTP against ws.audioscrobbler.com; callers hold LASTFM_API_KEY.

const BASE = 'https://ws.audioscrobbler.com/2.0/?format=json&autocorrect=1'

/** Global all-time playcount (and listeners) for one track, or null when
 * Last.fm doesn't know it. Spotify metadata vs Last.fm's catalog: Spotify
 * joins every collaborator into one artist string ("mgk, blackbear") and
 * decorates titles with "(feat. …)" / "- Acoustic" etc.; Last.fm indexes by
 * primary artist and clean title. Look up the cleaned pair first, fall back to
 * the raw one, and keep whichever found the bigger count (a tiny count on a
 * decorated title usually means some obscure alias). */
export async function trackPlaycount(
  apiKey: string,
  title: string,
  artist: string,
): Promise<{ playcount: number; listeners: number | null } | null> {
  const primaryArtist = artist.split(',')[0].trim()
  const cleanTitle =
    title
      .replace(/\s*[([](?:feat|ft|with)\.?[^)\]]*[)\]]/gi, '')
      .replace(/\s+-\s+.*$/i, '')
      .trim() || title

  const lookup = async (t: string, a: string) => {
    const url =
      `${BASE}&method=track.getInfo&api_key=${apiKey}` +
      `&track=${encodeURIComponent(t)}&artist=${encodeURIComponent(a)}`
    const res = await fetch(url)
    if (!res.ok) return null
    const track = (await res.json())?.track
    const playcount = track?.playcount != null ? Number(track.playcount) : null
    const listeners = track?.listeners != null ? Number(track.listeners) : null
    if (!Number.isFinite(playcount as number)) return null
    return {
      playcount: playcount as number,
      listeners: Number.isFinite(listeners as number) ? listeners : null,
    }
  }

  const cleaned = await lookup(cleanTitle, primaryArtist)
  const raw =
    cleanTitle !== title || primaryArtist !== artist ? await lookup(title, artist) : null
  return (cleaned?.playcount ?? -1) >= (raw?.playcount ?? -1) ? cleaned : raw
}

/** Top tracks for a tag (genre/decade/mood), in Last.fm's tag-relevance rank
 * order. tag.getTopTracks carries no playcounts (unlike artist.getTopTracks) —
 * callers wanting counts fetch them per track via trackPlaycount. */
export async function tagTopTracks(
  apiKey: string,
  tag: string,
  pages = 2,
): Promise<{ title: string; artist: string }[]> {
  const out: { title: string; artist: string }[] = []
  for (let page = 1; page <= pages; page++) {
    const url =
      `${BASE}&method=tag.gettoptracks&api_key=${apiKey}` +
      `&limit=100&page=${page}&tag=${encodeURIComponent(tag)}`
    const res = await fetch(url)
    if (!res.ok) break
    const payload = await res.json().catch(() => null)
    const tracks = payload?.tracks?.track
    if (!Array.isArray(tracks) || tracks.length === 0) break
    for (const t of tracks) {
      const title = String(t?.name ?? '').trim()
      const artist = String(t?.artist?.name ?? '').trim()
      if (title && artist) out.push({ title, artist })
    }
    if (tracks.length < 100) break
  }
  return out
}
