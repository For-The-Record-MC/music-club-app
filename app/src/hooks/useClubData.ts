import { useCallback, useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/authStore';
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

// Club + member list + my role, for the club home and members screens.
export function useClubData(clubId: string | undefined) {
  const userId = useAuthStore((s) => s.userId);
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const [clubRes, membersRes] = await Promise.all([
      clubs.get(clubId),
      clubMembers.list(clubId),
    ]);
    setClub(clubRes.data ?? null);
    setMembers((membersRes.data ?? []) as MemberRow[]);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const myRole = (members.find((m) => m.profile_id === userId)?.role ?? null) as ClubRole | null;

  return { club, members, myRole, loading, refresh };
}
