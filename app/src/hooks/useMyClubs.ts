import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { clubs, type Club, type ClubRole } from '@/utils/supabase/db';

export interface MyClubRow {
  role: ClubRole;
  club: Club;
}

export function useMyClubs() {
  const userId = useAuthStore((s) => s.userId);
  // Creating or joining a club calls setClub(), so the active club id changing is
  // our signal that the membership list may have grown — refetch so a freshly
  // created/joined club shows up in the switcher without a reload.
  const clubId = useCurrentClubStore((s) => s.clubId);
  const [rows, setRows] = useState<MyClubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await clubs.listMine(userId);
    setRows(
      (data ?? [])
        .filter((r) => r.clubs)
        .map((r) => ({ role: r.role as ClubRole, club: r.clubs as Club })),
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, clubId]);

  return { rows, loading, refresh };
}
