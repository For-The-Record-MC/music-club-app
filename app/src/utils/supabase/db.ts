import { supabase, supabaseAnonKey, supabaseUrl } from './client';

import type { Tables } from './database.types';

// ALL Supabase queries live in this file, grouped into typed query objects —
// one object per domain. Screens and hooks must never call the raw supabase
// client directly; add a method here instead.

export type Profile = Tables<'profiles'>;
export type Club = Tables<'clubs'>;
export type ClubMember = Tables<'club_members'>;
export type ClubRole = 'owner' | 'admin' | 'member';

export const profiles = {
  getById: (id: string) =>
    supabase.from('profiles').select('*').eq('id', id).single(),
  update: (id: string, patch: { display_name?: string; avatar_color?: number }) =>
    supabase.from('profiles').update(patch).eq('id', id).select().single(),
};

export const clubs = {
  // My membership rows with the club joined — powers the lobby.
  listMine: (profileId: string) =>
    supabase
      .from('club_members')
      .select('role, clubs(*)')
      .eq('profile_id', profileId)
      .order('joined_at'),
  get: (id: string) =>
    supabase.from('clubs').select('*').eq('id', id).single(),
  update: (id: string, patch: { name?: string; emoji?: string }) =>
    supabase.from('clubs').update(patch).eq('id', id).select().single(),
  remove: (id: string) => supabase.from('clubs').delete().eq('id', id),
  // RPCs (security definer): atomic create-with-owner / invite-code join.
  // Both return a single clubs row (composite return, not SETOF).
  create: (name: string, emoji: string) =>
    supabase.rpc('create_club', { p_name: name, p_emoji: emoji }),
  join: (code: string) => supabase.rpc('join_club', { p_code: code }),
  rotateInviteCode: (clubId: string) =>
    supabase.rpc('rotate_invite_code', { p_club: clubId }),
};

export const clubMembers = {
  list: (clubId: string) =>
    supabase
      .from('club_members')
      .select('*, profiles(display_name, avatar_color)')
      .eq('club_id', clubId)
      .order('joined_at'),
  setRole: (memberId: string, role: Exclude<ClubRole, 'owner'>) =>
    supabase.from('club_members').update({ role }).eq('id', memberId),
  remove: (memberId: string) =>
    supabase.from('club_members').delete().eq('id', memberId),
};

export const health = {
  /** Connectivity probe — hits the GoTrue health endpoint. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: supabaseAnonKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
