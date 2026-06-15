import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';
import { meetingPosts, type MeetingPost } from '@/utils/supabase/db';

export interface MeetingPostRow extends MeetingPost {
  profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null;
}

// The meeting board for a cycle: posts (oldest-first, chat-style) plus add/remove.
// add() posts as the signed-in user and refreshes; remove() is guarded by RLS
// (own post, or owner/admin moderating).
export function useMeetingPosts(cycleId: string | undefined) {
  const userId = useAuthStore((s) => s.userId);
  const [posts, setPosts] = useState<MeetingPostRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!cycleId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    const { data } = await meetingPosts.listByCycle(cycleId);
    setPosts((data ?? []) as MeetingPostRow[]);
    setLoading(false);
  }, [cycleId]);

  const add = useCallback(
    async (text: string) => {
      if (!cycleId || !userId || !text.trim()) return;
      const { error } = await meetingPosts.add(cycleId, userId, text);
      if (!error) await refresh();
      return error;
    },
    [cycleId, userId, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await meetingPosts.remove(id);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, loading, refresh, add, remove };
}
