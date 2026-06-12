import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';
import { clubs, type Club, type ClubRole } from '@/utils/supabase/db';

export interface MyClubRow {
  role: ClubRole;
  club: Club;
}

export function useMyClubs() {
  const userId = useAuthStore((s) => s.userId);
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
  }, [refresh]);

  return { rows, loading, refresh };
}
