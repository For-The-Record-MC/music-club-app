// Last.fm playcount lookup via the track-stats Edge Function (the key stays
// server-side). Best-effort: returns null on any miss/failure — the caller
// just leaves the pick unscored.

import { supabase } from './supabase/client';

export async function fetchTrackPlaycount(title: string, artist: string): Promise<number | null> {
  const t = title.trim();
  const a = artist.trim();
  if (!t || !a) return null;
  const { data, error } = await supabase.functions.invoke<{ playcount?: number | null }>('track-stats', {
    body: { title: t, artist: a },
  });
  if (error || !data) return null;
  return typeof data.playcount === 'number' ? data.playcount : null;
}
