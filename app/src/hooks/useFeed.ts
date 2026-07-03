import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import { feed, type FeedPost } from '@/utils/supabase/db';

export interface FeedRow extends FeedPost {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  post_reactions: { emoji: string; profile_id: string }[];
  post_comments: { count: number }[];
}

// Stale-while-revalidate cache keyed by club id: a room opens instantly with
// the rows the hub already fetched while a background refetch runs. Keyed per
// club, so another club's data can never flash.
const cache = registerCache(new Map<string, FeedRow[]>());

export function useFeed(clubId: string | undefined) {
  const [posts, setPosts] = useState<FeedRow[]>(() => (clubId ? cache.get(clubId) : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await feed.list(clubId);
    const rows = (data ?? []) as FeedRow[];
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
