import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { showdown as showdownDb, type ShowdownView } from '@/utils/supabase/db';

// A cycle's Jukebox Showdown, read through the blind-aware list_showdown RPC.
// view is null when the cycle has no showdown yet. Stays blind (no scores,
// anonymous submissions) until view.revealed flips at the meeting reveal.
// Stale-while-revalidate cache keyed by cycle id — see useFeed for the pattern.
const cache = registerCache(new Map<string, ShowdownView | null>());

export function useShowdown(cycleId: string | undefined) {
  const [view, setView] = useState<ShowdownView | null>(() => (cycleId ? cache.get(cycleId) : undefined) ?? null);
  const [loading, setLoading] = useState(() => !(cycleId && cache.has(cycleId)));

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setView(null);
      setLoading(false);
      return;
    }
    const { data } = await showdownDb.list(cycleId);
    const next = (data as ShowdownView | null) ?? null;
    cache.set(cycleId, next);
    setView(next);
    setLoading(false);
  }, [cycleId]);

  // On mount or cycle change: serve the cached view immediately and revalidate;
  // only show the record when this cycle has never been loaded.
  useEffect(() => {
    setView((cycleId ? cache.get(cycleId) : undefined) ?? null);
    setLoading(!(cycleId && cache.has(cycleId)));
    refresh();
  }, [cycleId, refresh]);

  return { view, loading, refresh };
}
