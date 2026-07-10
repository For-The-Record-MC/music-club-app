// iTunes Search API — free, keyless, CORS-friendly. Used for album type-ahead
// when the picker sets albums (manual entry remains the fallback).

export interface ItunesAlbum {
  collectionId: number;
  collectionName: string;
  artistName: string;
  artworkUrl: string;
  year: number | null;
  appleUrl: string;
}

export interface ItunesTrack {
  trackNumber: number;
  trackName: string;
}

export async function searchAlbums(term: string): Promise<ItunesAlbum[]> {
  const q = term.trim();
  if (!q) return [];
  const res = await fetch(
    `https://itunes.apple.com/search?media=music&entity=album&limit=8&term=${encodeURIComponent(q)}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results ?? []).map((r: any) => ({
    collectionId: r.collectionId,
    collectionName: r.collectionName,
    artistName: r.artistName,
    // 100x100 thumb → 300x300 for the hero.
    artworkUrl: (r.artworkUrl100 ?? '').replace('100x100', '300x300'),
    year: r.releaseDate ? new Date(r.releaseDate).getFullYear() : null,
    appleUrl: r.collectionViewUrl ?? '',
  }));
}

export interface ItunesSong {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl: string;
  appleUrl: string;
  previewUrl: string;
  kind: 'track' | 'album';
}

// Song/track search for the feed composer, so members pick a track instead of
// pasting a link. Returns both songs and the albums they belong to.
export async function searchSongs(term: string): Promise<ItunesSong[]> {
  const q = term.trim();
  if (!q) return [];
  const res = await fetch(
    `https://itunes.apple.com/search?media=music&entity=song&limit=10&term=${encodeURIComponent(q)}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results ?? [])
    .filter((r: any) => r.trackName)
    .map((r: any) => ({
      trackId: r.trackId,
      trackName: r.trackName,
      artistName: r.artistName,
      collectionName: r.collectionName ?? '',
      artworkUrl: (r.artworkUrl100 ?? '').replace('100x100', '200x200'),
      appleUrl: r.trackViewUrl ?? r.collectionViewUrl ?? '',
      previewUrl: r.previewUrl ?? '',
      kind: 'track' as const,
    }));
}

// The Apple Music equivalent of something already picked from Spotify, so the
// post/album opens in either service. Keyless + client-side, so it always works
// (no connection needed). Best-effort: returns null when nothing matches.
export async function resolveAppleTrack(title: string, artist: string): Promise<string | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim();
  if (!term) return null;
  const hit = (await searchSongs(term))[0];
  return hit?.appleUrl || null;
}

// Apple album match — returns the link plus the iTunes collectionId, which the
// caller uses to pull the track list (getAlbumTracks) for the song-level
// rating/notes pickers.
export async function resolveAppleAlbum(
  title: string,
  artist: string,
): Promise<{ appleUrl: string | null; collectionId: number | null; year: number | null } | null> {
  const term = [title, artist].filter(Boolean).join(' ').trim();
  if (!term) return null;
  const hit = (await searchAlbums(term))[0];
  if (!hit) return null;
  return { appleUrl: hit.appleUrl || null, collectionId: hit.collectionId, year: hit.year };
}

export async function getAlbumTracks(collectionId: number): Promise<ItunesTrack[]> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results ?? [])
    // Music videos (album trailers/visualizers) also come back with
    // wrapperType 'track' — kind 'song' is what separates real songs.
    .filter((r: any) => r.wrapperType === 'track' && r.kind === 'song')
    .map((r: any) => ({ trackNumber: r.trackNumber, trackName: r.trackName }))
    .sort((a: ItunesTrack, b: ItunesTrack) => a.trackNumber - b.trackNumber);
}
