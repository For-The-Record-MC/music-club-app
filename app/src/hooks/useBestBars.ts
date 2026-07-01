import { useCallback, useEffect, useState } from 'react';

import { bestBars, type BestBar } from '@/utils/supabase/db';

// One bar with its 1–10 ratings and a comment count embedded — the same embed
// shape the feed uses for reactions.
export interface BarRow extends BestBar {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  best_bar_ratings: { score: number; profile_id: string }[];
  best_bar_comments: { count: number }[];
}

export function useBestBars(clubId: string | undefined) {
  const [bars, setBars] = useState<BarRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await bestBars.list(clubId);
    setBars((data ?? []) as BarRow[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { bars, loading, refresh };
}
