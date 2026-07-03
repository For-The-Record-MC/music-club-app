import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { musicalTakes, type MusicalTake } from '@/utils/supabase/db';

// One hot take with its positions (the 5-point agree↔disagree votes) and a
// comment count embedded — the same embed shape the feed uses for reactions.
export interface TakeRow extends MusicalTake {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  musical_take_positions: { value: number; profile_id: string }[];
  musical_take_comments: { count: number }[];
}

// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, TakeRow[]>());

export function useMusicalTakes(clubId: string | undefined) {
  const [takes, setTakes] = useState<TakeRow[]>(() => (clubId ? cache.get(clubId) : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await musicalTakes.list(clubId);
    const rows = (data ?? []) as TakeRow[];
    cache.set(clubId, rows);
    setTakes(rows);
    setLoading(false);
  }, [clubId]);

  // On mount or club switch: serve the cached rows immediately and revalidate;
  // only show the record when this club has never been loaded.
  useEffect(() => {
    setTakes((clubId ? cache.get(clubId) : undefined) ?? []);
    setLoading(!(clubId && cache.has(clubId)));
    refresh();
  }, [clubId, refresh]);

  return { takes, loading, refresh };
}
