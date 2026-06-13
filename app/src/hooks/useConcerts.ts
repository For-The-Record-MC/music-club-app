import { useCallback, useEffect, useState } from 'react';

import { concerts, type Concert, type ConcertStatus } from '@/utils/supabase/db';

export interface ConcertRow extends Concert {
  profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null;
  concert_interest: { profile_id: string; status: ConcertStatus }[];
  concert_comments: { count: number }[];
}

export function useConcerts(clubId: string | undefined) {
  const [rows, setRows] = useState<ConcertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const { data } = await concerts.list(clubId);
    setRows((data ?? []) as ConcertRow[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, refresh };
}
