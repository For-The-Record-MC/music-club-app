import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { feed, type FeedPost } from '@/utils/supabase/db';

export interface SuggestionRow extends FeedPost {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}

// The Queue — album suggestions the club has floated for future picks. Same
// feed_posts table, filtered to is_album_suggestion (feed.suggestions).
// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, SuggestionRow[]>());

export function useSuggestions(clubId: string | undefined) {
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>(() => (clubId ? cache.get(clubId) : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await feed.suggestions(clubId);
    const rows = (data ?? []) as SuggestionRow[];
    cache.set(clubId, rows);
    setSuggestions(rows);
    setLoading(false);
  }, [clubId]);

  // On mount or club switch: serve the cached rows immediately and revalidate;
  // only show the record when this club has never been loaded.
  useEffect(() => {
    setSuggestions((clubId ? cache.get(clubId) : undefined) ?? []);
    setLoading(!(clubId && cache.has(clubId)));
    refresh();
  }, [clubId, refresh]);

  return { suggestions, loading, refresh };
}
