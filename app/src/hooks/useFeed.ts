import { useCallback, useEffect, useState } from 'react';

import { feed, type FeedPost } from '@/utils/supabase/db';

export interface FeedRow extends FeedPost {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  post_reactions: { emoji: string; profile_id: string }[];
  post_comments: { count: number }[];
}

export function useFeed(clubId: string | undefined) {
  const [posts, setPosts] = useState<FeedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await feed.list(clubId);
    setPosts((data ?? []) as FeedRow[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, loading, refresh };
}
