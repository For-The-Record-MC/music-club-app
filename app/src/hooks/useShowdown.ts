import { useCallback, useEffect, useState } from 'react';

import { showdown as showdownDb, type ShowdownView } from '@/utils/supabase/db';

// A cycle's Jukebox Showdown, read through the blind-aware list_showdown RPC.
// view is null when the cycle has no showdown yet. Stays blind (no scores,
// anonymous submissions) until view.revealed flips at the meeting reveal.
export function useShowdown(cycleId: string | undefined) {
  const [view, setView] = useState<ShowdownView | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setView(null);
      setLoading(false);
      return;
    }
    const { data } = await showdownDb.list(cycleId);
    setView((data as ShowdownView | null) ?? null);
    setLoading(false);
  }, [cycleId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { view, loading, refresh };
}
