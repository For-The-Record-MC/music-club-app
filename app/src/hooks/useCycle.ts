import { useCallback, useEffect, useState } from 'react';

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
  profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null;
}

// The club's current (open) cycle + its albums, RSVPs, and guests.
export function useCycle(clubId: string | undefined) {
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [rsvps, setRsvps] = useState<RsvpRow[]>([]);
  const [guests, setGuests] = useState<CycleGuest[]>([]);
  const [preferences, setPreferences] = useState<CyclePreference[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data: current } = await cycles.current(clubId);
    setCycle(current ?? null);
    if (current) {
      const [a, r, g, p] = await Promise.all([
        albumsDb.listByCycle(current.id),
        rsvpsDb.listByCycle(current.id),
        cycleGuests.listByCycle(current.id),
        preferencesDb.listByCycle(current.id),
      ]);
      setAlbums(a.data ?? []);
      setRsvps((r.data ?? []) as RsvpRow[]);
      setGuests(g.data ?? []);
      setPreferences(p.data ?? []);
    } else {
      setAlbums([]);
      setRsvps([]);
      setGuests([]);
      setPreferences([]);
    }
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { cycle, albums, rsvps, guests, preferences, loading, refresh };
}
