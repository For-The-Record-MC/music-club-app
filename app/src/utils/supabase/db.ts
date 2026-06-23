import { supabase, supabaseAnonKey, supabaseUrl } from './client';

import type { Json, Tables, TablesInsert, TablesUpdate } from './database.types';

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
export type CyclePreference = Tables<'cycle_preferences'>;
export type RsvpStatus = 'yes' | 'maybe' | 'no';
export type Rating = Tables<'ratings'>;
export type SongNote = Tables<'song_notes'>;
export type SongNoteShare = Tables<'song_note_shares'>;
export type Thumb = 'up' | 'down';
export type FeedPost = Tables<'feed_posts'>;
export type PostReaction = Tables<'post_reactions'>;
export type PostComment = Tables<'post_comments'>;
export type Concert = Tables<'concerts'>;
export type ConcertInterest = Tables<'concert_interest'>;
export type ConcertComment = Tables<'concert_comments'>;
export type MeetingPost = Tables<'meeting_posts'>;
export type ConcertStatus = 'interested' | 'going';
export type ActivityEvent = Tables<'activity_events'>;
export type ClubFavoriteTrack = Tables<'club_favorite_tracks'>;
export type ProfileTrack = Tables<'profile_tracks'>;
export type TrackSlot = 'new' | 'old' | 'obsession';
export const TRACK_SLOTS: TrackSlot[] = ['new', 'old', 'obsession'];
export const TRACK_SLOT_LABELS: Record<TrackSlot, string> = {
  new: 'Something new',
  old: 'Something old',
  obsession: "Can't stop listening to",
};
export type ReactionEmoji = '👍' | '❤️' | '🔥' | '😂' | '🤔';
export const REACTION_EMOJIS: ReactionEmoji[] = ['👍', '❤️', '🔥', '😂', '🤔'];

// Per-club leaderboard weights (clubs.leaderboard_weights jsonb). Only these
// keys are scored for the "Most Active" mode; missing keys count as 0.
export interface LeaderboardWeights {
  songs_shared: number;
  interactions_given: number;
  ratings_given: number;
  concerts_added: number;
  meetings_attended: number;
  albums_chosen: number;
}

export const DEFAULT_LEADERBOARD_WEIGHTS: LeaderboardWeights = {
  songs_shared: 3,
  interactions_given: 1,
  ratings_given: 2,
  concerts_added: 2,
  meetings_attended: 5,
  albums_chosen: 4,
};

// Per-member stat block from the club_leaderboard RPC. avg_rating_received is
// null when the member has no picks in a REVEALED cycle (the seal).
export interface LeaderboardStats {
  albums_chosen: number;
  avg_rating_received: number | null;
  ratings_given: number;
  interactions_given: number;
  interactions_received: number;
  songs_shared: number;
  concerts_added: number;
  meetings_attended: number;
}

// One row of the club_leaderboard RPC payload (json array, typed manually).
export interface LeaderboardRow {
  profile_id: string;
  display_name: string | null;
  email: string | null;
  avatar_color: number;
  avatar_url: string | null;
  avatar_label: string | null;
  role: ClubRole;
  joined_at: string;
  last_active_at: string | null;
  stats: LeaderboardStats;
  active_score: number;
}

// Shape of the get_album_summary RPC payload (json column, typed manually).
export interface AlbumSummary {
  submitted: string[];
  count: number;
  avg_score: number | null;
  revealed: boolean;
  mine_submitted: boolean;
}

// Shape of the get_cycle_highlights RPC payload (json column, typed manually).
export interface CycleHighlightSong {
  source: 'album' | 'feed';
  title: string;
  artist: string | null;
  score: number;
  album_id?: string;
  post_id?: string;
  spotify_uri?: string | null;
  artwork_url?: string | null;
}

export interface CycleHighlights {
  cycle: {
    id: string;
    number: number;
    picker_id: string | null;
    picker_name: string | null;
    meeting_at: string | null;
    closed_at: string | null;
    spotify_playlist_url: string | null;
  };
  albums: {
    album_id: string;
    slot: number;
    title: string;
    artist: string;
    artwork_url: string | null;
    avg_score: number | null;
    rating_count: number;
    min_score: number | null;
    max_score: number | null;
    favorite_votes: number;
  }[];
  winner_album_id: string | null;
  top_songs: CycleHighlightSong[];
  reviews: {
    album_id: string;
    album_title: string;
    kind: 'high' | 'low';
    profile_id: string;
    score: number;
    review: string;
    display_name: string | null;
    avatar_color: number;
    avatar_url: string | null;
  }[];
  popular_shares: {
    post_id: string;
    kind: string;
    title: string;
    artist: string | null;
    url: string | null;
    artwork_url: string | null;
    reactions: number;
  }[];
}

export const profiles = {
  getById: (id: string) =>
    supabase.from('profiles').select('*').eq('id', id).single(),
  update: (
    id: string,
    patch: {
      display_name?: string;
      avatar_color?: number;
      avatar_url?: string | null;
      avatar_label?: string | null;
      avatar_album_url?: string | null;
    },
  ) => supabase.from('profiles').update(patch).eq('id', id).select().single(),
};

// The three featured songs on a profile (global; same in every club). One row
// per slot; RLS lets anyone signed in read, only the owner write.
export const profileTracks = {
  listByProfile: (profileId: string) =>
    supabase.from('profile_tracks').select('*').eq('profile_id', profileId),
  // Upsert one slot (search result + optional caption) for the signed-in user.
  upsert: (track: TablesInsert<'profile_tracks'>) =>
    supabase
      .from('profile_tracks')
      .upsert({ ...track, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,slot' }),
  clear: (profileId: string, slot: TrackSlot) =>
    supabase.from('profile_tracks').delete().eq('profile_id', profileId).eq('slot', slot),
};

export const leaderboard = {
  // The single source of truth for per-member stats + active score (security
  // definer RPC, gated to club members). Returns a json array (LeaderboardRow[]).
  get: (clubId: string) => supabase.rpc('club_leaderboard', { p_club: clubId }),
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
  update: (
    id: string,
    patch: {
      name?: string;
      emoji?: string;
      song_limit_per_cycle?: number | null;
      leaderboard_weights?: LeaderboardWeights;
    },
  ) =>
    supabase
      .from('clubs')
      .update(patch as TablesUpdate<'clubs'>)
      .eq('id', id)
      .select()
      .single(),
  remove: (id: string) => supabase.from('clubs').delete().eq('id', id),
  // RPCs (security definer): atomic create-with-owner / invite-code join.
  // Both return a single clubs row (composite return, not SETOF).
  create: (name: string, emoji: string) =>
    supabase.rpc('create_club', { p_name: name, p_emoji: emoji }),
  join: (code: string) => supabase.rpc('join_club', { p_code: code }),
  rotateInviteCode: (clubId: string) =>
    supabase.rpc('rotate_invite_code', { p_club: clubId }),
  // My per-cycle song quota — see my_song_quota in the song-limit migration.
  songQuota: (clubId: string) => supabase.rpc('my_song_quota', { p_club: clubId }),
};

// Shape of the my_song_quota RPC payload (json column, typed manually).
export interface SongQuota {
  limit: number | null; // null = unlimited
  used: number;
  has_open_cycle: boolean;
}

// Spotify connection status — from streaming_status (never includes tokens).
export interface StreamingStatus {
  connected: boolean;
  provider?: string;
  display_name?: string | null;
  spotify_user_id?: string | null;
  status?: 'active' | 'needs_reconnect';
  connected_by?: string | null;
}

// Result of the spotify-sync Edge Function.
export interface SyncResult {
  ok: boolean;
  added?: number;
  removed?: number;
  playlist_url?: string | null;
  reason?: string;
  message?: string;
}

export const streaming = {
  // Connection status (any member) — drives the connect UI + playlist surfacing.
  status: (clubId: string) => supabase.rpc('streaming_status', { p_club: clubId }),
  // Owner-only: drop stored tokens (playlists/links remain on Spotify).
  disconnect: (clubId: string) => supabase.rpc('streaming_disconnect', { p_club: clubId }),
  // Owner-only: finish OAuth — server exchanges the code and stores tokens.
  connect: (clubId: string, code: string, redirectUri: string) =>
    supabase.functions.invoke<{ ok: boolean; display_name?: string; message?: string }>(
      'spotify-oauth',
      { body: { club_id: clubId, code, redirect_uri: redirectUri } },
    ),
  // Push the open cycle's songs to its playlist (owner token, server-side).
  sync: (clubId: string) =>
    supabase.functions.invoke<SyncResult>('spotify-sync', { body: { club_id: clubId } }),
  // Drop a deleted post's track from the open cycle's playlist (owner token,
  // server-side). Best-effort; no-op when not connected or it wasn't a synced track.
  removePost: (clubId: string, postId: string) =>
    supabase.functions.invoke<SyncResult>('spotify-sync', {
      body: { club_id: clubId, remove_post_id: postId },
    }),
  // Build a closed cycle's highlights + all-time favorites playlists (owner
  // token, server-side). Fired after close_cycle and from a manual button.
  // No-ops quietly (ok:false, reason) when the club hasn't connected Spotify.
  generateHighlights: (clubId: string, cycleId: string) =>
    supabase.functions.invoke<HighlightsResult>('cycle-highlights', {
      body: { club_id: clubId, cycle_id: cycleId },
    }),
};

// Result of the cycle-highlights Edge Function.
export interface HighlightsResult {
  ok: boolean;
  added?: number;
  favorites_added?: number;
  already?: boolean;
  playlist_url?: string | null;
  reason?: string;
  message?: string;
}

export const clubMembers = {
  list: (clubId: string) =>
    supabase
      .from('club_members')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
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
  // meeting_at is a full timestamp (calendar-ready); meeting_time_location is
  // the free-text location; meeting_url is an optional video-call link.
  scheduleMeeting: (
    id: string,
    meetingAt: string | null,
    location: string | null,
    meetingUrl: string | null,
  ) =>
    supabase
      .from('cycles')
      .update({ meeting_at: meetingAt, meeting_time_location: location, meeting_url: meetingUrl })
      .eq('id', id),
  // RPCs — see context/database-schema.md for semantics.
  spin: (clubId: string) => supabase.rpc('spin_wheel', { p_club: clubId }),
  pool: (clubId: string) => supabase.rpc('wheel_pool', { p_club: clubId }),
  reveal: (id: string) => supabase.rpc('reveal_cycle', { p_cycle: id }),
  close: (id: string) => supabase.rpc('close_cycle', { p_cycle: id }),
  remove: (id: string) => supabase.from('cycles').delete().eq('id', id),
  // The History detail payload — albums/scores, combined-signal top songs,
  // standout reviews, popular feed shares. Member-gated, post-reveal only.
  highlights: (cycleId: string) =>
    supabase.rpc('get_cycle_highlights', { p_cycle: cycleId }),
};

export const albums = {
  get: (id: string) => supabase.from('albums').select('*').eq('id', id).single(),
  listByCycle: (cycleId: string) =>
    supabase.from('albums').select('*').eq('cycle_id', cycleId).order('slot'),
  upsert: (album: TablesInsert<'albums'>) =>
    supabase.from('albums').upsert(album, { onConflict: 'cycle_id,slot' }).select().single(),
  remove: (id: string) => supabase.from('albums').delete().eq('id', id),
  // Albums a member has picked in a club (newest cycle first), with the cycle's
  // number + reveal state so a profile can show avg rating only once revealed.
  listByMember: (clubId: string, profileId: string) =>
    supabase
      .from('albums')
      .select('*, cycles!inner(club_id, number, revealed_at, status)')
      .eq('set_by', profileId)
      .eq('cycles.club_id', clubId)
      .order('created_at', { ascending: false }),
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
      .select('*, profiles(display_name, avatar_color, avatar_url)')
      .eq('album_id', albumId)
      .order('score', { ascending: false }),
  // The visibility-gated aggregate (see context/database-schema.md).
  summary: (albumId: string) => supabase.rpc('get_album_summary', { p_album: albumId }),
  // Raw scores for a set of albums (RLS returns rows only for revealed cycles).
  // Used to compute per-album averages on a member's profile.
  scoresForAlbums: (albumIds: string[]) =>
    supabase.from('ratings').select('album_id, score').in('album_id', albumIds),
};

// Personal per-track listening notes (rating 1–10, thumb, comment). Private by
// default; RLS opens a member's notes for an album once they share it. See the
// song_notes migration for the visibility rules.
export const songNotes = {
  // My own notes for one album, in track order (for the editor).
  mine: (albumId: string, profileId: string) =>
    supabase
      .from('song_notes')
      .select('*')
      .eq('album_id', albumId)
      .eq('profile_id', profileId)
      .order('track_number'),
  // My note rows across several albums — used to badge "X noted" in the tab.
  mineForAlbums: (albumIds: string[], profileId: string) =>
    supabase
      .from('song_notes')
      .select('album_id, track_number')
      .in('album_id', albumIds)
      .eq('profile_id', profileId),
  // Every note for an album the caller may see (own + club-shared, RLS-gated),
  // with author. Used to show others' shared notes.
  listVisible: (albumId: string) =>
    supabase
      .from('song_notes')
      .select('*, profiles(display_name, avatar_color, avatar_url)')
      .eq('album_id', albumId)
      .order('track_number'),
  // Upsert a batch of touched tracks in one round-trip.
  upsertMany: (notes: TablesInsert<'song_notes'>[]) =>
    supabase.from('song_notes').upsert(
      notes.map((n) => ({ ...n, updated_at: new Date().toISOString() })),
      { onConflict: 'album_id,profile_id,track_number' },
    ),
  // Clear notes that were emptied, by id.
  removeMany: (ids: string[]) => supabase.from('song_notes').delete().in('id', ids),
};

export const songNoteShares = {
  // Who has shared notes for these albums (club-member visible).
  listForAlbums: (albumIds: string[]) =>
    supabase.from('song_note_shares').select('*').in('album_id', albumIds),
  set: (albumId: string, profileId: string, shared: boolean) =>
    shared
      ? supabase
          .from('song_note_shares')
          .upsert({ album_id: albumId, profile_id: profileId }, { onConflict: 'album_id,profile_id' })
      : supabase
          .from('song_note_shares')
          .delete()
          .eq('album_id', albumId)
          .eq('profile_id', profileId),
};

export const preferences = {
  // RLS returns only your own row pre-reveal; everyone's after reveal.
  listByCycle: (cycleId: string) =>
    supabase.from('cycle_preferences').select('*').eq('cycle_id', cycleId),
  set: (cycleId: string, profileId: string, albumId: string) =>
    supabase.from('cycle_preferences').upsert(
      { cycle_id: cycleId, profile_id: profileId, album_id: albumId, updated_at: new Date().toISOString() },
      { onConflict: 'cycle_id,profile_id' },
    ),
};

export const rsvps = {
  listByCycle: (cycleId: string) =>
    supabase
      .from('rsvps')
      .select('*, profiles(display_name, avatar_color, avatar_url)')
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

export const feed = {
  list: (clubId: string) =>
    supabase
      .from('feed_posts')
      .select('*, profiles(display_name, avatar_color, avatar_url), post_reactions(emoji, profile_id), post_comments(count)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
  suggestions: (clubId: string) =>
    supabase
      .from('feed_posts')
      .select('*, profiles(display_name, avatar_color, avatar_url)')
      .eq('club_id', clubId)
      .eq('is_album_suggestion', true)
      .order('created_at', { ascending: false }),
  create: (post: TablesInsert<'feed_posts'>) =>
    supabase.from('feed_posts').insert(post).select().single(),
  remove: (id: string) => supabase.from('feed_posts').delete().eq('id', id),
  // Club ids that already have this post: the original plus any shared copies
  // (origin_post_id = root). RLS limits it to clubs the caller belongs to.
  sharedClubIds: (rootId: string) =>
    supabase.from('feed_posts').select('club_id').or(`id.eq.${rootId},origin_post_id.eq.${rootId}`),
  // A member's recent posts in a club — the "recently shared" strip on a profile.
  listByAuthor: (clubId: string, profileId: string, limit = 8) =>
    supabase
      .from('feed_posts')
      .select('*')
      .eq('club_id', clubId)
      .eq('author_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit),
};

export const reactions = {
  set: (postId: string, profileId: string, emoji: ReactionEmoji) =>
    supabase
      .from('post_reactions')
      .upsert({ post_id: postId, profile_id: profileId, emoji }, { onConflict: 'post_id,profile_id' }),
  clear: (postId: string, profileId: string) =>
    supabase.from('post_reactions').delete().eq('post_id', postId).eq('profile_id', profileId),
};

export const comments = {
  listByPost: (postId: string) =>
    supabase
      .from('post_comments')
      .select('*, profiles(display_name, avatar_color, avatar_url)')
      .eq('post_id', postId)
      .order('created_at'),
  add: (postId: string, authorId: string, text: string) =>
    supabase.from('post_comments').insert({ post_id: postId, author_id: authorId, text: text.trim() }),
  remove: (id: string) => supabase.from('post_comments').delete().eq('id', id),
};

// Per-cycle meeting board — short notes about the upcoming meeting (new times,
// "I can bring wine", etc.). Lives on the RSVP screen; mirrors concertComments.
export const meetingPosts = {
  listByCycle: (cycleId: string) =>
    supabase
      .from('meeting_posts')
      .select('*, profiles(display_name, avatar_color, avatar_url)')
      .eq('cycle_id', cycleId)
      .order('created_at'),
  add: (cycleId: string, authorId: string, text: string) =>
    supabase
      .from('meeting_posts')
      .insert({ cycle_id: cycleId, author_id: authorId, text: text.trim() }),
  remove: (id: string) => supabase.from('meeting_posts').delete().eq('id', id),
};

export const concerts = {
  list: (clubId: string) =>
    supabase
      .from('concerts')
      .select(
        '*, profiles(display_name, avatar_color, avatar_url), concert_interest(profile_id, status), concert_comments(count)',
      )
      .eq('club_id', clubId)
      .order('concert_date', { nullsFirst: false }),
  create: (concert: TablesInsert<'concerts'>) =>
    supabase.from('concerts').insert(concert).select().single(),
  update: (id: string, patch: TablesUpdate<'concerts'>) =>
    supabase
      .from('concerts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
  // Write a review to this concert AND every shared copy the caller can manage
  // (adder or admin of that club) — see set_concert_review. Returns the row count.
  setReview: (
    concertId: string,
    rating: number | null,
    review: string | null,
    markComplete: boolean,
  ) =>
    // p_rating/p_review accept null in SQL; the generated arg types omit
    // nullability, so assert past it.
    supabase.rpc('set_concert_review', {
      p_concert: concertId,
      p_rating: rating as number,
      p_review: review as string,
      p_mark_complete: markComplete,
    }),
  remove: (id: string) => supabase.from('concerts').delete().eq('id', id),
  // Club ids that already have this concert: the original plus any shared
  // copies (origin_concert_id = root). RLS limits this to clubs the caller is
  // a member of — exactly the clubs that matter for the share picker.
  sharedClubIds: (rootId: string) =>
    supabase.from('concerts').select('club_id').or(`id.eq.${rootId},origin_concert_id.eq.${rootId}`),
  // status null clears the row; otherwise upsert as 'interested' | 'going'.
  setInterest: (concertId: string, profileId: string, status: ConcertStatus | null) =>
    status
      ? supabase.from('concert_interest').upsert(
          { concert_id: concertId, profile_id: profileId, status },
          { onConflict: 'concert_id,profile_id' },
        )
      : supabase.from('concert_interest').delete().eq('concert_id', concertId).eq('profile_id', profileId),
};

export const concertComments = {
  listByConcert: (concertId: string) =>
    supabase
      .from('concert_comments')
      .select('*, profiles(display_name, avatar_color, avatar_url)')
      .eq('concert_id', concertId)
      .order('created_at'),
  add: (concertId: string, authorId: string, text: string) =>
    supabase
      .from('concert_comments')
      .insert({ concert_id: concertId, author_id: authorId, text: text.trim() }),
  remove: (id: string) => supabase.from('concert_comments').delete().eq('id', id),
};

export const activity = {
  list: (clubId: string) =>
    supabase
      .from('activity_events')
      // Hint the actor FK: activity_events now also FKs profiles via recipient_id,
      // so the embed must say which relationship to follow (the actor).
      .select('*, profiles!activity_events_actor_id_fkey(display_name, avatar_color, avatar_url)')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(100),
  lastRead: (clubId: string, profileId: string) =>
    supabase
      .from('activity_reads')
      .select('last_read_at')
      .eq('club_id', clubId)
      .eq('profile_id', profileId)
      .maybeSingle(),
  publish: (clubId: string, type: string, payload: Record<string, Json>) =>
    supabase.rpc('publish_activity_event', { p_club: clubId, p_type: type, p_payload: payload }),
  markRead: (clubId: string) => supabase.rpc('mark_activity_read', { p_club: clubId }),
  // Notify each tagged member that they were @-mentioned in a comment. The RPC
  // skips self-mentions and non-members; a no-op when recipients is empty.
  notifyMentions: (clubId: string, recipientIds: string[], payload: Record<string, Json>) =>
    supabase.rpc('notify_comment_mentions', {
      p_club: clubId,
      p_recipients: recipientIds,
      p_payload: payload,
    }),
};

// The club's all-time favorites — 1–3 enshrined per cycle close by the
// cycle-highlights Edge Function. Member-readable; written only server-side.
export const clubFavorites = {
  listByClub: (clubId: string) =>
    supabase
      .from('club_favorite_tracks')
      .select('*')
      .eq('club_id', clubId)
      .order('added_at', { ascending: false }),
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
