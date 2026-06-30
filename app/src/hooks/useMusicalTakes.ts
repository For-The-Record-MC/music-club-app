import { useCallback, useEffect, useState } from 'react';

import { musicalTakes, type MusicalTake } from '@/utils/supabase/db';

// One hot take with its positions (the 5-point agree↔disagree votes) and a
// comment count embedded — the same embed shape the feed uses for reactions.
export interface TakeRow extends MusicalTake {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  musical_take_positions: { value: number; profile_id: string }[];
  musical_take_comments: { count: number }[];
}

export function useMusicalTakes(clubId: string | undefined) {
  const [takes, setTakes] = useState<TakeRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await musicalTakes.list(clubId);
    setTakes((data ?? []) as TakeRow[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { takes, loading, refresh };
}
