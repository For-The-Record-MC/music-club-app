import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';
import { activity, type ActivityEvent } from '@/utils/supabase/db';

export interface ActivityRow extends ActivityEvent {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}

// Activity events + unread count (events newer than the member's last_read_at).
export function useActivity(clubId: string | undefined) {
  const userId = useAuthStore((s) => s.userId);
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId || !userId) return;
    const [{ data: ev }, { data: read }] = await Promise.all([
      activity.list(clubId),
      activity.lastRead(clubId, userId),
    ]);
    const rows = (ev ?? []) as ActivityRow[];
    setEvents(rows);
    const lastRead = read?.last_read_at ? new Date(read.last_read_at).getTime() : 0;
    // The bell only counts things *other people* did — your own actions never
    // need announcing back to you.
    setUnread(
      rows.filter((e) => e.actor_id !== userId && new Date(e.created_at).getTime() > lastRead).length,
    );
    setLoading(false);
  }, [clubId, userId]);

  const markRead = useCallback(async () => {
    if (!clubId) return;
    await activity.markRead(clubId);
    setUnread(0);
  }, [clubId]);

  // Re-enter loading whenever the target changes (e.g. switching clubs) so
  // screens show the record spinner instead of the previous club's data.
  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  // Re-check on focus so the bell badge clears when returning from the Activity
  // screen (which marks everything read on the server).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { events, unread, loading, refresh, markRead };
}
