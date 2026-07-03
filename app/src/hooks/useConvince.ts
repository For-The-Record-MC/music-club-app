import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { convince, type ConvincePost, type ConvinceTrack, type ConvinceVerdict } from '@/utils/supabase/db';

// One rec with its 3 tracks, aimed-at members (+ their verdicts) and a comment
// count embedded — the read shape the Convince Me room renders.
export interface ConvinceRow extends ConvincePost {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  convince_tracks: ConvinceTrack[];
  convince_targets: { profile_id: string; verdict: ConvinceVerdict | null }[];
  convince_comments: { count: number }[];
}

// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, ConvinceRow[]>());

export function useConvince(clubId: string | undefined) {
  const [posts, setPosts] = useState<ConvinceRow[]>(() => (clubId ? cache.get(clubId) : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await convince.list(clubId);
    const rows = (data ?? []) as ConvinceRow[];
    cache.set(clubId, rows);
    setPosts(rows);
    setLoading(false);
  }, [clubId]);

  // On mount or club switch: serve the cached rows immediately and revalidate;
  // only show the record when this club has never been loaded.
  useEffect(() => {
    setPosts((clubId ? cache.get(clubId) : undefined) ?? []);
    setLoading(!(clubId && cache.has(clubId)));
    refresh();
  }, [clubId, refresh]);

  return { posts, loading, refresh };
}
