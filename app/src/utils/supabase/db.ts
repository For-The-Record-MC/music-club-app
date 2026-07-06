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
export type MusicalTake = Tables<'musical_takes'>;
export type BestBar = Tables<'best_bars'>;
export type ConvincePost = Tables<'convince_posts'>;
export type ConvinceTrack = Tables<'convince_tracks'>;
export type ConvinceVerdict = 'converted' | 'not_for_me';
export type PerfectPlaylist = Tables<'perfect_playlists'>;
export type PerfectPlaylistSong = Tables<'perfect_playlist_songs'>;
export type AuxBattle = Tables<'aux_battles'>;
export type AuxBattleSong = Tables<'aux_battle_songs'>;
export type AuxThemeIdea = Tables<'aux_battle_theme_ideas'>;
export type Bracket = Tables<'brackets'>;
export type BracketTrack = Tables<'bracket_tracks'>;
export type BracketEntry = Tables<'bracket_entries'>;
export type BracketPick = Tables<'bracket_picks'>;
export type BracketComment = Tables<'bracket_comments'>;
export type BingoGame = Tables<'bingo_games'>;
export type BingoGameCategory = Tables<'bingo_game_categories'>;
export type BingoCard = Tables<'bingo_cards'>;
export type BingoBox = Tables<'bingo_boxes'>;
export type BingoClaim = Tables<'bingo_claims'>;
export type BingoChallenge = Tables<'bingo_challenges'>;
export type BingoComment = Tables<'bingo_comments'>;
export type SongNoteShare = Tables<'song_note_shares'>;
export type AlbumImpression = Tables<'album_impressions'>;
export type VibeTag = Tables<'vibe_tags'>;
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
export type Showdown = Tables<'showdowns'>;
export type ShowdownThemeIdea = Tables<'showdown_theme_ideas'>;
export type ShowdownSubmission = Tables<'showdown_submissions'>;
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

// One song in a showdown, as returned by the list_showdown RPC. author_* and
// net_score are withheld (null) until the cycle is revealed — except for the
// caller's own entry, where author/my_vote are always present. (json, typed manually.)
export interface ShowdownEntry {
  id: string;
  title: string;
  artist: string;
  artwork_url: string | null;
  spotify_url: string | null;
  apple_url: string | null;
  created_at: string;
  is_mine: boolean;
  my_vote: 1 | -1 | null;
  author_name: string | null;
  author_color: number | null;
  author_avatar: string | null;
  net_score: number | null;
}

// The list_showdown RPC payload — the single blind-aware read path for a cycle's
// showdown. null when the cycle has no showdown.
export interface ShowdownView {
  showdown_id: string;
  theme_text: string;
  revealed: boolean;
  submission_count: number;
  downvote_unlocked: boolean;
  up_remaining: number;
  down_remaining: number;
  winner_submission_id: string | null;
  submissions: ShowdownEntry[];
}

// One past Showdown for the History tab (get_showdown_history payload). winner_*
// is null if the cycle closed with no submissions. (json, typed manually.)
export interface ShowdownHistoryRow {
  cycle_id: string;
  cycle_number: number;
  theme_text: string;
  winner_title: string | null;
  winner_artist: string | null;
  winner_artwork: string | null;
  winner_spotify_url: string | null;
  winner_apple_url: string | null;
  winner_submitter: string | null;
  winner_color: number | null;
  winner_avatar: string | null;
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
    avg_initial: number | null;
    avg_replayability: number | null;
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
    email: string | null;
    avatar_color: number;
    avatar_url: string | null;
  }[];
  takes: {
    album_id: string;
    album_title: string;
    profile_id: string;
    score: number;
    take: string;
    display_name: string | null;
    email: string | null;
    avatar_color: number;
    avatar_url: string | null;
  }[];
  cycle_vibe: { tag: string; count: number }[];
  favorite_lyrics: {
    album_id: string;
    context: string;
    lyric: string;
    display_name: string | null;
    email: string | null;
    avatar_color: number;
    avatar_url: string | null;
  }[];
  best_runs: {
    album_id: string;
    album_title: string;
    start: number;
    picks: number;
    avg_rating: number | null;
    tracks: string[];
  }[];
  most_saved: {
    album_id: string;
    album_title: string;
    artwork_url: string | null;
    track_name: string;
    saves: number;
  }[];
  head_to_head: {
    profile_id: string;
    album_id: string;
    album_title: string;
    preference_reason: string | null;
    other_album_merit: string | null;
    display_name: string | null;
    email: string | null;
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
      meeting_timezone?: string | null;
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
  // Whether the current owner may connect a PERSONAL Spotify account. When false
  // and not connected, the club's playlists are handled by the shared app account.
  can_connect?: boolean;
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
  // Push the open cycle's Perfect Playlist to its OWN Spotify playlist.
  syncPerfect: (clubId: string) =>
    supabase.functions.invoke<SyncResult>('spotify-sync', { body: { club_id: clubId, playlist: 'perfect' } }),
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
      .eq('kind', 'standard') // exclude the archive cycle (it's closed too)
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

// A proposed meeting slot with its votes embedded (one row per voter). The UI
// derives the tally + whether the current member is in.
export type MeetingTimeOption = Tables<'meeting_time_options'> & {
  meeting_time_votes: { profile_id: string }[];
};

// Meeting time poll — members propose candidate slots for a cycle and vote on
// the ones that work. The admin locks a winner via cycles.scheduleMeeting.
export const meetingPoll = {
  listOptions: (cycleId: string) =>
    supabase
      .from('meeting_time_options')
      .select('*, meeting_time_votes(profile_id)')
      .eq('cycle_id', cycleId)
      .order('slot_at', { ascending: true }),
  addOption: (cycleId: string, proposedBy: string, slotAt: string) =>
    supabase
      .from('meeting_time_options')
      .insert({ cycle_id: cycleId, proposed_by: proposedBy, slot_at: slotAt }),
  removeOption: (id: string) =>
    supabase.from('meeting_time_options').delete().eq('id', id),
  vote: (optionId: string, profileId: string) =>
    supabase.from('meeting_time_votes').insert({ option_id: optionId, profile_id: profileId }),
  unvote: (optionId: string, profileId: string) =>
    supabase
      .from('meeting_time_votes')
      .delete()
      .eq('option_id', optionId)
      .eq('profile_id', profileId),
};

// Jukebox Showdown — the optional per-cycle themed song contest. Reads go
// through list_showdown (blind until reveal); writes go through the RPCs.
export const showdown = {
  // The committed theme row for a cycle (null if none). Theme isn't secret, so
  // a direct select is fine — used by the Home card and History.
  forCycle: (cycleId: string) =>
    supabase.from('showdowns').select('*').eq('cycle_id', cycleId).maybeSingle(),
  // The unused theme-idea pool for a club: the club's own ideas + global seeds.
  ideas: (clubId: string) =>
    supabase
      .from('showdown_theme_ideas')
      .select('*')
      .or(`club_id.eq.${clubId},club_id.is.null`)
      .is('used_cycle_id', null)
      .order('created_at', { ascending: false }),
  addIdea: (clubId: string, text: string, createdBy: string) =>
    supabase.from('showdown_theme_ideas').insert({ club_id: clubId, text, created_by: createdBy }),
  // RPCs — picker/admin set the theme; the reel spins an unused idea (commit via
  // setTheme). submit/vote enforce the one-song + 2-up/1-down rules server-side.
  setTheme: (cycleId: string, text: string, ideaId?: string | null) =>
    supabase.rpc('set_showdown_theme', { p_cycle: cycleId, p_text: text, p_idea_id: ideaId ?? undefined }),
  spinTheme: (clubId: string) => supabase.rpc('spin_showdown_theme', { p_club: clubId }),
  submit: (
    showdownId: string,
    song: { title: string; artist: string; artworkUrl?: string | null; spotifyUrl?: string | null; appleUrl?: string | null },
  ) =>
    supabase.rpc('submit_showdown_song', {
      p_showdown: showdownId,
      p_title: song.title,
      p_artist: song.artist,
      p_artwork_url: song.artworkUrl ?? undefined,
      p_spotify_url: song.spotifyUrl ?? undefined,
      p_apple_url: song.appleUrl ?? undefined,
    }),
  deleteSubmission: (showdownId: string) =>
    supabase.rpc('delete_showdown_submission', { p_showdown: showdownId }),
  // value: 1 up, -1 down, 0 clears.
  vote: (submissionId: string, value: 1 | -1 | 0) =>
    supabase.rpc('cast_showdown_vote', { p_submission: submissionId, p_value: value }),
  // The single blind-aware read path — cast data as ShowdownView | null.
  list: (cycleId: string) => supabase.rpc('list_showdown', { p_cycle: cycleId }),
  // Past showdowns with their winner — cast data as ShowdownHistoryRow[].
  history: (clubId: string) => supabase.rpc('get_showdown_history', { p_club: clubId }),
  // Winning submissions' authors across the club, for the "Showdown wins" profile
  // stat (counted client-side per profile).
  winners: (clubId: string) =>
    supabase
      .from('showdowns')
      .select('winner_submission_id, showdown_submissions!showdowns_winner_fk(profile_id)')
      .eq('club_id', clubId)
      .not('winner_submission_id', 'is', null),
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
      .eq('cycles.kind', 'standard') // archive picks surface separately (claimed_by, not set_by)
      .order('created_at', { ascending: false }),
  // Every album the club has already picked, excluding the current cycle —
  // powers the soft "already done in Cycle N" resubmission warning. Archive
  // albums (number 0) are excluded so they never trigger a bogus warning.
  priorPicks: (clubId: string, excludeCycleId: string) =>
    supabase
      .from('albums')
      .select('title, artist, cycles!inner(club_id, number, kind)')
      .eq('cycles.club_id', clubId)
      .eq('cycles.kind', 'standard')
      .neq('cycle_id', excludeCycleId),
};

// The Archive — pre-club albums in the club's single archive cycle. They reuse
// the albums + ratings spine but carry no slot/reveal ritual; claimed_by names
// the member who originally picked the album. See ARCHIVE_PLAN.md.
export interface ArchiveAlbum extends Album {
  claimer: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}

export const archive = {
  // Every archive album for a club, unclaimed-first then alphabetical by artist.
  list: (clubId: string) =>
    supabase
      .from('albums')
      .select(
        '*, cycles!inner(club_id, kind), claimer:profiles!albums_claimed_by_fkey(display_name, email, avatar_color, avatar_url)',
      )
      .eq('cycles.club_id', clubId)
      .eq('cycles.kind', 'archive')
      .order('claimed_by', { nullsFirst: true })
      .order('artist', { ascending: true }),
  // Albums a member has claimed (their "Pre-FTR picks").
  listByMember: (clubId: string, profileId: string) =>
    supabase
      .from('albums')
      .select('*, cycles!inner(club_id, kind)')
      .eq('claimed_by', profileId)
      .eq('cycles.club_id', clubId)
      .eq('cycles.kind', 'archive')
      .order('artist', { ascending: true }),
  // Admin-only: add one album to the club's archive (creates the archive cycle
  // lazily). Pass a Spotify-resolved album.
  add: (
    clubId: string,
    album: {
      title: string;
      artist?: string;
      year?: number | null;
      artworkUrl?: string | null;
      spotifyUrl?: string | null;
      appleUrl?: string | null;
      tracks?: Json | null;
    },
  ) =>
    supabase.rpc('add_archive_album', {
      p_club: clubId,
      p_title: album.title,
      p_artist: album.artist ?? '',
      p_year: album.year ?? undefined,
      p_artwork_url: album.artworkUrl ?? undefined,
      p_spotify_url: album.spotifyUrl ?? undefined,
      p_apple_url: album.appleUrl ?? undefined,
      p_tracks: (album.tracks ?? undefined) as Json | undefined,
    }),
  // Claim (null→self), release (self→null), or — for admins — reassign to any
  // member. Omit profileId to claim for yourself / release your own.
  claim: (albumId: string, profileId?: string | null) =>
    supabase.rpc('claim_archive_album', { p_album: albumId, p_profile: profileId ?? undefined }),
  // Admin management of a mis-matched / unwanted archive album.
  update: (albumId: string, patch: TablesUpdate<'albums'>) =>
    supabase.from('albums').update(patch).eq('id', albumId),
  remove: (albumId: string) => supabase.from('albums').delete().eq('id', albumId),
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
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
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
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('album_id', albumId)
      .order('track_number'),
  // Upsert a batch of touched tracks in one round-trip.
  upsertMany: (notes: TablesInsert<'song_notes'>[]) =>
    supabase
      .from('song_notes')
      .upsert(
        notes.map((n) => ({ ...n, updated_at: new Date().toISOString() })),
        { onConflict: 'album_id,profile_id,track_number' },
      )
      .select('id, track_number'),
  // Clear notes that were emptied, by id.
  removeMany: (ids: string[]) => supabase.from('song_notes').delete().in('id', ids),
};

// How a member shares their album song notes: not at all, immediately, or only
// once the cycle is revealed (the read policy enforces the reveal gate).
export type ShareMode = 'now' | 'at_reveal';

export const songNoteShares = {
  // Who has shared notes for these albums (club-member visible), with mode.
  listForAlbums: (albumIds: string[]) =>
    supabase.from('song_note_shares').select('*').in('album_id', albumIds),
  // mode null = unshare (delete the row); otherwise upsert with the chosen mode.
  set: (albumId: string, profileId: string, mode: ShareMode | null) =>
    mode
      ? supabase
          .from('song_note_shares')
          .upsert({ album_id: albumId, profile_id: profileId, mode }, { onConflict: 'album_id,profile_id' })
      : supabase
          .from('song_note_shares')
          .delete()
          .eq('album_id', albumId)
          .eq('profile_id', profileId),
};

// Lightweight reactions on a shared song note (support / disagree / love). Also
// the signal for surfacing a cycle's standout note comments later.
export const SONG_NOTE_REACTIONS = [
  { value: 'support', emoji: '👍', label: 'Support' },
  { value: 'disagree', emoji: '👎', label: 'Disagree' },
  { value: 'love', emoji: '❤️', label: 'Love' },
] as const;
export type SongNoteReactionValue = (typeof SONG_NOTE_REACTIONS)[number]['value'];

export const songNoteReactions = {
  // Every reaction on any note for an album the caller can see (RLS-gated).
  listForAlbum: (albumId: string) =>
    supabase
      .from('song_note_reactions')
      .select('song_note_id, profile_id, value, song_notes!inner(album_id)')
      .eq('song_notes.album_id', albumId),
  set: (songNoteId: string, profileId: string, value: SongNoteReactionValue) =>
    supabase
      .from('song_note_reactions')
      .upsert(
        { song_note_id: songNoteId, profile_id: profileId, value },
        { onConflict: 'song_note_id,profile_id' },
      ),
  clear: (songNoteId: string, profileId: string) =>
    supabase
      .from('song_note_reactions')
      .delete()
      .eq('song_note_id', songNoteId)
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
  // The head-to-head "why this over the other" reasons, written alongside the
  // preferred-album pick. Upsert keeps the existing album_id if already set.
  setReasons: (
    cycleId: string,
    profileId: string,
    albumId: string,
    reasons: { preference_reason?: string | null; other_album_merit?: string | null },
  ) =>
    supabase.from('cycle_preferences').upsert(
      {
        cycle_id: cycleId,
        profile_id: profileId,
        album_id: albumId,
        preference_reason: reasons.preference_reason ?? null,
        other_album_merit: reasons.other_album_merit ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'cycle_id,profile_id' },
    ),
};

// Per-(album, member) FIRST-LISTEN scratchpad: an initial slider score (locks
// the first time it's set, enforced by a DB trigger) and an initial review.
// Private to the author; the formal ratings row carries the snapshot recap reads.
export const albumImpressions = {
  mine: (albumId: string, profileId: string) =>
    supabase
      .from('album_impressions')
      .select('*')
      .eq('album_id', albumId)
      .eq('profile_id', profileId)
      .maybeSingle(),
  upsert: (impression: TablesInsert<'album_impressions'>) =>
    supabase.from('album_impressions').upsert(
      { ...impression, updated_at: new Date().toISOString() },
      { onConflict: 'album_id,profile_id' },
    ),
};

// The shared vibe-tag catalog (canonical seed + member-added custom tags).
export const vibeTags = {
  list: () => supabase.from('vibe_tags').select('*').order('name'),
  // Add a custom tag. Case-insensitive uniqueness is enforced by the DB; on a
  // collision the existing row wins (ignoreDuplicates), so the picker can call
  // this optimistically when a member types a new tag.
  add: (name: string, createdBy: string) =>
    supabase
      .from('vibe_tags')
      .upsert(
        { name: name.trim(), is_canonical: false, created_by: createdBy },
        { onConflict: 'name_key', ignoreDuplicates: true },
      ),
};

export const rsvps = {
  listByCycle: (cycleId: string) =>
    supabase
      .from('rsvps')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
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
  // Club Radio: music shares only. Album *suggestions* live solely in The Queue
  // (feed.suggestions), so they're excluded here.
  list: (clubId: string) =>
    supabase
      .from('feed_posts')
      .select('*, profiles(display_name, email, avatar_color, avatar_url), post_reactions(emoji, profile_id), post_comments(count)')
      .eq('club_id', clubId)
      .eq('is_album_suggestion', false)
      .order('created_at', { ascending: false }),
  suggestions: (clubId: string) =>
    supabase
      .from('feed_posts')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
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
  // Track posts shared in this club since the open cycle started — used to warn
  // before reposting a song already shared this cycle (matched client-side on
  // spotify_uri or normalized title|artist).
  tracksThisCycle: (clubId: string, sinceIso: string) =>
    supabase
      .from('feed_posts')
      .select('title, artist, metadata')
      .eq('club_id', clubId)
      .eq('kind', 'track')
      .gte('created_at', sinceIso),
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
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('post_id', postId)
      .order('created_at'),
  add: (postId: string, authorId: string, text: string) =>
    supabase.from('post_comments').insert({ post_id: postId, author_id: authorId, text: text.trim() }),
  remove: (id: string) => supabase.from('post_comments').delete().eq('id', id),
};

// Musical Takes — a standing wall of hot takes. Positions are a 5-point
// agree↔disagree scale (-2..2); clearing one is a DELETE. Positions + a comment
// count ride along in list() the same way reactions/comments do for the feed.
export const musicalTakes = {
  list: (clubId: string) =>
    supabase
      .from('musical_takes')
      .select(
        '*, profiles(display_name, email, avatar_color, avatar_url), musical_take_positions(value, profile_id), musical_take_comments(count)',
      )
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
  create: (clubId: string, authorId: string, body: string) =>
    supabase
      .from('musical_takes')
      .insert({ club_id: clubId, author_id: authorId, body: body.trim() })
      .select()
      .single(),
  remove: (id: string) => supabase.from('musical_takes').delete().eq('id', id),
  // value in -2..2; written directly under RLS like a reaction.
  setPosition: (takeId: string, profileId: string, value: number) =>
    supabase
      .from('musical_take_positions')
      .upsert({ take_id: takeId, profile_id: profileId, value }, { onConflict: 'take_id,profile_id' }),
  clearPosition: (takeId: string, profileId: string) =>
    supabase.from('musical_take_positions').delete().eq('take_id', takeId).eq('profile_id', profileId),
  listComments: (takeId: string) =>
    supabase
      .from('musical_take_comments')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('take_id', takeId)
      .order('created_at'),
  addComment: (takeId: string, authorId: string, text: string) =>
    supabase.from('musical_take_comments').insert({ take_id: takeId, author_id: authorId, text: text.trim() }),
};

// Best Bars — a standing board of favorite lyrics. A bar pins a song + the lyric;
// members rate it 1–10 (direct upsert, like a reaction) and comment. Ratings +
// comment count ride along in list().
interface BarSongInput {
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  appleUrl: string | null;
}
export const bestBars = {
  list: (clubId: string) =>
    supabase
      .from('best_bars')
      .select(
        '*, profiles(display_name, email, avatar_color, avatar_url), best_bar_ratings(score, profile_id), best_bar_comments(count)',
      )
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
  create: (clubId: string, authorId: string, song: BarSongInput, lyric: string) =>
    supabase
      .from('best_bars')
      .insert({
        club_id: clubId,
        author_id: authorId,
        title: song.title,
        artist: song.artist,
        artwork_url: song.artworkUrl,
        spotify_url: song.spotifyUrl,
        apple_url: song.appleUrl,
        lyric: lyric.trim(),
      })
      .select()
      .single(),
  remove: (id: string) => supabase.from('best_bars').delete().eq('id', id),
  setRating: (barId: string, profileId: string, score: number) =>
    supabase
      .from('best_bar_ratings')
      .upsert({ bar_id: barId, profile_id: profileId, score }, { onConflict: 'bar_id,profile_id' }),
  clearRating: (barId: string, profileId: string) =>
    supabase.from('best_bar_ratings').delete().eq('bar_id', barId).eq('profile_id', profileId),
  listComments: (barId: string) =>
    supabase
      .from('best_bar_comments')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('bar_id', barId)
      .order('created_at'),
  addComment: (barId: string, authorId: string, text: string) =>
    supabase.from('best_bar_comments').insert({ bar_id: barId, author_id: authorId, text: text.trim() }),
};

// Convince Me — standing artist-rec board. Posts are created/verdicted through
// security-definer RPCs (so a post lands atomically with its 3 tracks, targets,
// and the discovery + per-target push events); reads + comments are direct.
export interface ConvinceTrackInput {
  title: string;
  artist: string;
  artwork_url: string | null;
  spotify_url: string | null;
  apple_url: string | null;
  norm_key: string;
}
export const convince = {
  list: (clubId: string) =>
    supabase
      .from('convince_posts')
      .select(
        '*, profiles(display_name, email, avatar_color, avatar_url), convince_tracks(*), convince_targets(profile_id, verdict), convince_comments(count)',
      )
      .eq('club_id', clubId)
      .order('created_at', { ascending: false }),
  create: (
    clubId: string,
    artist: { name: string; imageUrl: string | null; ref: string | null },
    blurb: string,
    tracks: ConvinceTrackInput[],
    targets: string[],
  ) =>
    supabase.rpc('create_convince_post', {
      p_club: clubId,
      p_artist_name: artist.name,
      p_artist_image: artist.imageUrl ?? '',
      p_artist_ref: artist.ref ?? '',
      p_blurb: blurb.trim(),
      // The RPC takes a jsonb array; the generated arg type is the opaque Json.
      p_tracks: tracks as unknown as Json,
      p_targets: targets,
    }),
  // null clears the verdict; the SQL param is nullable text but the generated
  // type marks it required, so cast to satisfy the signature while sending null.
  setVerdict: (postId: string, verdict: ConvinceVerdict | null) =>
    supabase.rpc('set_convince_verdict', { p_post: postId, p_verdict: verdict as unknown as string }),
  remove: (id: string) => supabase.from('convince_posts').delete().eq('id', id),
  listComments: (postId: string) =>
    supabase
      .from('convince_comments')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('post_id', postId)
      .order('created_at'),
  addComment: (postId: string, authorId: string, text: string) =>
    supabase.from('convince_comments').insert({ post_id: postId, author_id: authorId, text: text.trim() }),
  // "Convinced N" profile stat: how many people this member has converted in
  // this club (verdict = 'converted' on recs they authored).
  convincedCount: (clubId: string, profileId: string) =>
    supabase
      .from('convince_targets')
      .select('id, convince_posts!inner(author_id, club_id)', { count: 'exact', head: true })
      .eq('verdict', 'converted')
      .eq('convince_posts.author_id', profileId)
      .eq('convince_posts.club_id', clubId),
};

// The Perfect Playlist — one collaborative themed playlist per cycle. Picker
// kicks it off (theme + seed) via start; members add up to 3 songs each. Writes
// flow through the security-definer RPCs; reads embed songs + their contributors.
interface PlaylistSong {
  title: string;
  artist: string;
  artworkUrl?: string | null;
  spotifyUrl?: string | null;
  appleUrl?: string | null;
}
export const perfectPlaylist = {
  forCycle: (cycleId: string) =>
    supabase
      .from('perfect_playlists')
      .select(
        '*, perfect_playlist_songs(*, profiles(display_name, email, avatar_color, avatar_url))',
      )
      .eq('cycle_id', cycleId)
      .maybeSingle(),
  start: (cycleId: string, theme: string, seed: PlaylistSong) =>
    supabase.rpc('start_perfect_playlist', {
      p_cycle: cycleId,
      p_theme: theme.trim(),
      p_title: seed.title,
      p_artist: seed.artist,
      p_artwork_url: seed.artworkUrl ?? undefined,
      p_spotify_url: seed.spotifyUrl ?? undefined,
      p_apple_url: seed.appleUrl ?? undefined,
    }),
  addSong: (playlistId: string, song: PlaylistSong) =>
    supabase.rpc('add_perfect_playlist_song', {
      p_playlist: playlistId,
      p_title: song.title,
      p_artist: song.artist,
      p_artwork_url: song.artworkUrl ?? undefined,
      p_spotify_url: song.spotifyUrl ?? undefined,
      p_apple_url: song.appleUrl ?? undefined,
    }),
  removeSong: (songId: string) => supabase.rpc('remove_perfect_playlist_song', { p_song: songId }),
  // Past playlists for the History tab — theme + song count + Spotify link.
  history: (clubId: string) =>
    supabase
      .from('perfect_playlists')
      .select('id, theme_text, spotify_playlist_url, created_at, cycles!inner(number, status), perfect_playlist_songs(count)')
      .eq('club_id', clubId)
      .eq('cycles.status', 'closed')
      .order('created_at', { ascending: false }),
};

interface AuxSongInput {
  title: string;
  artist: string;
  artworkUrl?: string | null;
  spotifyUrl?: string | null;
  appleUrl?: string | null;
}
export const auxBattle = {
  // All of the cycle's matchups (not blind): combatants, their songs, every vote.
  forCycle: (cycleId: string) =>
    supabase
      .from('aux_battles')
      .select(
        '*, a:profiles!aux_battles_member_a_fkey(display_name, email, avatar_color, avatar_url), b:profiles!aux_battles_member_b_fkey(display_name, email, avatar_color, avatar_url), aux_battle_songs(*), aux_battle_votes(profile_id, choice)',
      )
      .eq('cycle_id', cycleId)
      .order('created_at'),
  // Unused theme-idea pool: club's own + global seeds. Used by the theme backlog.
  ideas: (clubId: string) =>
    supabase
      .from('aux_battle_theme_ideas')
      .select('*')
      .or(`club_id.eq.${clubId},club_id.is.null`)
      .is('used_cycle_id', null)
      .order('created_at', { ascending: false }),
  addIdea: (clubId: string, text: string, createdBy: string) =>
    supabase.from('aux_battle_theme_ideas').insert({ club_id: clubId, text: text.trim(), created_by: createdBy }),
  // Generate the whole bracket: shuffle members into pairs, theme per pair.
  start: (cycleId: string) => supabase.rpc('start_aux_battle', { p_cycle: cycleId }),
  // Picker/admin: clear the cycle's bracket (and its songs/votes) to re-roll.
  reset: (cycleId: string) => supabase.rpc('reset_aux_battle', { p_cycle: cycleId }),
  submitSong: (battleId: string, song: AuxSongInput) =>
    supabase.rpc('submit_aux_song', {
      p_battle: battleId,
      p_title: song.title,
      p_artist: song.artist,
      p_artwork_url: song.artworkUrl ?? undefined,
      p_spotify_url: song.spotifyUrl ?? undefined,
      p_apple_url: song.appleUrl ?? undefined,
    }),
  vote: (battleId: string, choice: string) => supabase.rpc('cast_aux_vote', { p_battle: battleId, p_choice: choice }),
  // Past battles with a crowned winner — the History "Aux Battle winners" section.
  history: (clubId: string) =>
    supabase
      .from('aux_battles')
      .select('id, theme_text, created_at, winner:profiles!aux_battles_winner_profile_id_fkey(display_name, email, avatar_color, avatar_url), cycles!inner(number, status)')
      .eq('club_id', clubId)
      .eq('cycles.status', 'closed')
      .not('winner_profile_id', 'is', null)
      .order('created_at', { ascending: false }),
  // "Aux Battle wins" profile stat.
  winsCount: (clubId: string, profileId: string) =>
    supabase
      .from('aux_battles')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', clubId)
      .eq('winner_profile_id', profileId),
};

// Track Madness — artist song brackets. Every member fills their own copy
// (picks via save_bracket_pick, locked by crown_champion); the spoiler-guard
// RLS hides other members' picks/entries until the caller has completed their
// own bracket or the bracket closes, so `picks`/`entries` return only what the
// caller may see. Consensus is computed client-side (utils/trackMadness.ts).
export const trackMadness = {
  open: (clubId: string) =>
    supabase
      .from('brackets')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'open')
      .maybeSingle(),
  archive: (clubId: string) =>
    supabase
      .from('brackets')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false }),
  tracks: (bracketId: string) =>
    supabase.from('bracket_tracks').select('*').eq('bracket_id', bracketId).order('seed'),
  picks: (bracketId: string) =>
    supabase.from('bracket_picks').select('profile_id, round, slot, winner_track_id').eq('bracket_id', bracketId),
  entries: (bracketId: string) =>
    supabase
      .from('bracket_entries')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('bracket_id', bracketId),
  // Spoiler-safe progress counts for the tile/status line.
  progress: (bracketId: string) => supabase.rpc('bracket_progress', { p_bracket: bracketId }),
  create: (
    clubId: string,
    artistName: string,
    artistSpotifyId: string,
    artistImageUrl: string | null,
    size: number,
    tracks: Json,
  ) =>
    supabase.rpc('create_bracket', {
      p_club: clubId,
      p_artist_name: artistName,
      p_artist_spotify_id: artistSpotifyId,
      p_artist_image_url: artistImageUrl as string,
      p_size: size,
      p_tracks: tracks,
    }),
  savePick: (bracketId: string, round: number, slot: number, winnerTrackId: string) =>
    supabase.rpc('save_bracket_pick', {
      p_bracket: bracketId,
      p_round: round,
      p_slot: slot,
      p_winner: winnerTrackId,
    }),
  crown: (bracketId: string) => supabase.rpc('crown_champion', { p_bracket: bracketId }),
  close: (bracketId: string) => supabase.rpc('close_bracket', { p_bracket: bracketId }),
  // Launcher/admin escape hatch for a botched launch (open brackets only; RLS).
  remove: (bracketId: string) => supabase.from('brackets').delete().eq('id', bracketId),
  comments: (bracketId: string) =>
    supabase
      .from('bracket_comments')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('bracket_id', bracketId)
      .order('created_at'),
  addComment: (bracketId: string, authorId: string, text: string) =>
    supabase.from('bracket_comments').insert({ bracket_id: bracketId, author_id: authorId, text: text.trim() }),
  removeComment: (id: string) => supabase.from('bracket_comments').delete().eq('id', id),
};

// Listening Bingo — cycle-tied 5x5 category bingo. Boards are fully public
// inside the club (no spoiler guard), so reads are plain selects; all writes
// flow through security-definer RPCs that enforce the game rules (time-gated
// listens, per-card song uniqueness, claim/verify state machine).
export const listeningBingo = {
  open: (clubId: string) =>
    supabase.from('bingo_games').select('*').eq('club_id', clubId).eq('status', 'open').maybeSingle(),
  archive: (clubId: string) =>
    supabase
      .from('bingo_games')
      .select('*')
      .eq('club_id', clubId)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false }),
  // The built-in pool for the launch screen (admin trims/adds before dealing).
  builtinCategories: () => supabase.from('bingo_categories').select('*').order('created_at'),
  gameCategories: (gameId: string) =>
    supabase.from('bingo_game_categories').select('*').eq('game_id', gameId),
  cards: (gameId: string) =>
    supabase
      .from('bingo_cards')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('game_id', gameId)
      .order('dealt_at'),
  boxes: (gameId: string) =>
    supabase
      .from('bingo_boxes')
      .select('*, bingo_cards!inner(game_id)')
      .eq('bingo_cards.game_id', gameId)
      .order('position'),
  claims: (gameId: string) =>
    supabase
      .from('bingo_claims')
      .select('*, bingo_cards!inner(game_id, profile_id), bingo_challenges(*)')
      .eq('bingo_cards.game_id', gameId)
      .order('claimed_at'),
  create: (clubId: string, labels: string[]) =>
    supabase.rpc('create_bingo_game', { p_club: clubId, p_labels: labels }),
  deal: (gameId: string) => supabase.rpc('deal_bingo_card', { p_game: gameId }),
  setSong: (
    boxId: string,
    song: {
      title: string;
      artist: string;
      artworkUrl?: string | null;
      spotifyUrl?: string | null;
      appleUrl?: string | null;
      spotifyId?: string | null;
      durationMs?: number | null;
      lastfmPlaycount?: number | null;
    },
  ) =>
    supabase.rpc('set_bingo_song', {
      p_box: boxId,
      p_title: song.title,
      p_artist: song.artist,
      p_artwork_url: song.artworkUrl ?? undefined,
      p_spotify_url: song.spotifyUrl ?? undefined,
      p_apple_url: song.appleUrl ?? undefined,
      p_spotify_id: song.spotifyId ?? undefined,
      p_duration_ms: song.durationMs ?? undefined,
      p_lastfm_playcount: song.lastfmPlaycount ?? undefined,
    }),
  // Backfill/refresh the rarity playcount on one of the caller's own boxes
  // (metadata only — song and listen state untouched).
  setPlaycount: (boxId: string, playcount: number) =>
    supabase.rpc('set_bingo_playcount', { p_box: boxId, p_playcount: playcount }),
  startListen: (boxId: string) => supabase.rpc('start_bingo_listen', { p_box: boxId }),
  markListened: (boxId: string) => supabase.rpc('mark_bingo_listened', { p_box: boxId }),
  claim: (cardId: string, lineIndex: number) =>
    supabase.rpc('claim_bingo', { p_card: cardId, p_line: lineIndex }),
  resolveClaim: (claimId: string, approve: boolean, challenges: { position: number; reason: string }[] = []) =>
    supabase.rpc('resolve_bingo_claim', {
      p_claim: claimId,
      p_approve: approve,
      p_challenges: challenges as unknown as Json,
    }),
  close: (gameId: string) => supabase.rpc('close_bingo_game', { p_game: gameId }),
  // Launcher/admin escape hatch for a botched launch (open games only; RLS).
  remove: (gameId: string) => supabase.from('bingo_games').delete().eq('id', gameId),
  comments: (gameId: string) =>
    supabase
      .from('bingo_comments')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
      .eq('game_id', gameId)
      .order('created_at'),
  addComment: (gameId: string, authorId: string, text: string) =>
    supabase.from('bingo_comments').insert({ game_id: gameId, author_id: authorId, text: text.trim() }),
  removeComment: (id: string) => supabase.from('bingo_comments').delete().eq('id', id),
};

// Per-cycle meeting board — short notes about the upcoming meeting (new times,
// "I can bring wine", etc.). Lives on the RSVP screen; mirrors concertComments.
export const meetingPosts = {
  listByCycle: (cycleId: string) =>
    supabase
      .from('meeting_posts')
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
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
        '*, profiles(display_name, email, avatar_color, avatar_url), concert_interest(profile_id, status), concert_comments(count)',
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
      .select('*, profiles(display_name, email, avatar_color, avatar_url)')
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
  // Owner/admin custom broadcast. Server enforces role + per-club 3/24h cap.
  postAnnouncement: (clubId: string, title: string, body: string) =>
    supabase.rpc('post_announcement', { p_club: clubId, p_title: title, p_body: body }),
  announcementQuota: (clubId: string) =>
    supabase.rpc('my_announcement_quota', { p_club: clubId }),
};

// Expo push tokens, one row per (member, device platform). Registered on login
// from native apps only — web never gets a token (see utils/push.ts).
export type PushToken = Tables<'push_tokens'>;
export const pushTokens = {
  register: (profileId: string, platform: 'ios' | 'android', token: string) =>
    supabase.from('push_tokens').upsert(
      { profile_id: profileId, platform, token, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,platform' },
    ),
  remove: (profileId: string, platform: 'ios' | 'android') =>
    supabase.from('push_tokens').delete().eq('profile_id', profileId).eq('platform', platform),
};

// Per-member notification category switches. An absent row means "defaults"
// (mentions/lifecycle/announcements on, social off) — the server coalesces the
// same way, so we only upsert once the member changes something.
export type NotificationPreferences = Tables<'notification_preferences'>;
export const notificationPrefs = {
  get: (profileId: string) =>
    supabase.from('notification_preferences').select('*').eq('profile_id', profileId).maybeSingle(),
  upsert: (profileId: string, prefs: Partial<TablesUpdate<'notification_preferences'>>) =>
    supabase.from('notification_preferences').upsert(
      { ...prefs, profile_id: profileId, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id' },
    ),
  // Per-club mute lives on the caller's membership row. Reading is plain RLS;
  // writing goes through set_club_mute (members can't UPDATE their own row).
  listMyMutes: (profileId: string) =>
    supabase.from('club_members').select('club_id, notifications_muted').eq('profile_id', profileId),
  setMute: (clubId: string, muted: boolean) =>
    supabase.rpc('set_club_mute', { p_club: clubId, p_muted: muted }),
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

export const account = {
  // Permanently delete the signed-in user's account and owned data. Server-side
  // (delete-account Edge Function) so it can use the service role to remove the
  // auth user; owned clubs are transferred to another member or deleted first.
  // Caller should sign out / route to the auth screen on { ok: true }.
  deleteSelf: () =>
    supabase.functions.invoke<{ ok: boolean; message?: string }>('delete-account', { body: {} }),
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
