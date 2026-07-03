import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { bestBars, type BestBar } from '@/utils/supabase/db';

// One bar with its 1–10 ratings and a comment count embedded — the same embed
// shape the feed uses for reactions.
export interface BarRow extends BestBar {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  best_bar_ratings: { score: number; profile_id: string }[];
  best_bar_comments: { count: number }[];
}

// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, BarRow[]>());

export function useBestBars(clubId: string | undefined) {
  const [bars, setBars] = useState<BarRow[]>(() => (clubId ? cache.get(clubId) : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await bestBars.list(clubId);
    const rows = (data ?? []) as BarRow[];
    cache.set(clubId, rows);
    setBars(rows);
    setLoading(false);
  }, [clubId]);

  // On mount or club switch: serve the cached rows immediately and revalidate;
  // only show the record when this club has never been loaded.
  useEffect(() => {
    setBars((clubId ? cache.get(clubId) : undefined) ?? []);
    setLoading(!(clubId && cache.has(clubId)));
    refresh();
  }, [clubId, refresh]);

  return { bars, loading, refresh };
}
