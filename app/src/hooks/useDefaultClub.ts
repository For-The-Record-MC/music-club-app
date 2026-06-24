import { useEffect } from 'react';

import { useMyClubs } from '@/hooks/useMyClubs';
import { useCurrentClubStore } from '@/stores/currentClubStore';

// Keeps a sensible club selected. After a fresh sign-in (or relog as a different
// account) the persisted club id may be null or point at a club you're no longer
// in — either way the home page would render blank. This snaps the selection to
// your first joined club once we know which clubs are yours.
export function useDefaultClub() {
  const { rows, loading } = useMyClubs();
  const clubId = useCurrentClubStore((s) => s.clubId);
  const hydrated = useCurrentClubStore((s) => s.hydrated);
  const setClub = useCurrentClubStore((s) => s.setClub);

  useEffect(() => {
    if (!hydrated || loading || rows.length === 0) return;
    const valid = clubId != null && rows.some((r) => r.club.id === clubId);
    if (!valid) setClub(rows[0].club.id);
  }, [hydrated, loading, rows, clubId, setClub]);
}
