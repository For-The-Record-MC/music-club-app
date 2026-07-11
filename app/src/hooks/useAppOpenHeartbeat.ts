import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/utils/supabase/client';

// Throttle: an "open" is coming back after being away, not every unlock while
// bouncing between apps. Server-side it collapses to one row per member/day
// regardless — this just keeps the opens counter honest.
const MIN_GAP_MS = 5 * 60 * 1000;

// Adoption heartbeat: pings log_app_open() when the app starts and whenever it
// returns to the foreground, so members who browse without posting still show
// up in the analytics views (daily_opens / member_last_seen). Fire-and-forget;
// never surfaces errors to the UI.
export function useAppOpenHeartbeat(userId: string | null) {
  const lastPing = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const ping = () => {
      const now = Date.now();
      if (now - lastPing.current < MIN_GAP_MS) return;
      lastPing.current = now;
      supabase.rpc('log_app_open').then(undefined, () => {});
    };

    ping(); // sign-in / cold start counts as an open
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') ping();
    });
    return () => sub.remove();
  }, [userId]);
}
