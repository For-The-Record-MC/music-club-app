// Spotify track search — the Spotify counterpart to utils/itunes.ts. Spotify's
// API needs a token, so unlike iTunes we can't fetch it directly from the client;
// instead we call the `spotify-search` Edge Function, which holds the app
// credentials and proxies the search (client-credentials flow, no user login).
//
// Shape mirrors ItunesSong so the feed composer can treat both sources alike,
// plus a `uri` (spotify:track:<id>) that the per-cycle playlist sync needs later.

import { supabase } from './supabase/client';

export interface SpotifySong {
  id: string;
  uri: string; // spotify:track:<id>
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl: string;
  spotifyUrl: string;
}

interface SearchResponse {
  results?: SpotifySong[];
  ok?: false;
  message?: string;
}

export async function searchSongs(term: string): Promise<SpotifySong[]> {
  const q = term.trim();
  if (!q) return [];
  const { data, error } = await supabase.functions.invoke<SearchResponse>('spotify-search', {
    body: { term: q },
  });
  if (error || !data || data.ok === false) return [];
  return data.results ?? [];
}
