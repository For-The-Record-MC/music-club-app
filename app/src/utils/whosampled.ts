import * as WebBrowser from 'expo-web-browser';

// Open WhoSampled search for a track — same no-API deep-link approach as
// genius.ts (their real API is partner-restricted): land on the search results
// page and let the member tap the top hit. Falls back to just the track name
// when the album has no artist set.
export function openWhoSampled(artist: string | null | undefined, trackName: string) {
  const query = [artist?.trim(), trackName.trim()].filter(Boolean).join(' ');
  const url = `https://www.whosampled.com/search/?q=${encodeURIComponent(query)}`;
  return WebBrowser.openBrowserAsync(url);
}
