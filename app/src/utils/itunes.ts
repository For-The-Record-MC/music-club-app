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

export async function getAlbumTracks(collectionId: number): Promise<ItunesTrack[]> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=song&limit=200`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results ?? [])
    .filter((r: any) => r.wrapperType === 'track')
    .map((r: any) => ({ trackNumber: r.trackNumber, trackName: r.trackName }))
    .sort((a: ItunesTrack, b: ItunesTrack) => a.trackNumber - b.trackNumber);
}
