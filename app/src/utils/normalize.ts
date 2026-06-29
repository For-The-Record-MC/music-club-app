// Client mirror of the SQL `showdown_norm(title, artist)` (see the jukebox
// showdown migration): lowercased "title|artist" with everything outside
// [a-z0-9|] stripped. Used to detect duplicate songs/albums for the soft
// resubmission warnings, so the client matches the server's notion of "same".
export function normKey(title: string | null | undefined, artist: string | null | undefined): string {
  return `${(title ?? '').trim()}|${(artist ?? '').trim()}`
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '');
}
