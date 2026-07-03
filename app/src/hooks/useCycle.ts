import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import {
  albums as albumsDb,
  cycleGuests,
  cycles,
  preferences as preferencesDb,
  rsvps as rsvpsDb,
  type Album,
  type Cycle,
  type CycleGuest,
  type CyclePreference,
  type Rsvp,
} from '@/utils/supabase/db';

export interface RsvpRow extends Rsvp {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}

interface CycleSnapshot {
  cycle: Cycle | null;
  albums: Album[];
  rsvps: RsvpRow[];
  guests: CycleGuest[];
  preferences: CyclePreference[];
}
const EMPTY: CycleSnapshot = { cycle: null, albums: [], rsvps: [], guests: [], preferences: [] };

// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, CycleSnapshot>());

// The club's current (open) cycle + its albums, RSVPs, and guests.
export function useCycle(clubId: string | undefined) {
  const [snap, setSnap] = useState<CycleSnapshot>(() => (clubId ? cache.get(clubId) : undefined) ?? EMPTY);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data: current } = await cycles.current(clubId);
    let next: CycleSnapshot;
    if (current) {
      const [a, r, g, p] = await Promise.all([
        albumsDb.listByCycle(current.id),
        rsvpsDb.listByCycle(current.id),
        cycleGuests.listByCycle(current.id),
        preferencesDb.listByCycle(current.id),
      ]);
      next = {
        cycle: current,
        albums: a.data ?? [],
        rsvps: (r.data ?? []) as RsvpRow[],
        guests: g.data ?? [],
        preferences: p.data ?? [],
      };
    } else {
      next = { ...EMPTY };
    }
    cache.set(clubId, next);
    setSnap(next);
    setLoading(false);
  }, [clubId]);

  // On mount or club switch: serve the cached snapshot immediately and
  // revalidate; only show the record when this club has never been loaded.
  useEffect(() => {
    setSnap((clubId ? cache.get(clubId) : undefined) ?? EMPTY);
    setLoading(!(clubId && cache.has(clubId)));
    refresh();
  }, [clubId, refresh]);

  return {
    cycle: snap.cycle,
    albums: snap.albums,
    rsvps: snap.rsvps,
    guests: snap.guests,
    preferences: snap.preferences,
    loading,
    refresh,
  };
}
