import { supabase, supabaseAnonKey, supabaseUrl } from './client';

import type { Tables, TablesInsert } from './database.types';

// ALL Supabase queries live in this file, grouped into typed query objects —
// one object per domain. Screens and hooks must never call the raw supabase
// client directly; add a method here instead.

export type Profile = Tables<'profiles'>;
export type Club = Tables<'clubs'>;
export type ClubMember = Tables<'club_members'>;
export type ClubRole = 'owner' | 'admin' | 'member';
export type Cycle = Tables<'cycles'>;
export type Album = Tables<'albums'>;
export type Rsvp = Tables<'rsvps'>;
export type CycleGuest = Tables<'cycle_guests'>;
export type RsvpStatus = 'yes' | 'maybe' | 'no';
export type Rating = Tables<'ratings'>;

// Shape of the get_album_summary RPC payload (json column, typed manually).
export interface AlbumSummary {
  submitted: string[];
  count: number;
  avg_score: number | null;
  revealed: boolean;
  mine_submitted: boolean;
}

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

export const cycles = {
  // "Current cycle" is ALWAYS the status='open' row, never max(number).
  current: (clubId: string) =>
    supabase
      .from('cycles')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'open')
      .maybeSingle(),
  get: (id: string) => supabase.from('cycles').select('*').eq('id', id).single(),
  listClosed: (clubId: string) =>
    supabase
      .from('cycles')
      .select('*, albums(*)')
      .eq('club_id', clubId)
      .eq('status', 'closed')
      .order('number', { ascending: false }),
  scheduleMeeting: (id: string, date: string | null, timeLocation: string | null) =>
    supabase
      .from('cycles')
      .update({ meeting_date: date, meeting_time_location: timeLocation })
      .eq('id', id),
  // RPCs — see context/database-schema.md for semantics.
  spin: (clubId: string) => supabase.rpc('spin_wheel', { p_club: clubId }),
  pool: (clubId: string) => supabase.rpc('wheel_pool', { p_club: clubId }),
  reveal: (id: string) => supabase.rpc('reveal_cycle', { p_cycle: id }),
  close: (id: string) => supabase.rpc('close_cycle', { p_cycle: id }),
  remove: (id: string) => supabase.from('cycles').delete().eq('id', id),
};

export const albums = {
  get: (id: string) => supabase.from('albums').select('*').eq('id', id).single(),
  listByCycle: (cycleId: string) =>
    supabase.from('albums').select('*').eq('cycle_id', cycleId).order('slot'),
  upsert: (album: TablesInsert<'albums'>) =>
    supabase.from('albums').upsert(album, { onConflict: 'cycle_id,slot' }).select().single(),
  remove: (id: string) => supabase.from('albums').delete().eq('id', id),
};

export const ratings = {
  mine: (albumId: string, profileId: string) =>
    supabase
      .from('ratings')
      .select('*')
      .eq('album_id', albumId)
      .eq('profile_id', profileId)
      .maybeSingle(),
  upsert: (rating: TablesInsert<'ratings'>) =>
    supabase
      .from('ratings')
      .upsert(
        { ...rating, updated_at: new Date().toISOString() },
        { onConflict: 'album_id,profile_id' },
      ),
  // Pre-reveal RLS hides others' rows; this returns everything only once the
  // cycle is revealed.
  listRevealed: (albumId: string) =>
    supabase
      .from('ratings')
      .select('*, profiles(display_name, avatar_color)')
      .eq('album_id', albumId)
      .order('score', { ascending: false }),
  // The visibility-gated aggregate (see context/database-schema.md).
  summary: (albumId: string) => supabase.rpc('get_album_summary', { p_album: albumId }),
};

export const rsvps = {
  listByCycle: (cycleId: string) =>
    supabase
      .from('rsvps')
      .select('*, profiles(display_name, avatar_color)')
      .eq('cycle_id', cycleId),
  set: (cycleId: string, profileId: string, status: RsvpStatus) =>
    supabase
      .from('rsvps')
      .upsert(
        { cycle_id: cycleId, profile_id: profileId, status, updated_at: new Date().toISOString() },
        { onConflict: 'cycle_id,profile_id' },
      ),
};

export const cycleGuests = {
  listByCycle: (cycleId: string) =>
    supabase.from('cycle_guests').select('*').eq('cycle_id', cycleId).order('created_at'),
  add: (cycleId: string, name: string, status: RsvpStatus, addedBy: string) =>
    supabase
      .from('cycle_guests')
      .insert({ cycle_id: cycleId, name: name.trim(), status, added_by: addedBy }),
  remove: (id: string) => supabase.from('cycle_guests').delete().eq('id', id),
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
