import * as WebBrowser from 'expo-web-browser';

// Open Genius search for a track. We deep-link to the search results page
// (artist + title) rather than resolving the exact song URL — no API key, no
// backend, can't break. The member taps the top hit. Falls back to just the
// track name when the album has no artist set.
export function openLyrics(artist: string | null | undefined, trackName: string) {
  const query = [artist?.trim(), trackName.trim()].filter(Boolean).join(' ');
  const url = `https://genius.com/search?q=${encodeURIComponent(query)}`;
  return WebBrowser.openBrowserAsync(url);
}
