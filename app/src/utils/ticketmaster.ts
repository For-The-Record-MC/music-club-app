// Ticketmaster event search — the concert-form counterpart to utils/spotify.ts.
// The Discovery API key can't ship in the client bundle, so we call the
// `concert-search` Edge Function, which holds the key and proxies the search.
//
// Each result maps 1:1 onto the concert composer's fields, so picking one fills
// artist + date/time + venue + ticket link at once.

import { supabase } from './supabase/client';

export interface ConcertEvent {
  id: string;
  artist: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // HH:MM:SS, or null when time is TBA
  venue: string; // "Venue, City"
  ticketUrl: string;
  imageUrl: string;
}

interface SearchResponse {
  results?: ConcertEvent[];
  ok?: false;
  message?: string;
}

// countryCode '' searches worldwide; defaults to US server-side. We pass an
// explicit value so the UI's "Worldwide" toggle takes effect.
export async function searchConcerts(
  term: string,
  countryCode = 'US',
): Promise<ConcertEvent[]> {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke<SearchResponse>('concert-search', {
    body: { term: q, countryCode },
  });
  if (error || !data || data.ok === false) return [];
  return data.results ?? [];
}
