import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';
import { registerCache } from '@/utils/dataCache';
import {
  clubMembers,
  clubs,
  type Club,
  type ClubMember,
  type ClubRole,
} from '@/utils/supabase/db';

export interface MemberRow extends ClubMember {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}

interface ClubSnapshot {
  club: Club | null;
  members: MemberRow[];
}
const EMPTY: ClubSnapshot = { club: null, members: [] };

// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, ClubSnapshot>());

// Club + member list + my role, for the club home and members screens.
export function useClubData(clubId: string | undefined) {
  const userId = useAuthStore((s) => s.userId);
  const [snap, setSnap] = useState<ClubSnapshot>(() => (clubId ? cache.get(clubId) : undefined) ?? EMPTY);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const [clubRes, membersRes] = await Promise.all([
      clubs.get(clubId),
      clubMembers.list(clubId),
    ]);
    const next: ClubSnapshot = {
      club: clubRes.data ?? null,
      members: (membersRes.data ?? []) as MemberRow[],
    };
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

  const myRole = (snap.members.find((m) => m.profile_id === userId)?.role ?? null) as ClubRole | null;

  return { club: snap.club, members: snap.members, myRole, loading, refresh };
}
