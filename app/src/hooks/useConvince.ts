import { useCallback, useEffect, useState } from 'react';

import { convince, type ConvincePost, type ConvinceTrack, type ConvinceVerdict } from '@/utils/supabase/db';

// One rec with its 3 tracks, aimed-at members (+ their verdicts) and a comment
// count embedded — the read shape the Convince Me room renders.
export interface ConvinceRow extends ConvincePost {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  convince_tracks: ConvinceTrack[];
  convince_targets: { profile_id: string; verdict: ConvinceVerdict | null }[];
  convince_comments: { count: number }[];
}

export function useConvince(clubId: string | undefined) {
  const [posts, setPosts] = useState<ConvinceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await convince.list(clubId);
    setPosts((data ?? []) as ConvinceRow[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, loading, refresh };
}
