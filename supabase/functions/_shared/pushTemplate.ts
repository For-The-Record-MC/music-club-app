// Server-side push title/body + category mapping for activity_events.
//
// This intentionally MIRRORS app/src/utils/activityTemplates.ts: that module
// renders the in-app bell, this one renders the OS push for the same events.
// Keeping push wording in TS (not SQL) means it changes without a migration.
// When you add/rename an event type, update BOTH files.
//
// `category` decides which notification_preferences switch gates the push.
// `target` is the deep link the notification tap follows — same shape as
// activityTemplates' ActivityTarget, routed by the client's response listener.

export type Category = 'mentions' | 'lifecycle' | 'social' | 'announcements';

export interface PushTarget {
  pathname: string;
  params?: Record<string, string>;
}

export interface PushContent {
  category: Category;
  title: string;
  body: string;
  target: PushTarget;
}

const HOME: PushTarget = { pathname: '/home' };

// event_type → which preference category gates it. Anything absent here is
// treated as non-pushable (returns null below).
const CATEGORY: Record<string, Category> = {
  wheel_spun: 'lifecycle',
  you_are_picker: 'mentions',
  albums_set: 'lifecycle',
  meeting_scheduled: 'lifecycle',
  meeting_reminder: 'lifecycle',
  participation_nudge: 'mentions',
  ratings_revealed: 'lifecycle',
  cycle_closed: 'lifecycle',
  showdown_started: 'lifecycle',
  showdown_winner: 'lifecycle',
  feed_post: 'social',
  concert_added: 'social',
  comment_mention: 'mentions',
  club_announcement: 'announcements',
  convince_post: 'social',
  convince_target: 'mentions',
  perfect_playlist_started: 'lifecycle',
  aux_battle_started: 'lifecycle',
  aux_battle_picked: 'mentions',
  aux_battle_winner: 'lifecycle',
  bracket_started: 'lifecycle',
  bracket_champion: 'social',
  bracket_closed: 'lifecycle',
};

export function pushCategory(eventType: string): Category | null {
  return CATEGORY[eventType] ?? null;
}

// The human phrases for a participation_nudge's open gaps (shared by push + bell
// wording). Payload carries `unrated` (count), `needs_submission`, `needs_votes`.
export function participationGapPhrases(p: Record<string, any>): string[] {
  const gaps: string[] = [];
  const unrated = Number(p.unrated ?? 0);
  if (unrated > 0) gaps.push(`rate ${unrated} album${unrated === 1 ? '' : 's'}`);
  if (p.needs_submission) gaps.push('submit a Showdown song');
  if (p.needs_votes) gaps.push('vote in the Showdown');
  return gaps;
}

interface EventRow {
  event_type: string;
  payload: Record<string, unknown> | null;
  club_id: string;
}

// Build the OS notification for an event. `clubName` is the push title (so the
// member sees which club it's from); the body carries the human sentence.
// Returns null when the event type isn't pushable.
export function pushTemplate(
  event: EventRow,
  actorName: string | null,
  clubName: string,
): PushContent | null {
  const category = pushCategory(event.event_type);
  if (!category) return null;

  const p = (event.payload ?? {}) as Record<string, any>;
  const who = actorName ?? 'Someone';
  // Title = a content-relevant headline (with emoji) + the club, so a member in
  // multiple clubs still sees which one it's from. The body carries the detail
  // sentence (no leading emoji — it now lives in the headline).
  const t = (headline: string) => `${headline} · ${clubName}`;
  const cyc = p.cycle_number ?? '?';

  switch (event.event_type) {
    case 'wheel_spun':
      return { category, title: t('🎡 Wheel spun'), body: `The wheel landed on ${p.picker_name ?? 'a member'} for cycle ${cyc}.`, target: HOME };
    case 'you_are_picker':
      return { category, title: t("🎡 You're the picker"), body: `You're up! Pick 2 albums for cycle ${cyc}.`, target: HOME };
    case 'albums_set':
      return { category, title: t('🎵 Albums are up'), body: `${who} set the albums for cycle ${cyc} — go listen.`, target: HOME };
    case 'meeting_scheduled':
      return { category, title: t('📅 Meeting scheduled'), body: `${who} scheduled the cycle ${cyc} meeting${p.meeting_date ? ` for ${p.meeting_date}` : ''}.`, target: HOME };
    case 'meeting_reminder':
      return { category, title: t('📅 Meeting reminder'), body: `Meeting's coming up for cycle ${cyc} — rate the albums first.`, target: HOME };
    case 'participation_nudge': {
      const gaps = participationGapPhrases(p);
      const onlyShowdown = Number(p.unrated ?? 0) === 0 && (p.needs_submission || p.needs_votes);
      return {
        category,
        title: t('📋 Pre-meeting checklist'),
        body: `Before the cycle ${cyc} meeting, you still need to: ${gaps.join(' · ')}.`,
        target: onlyShowdown ? { pathname: '/clubhouse/showdown' } : HOME,
      };
    }
    case 'ratings_revealed':
      return { category, title: t('🎙️ Ratings revealed'), body: `Ratings for cycle ${cyc} are revealed!`, target: HOME };
    case 'cycle_closed':
      return {
        category,
        title: t('🏁 Cycle wrapped'),
        body: `Cycle ${cyc} wrapped — see the highlights.`,
        target: p.cycle_id
          ? { pathname: '/club/[id]/cycle/[cycleId]', params: { id: String(event.club_id), cycleId: String(p.cycle_id) } }
          : HOME,
      };
    case 'showdown_started':
      return { category, title: t('🎶 Showdown started'), body: `${who} set the theme: "${p.theme ?? ''}" — submit a song.`, target: { pathname: '/clubhouse/showdown' } };
    case 'showdown_winner':
      return { category, title: t('🏆 Showdown winner'), body: `"${p.title ?? 'A song'}"${p.artist ? ` by ${p.artist}` : ''} won the cycle ${cyc} Showdown!`, target: { pathname: '/clubhouse/showdown' } };
    case 'feed_post':
      return p.is_album_suggestion
        ? {
            category,
            title: t('💿 Album queued'),
            body: `${who} queued an album: ${p.title ?? ''}`,
            target: { pathname: '/club/[id]/suggestions', params: { id: String(event.club_id) } },
          }
        : {
            category,
            title: t('🎧 New share'),
            body: `${who} shared music: ${p.title ?? ''}`,
            target: { pathname: '/clubhouse/activity', params: p.post_id ? { focus: String(p.post_id) } : undefined },
          };
    case 'concert_added':
      return { category, title: t('🎤 New concert'), body: `${who} added a concert: ${p.artist ?? ''}.`, target: { pathname: '/concerts', params: p.concert_id ? { focus: String(p.concert_id) } : undefined } };
    case 'comment_mention': {
      const where =
        p.context === 'concert' ? 'a concert comment'
        : p.context === 'meeting' ? 'the meeting board'
        : p.context === 'take' ? 'a Mic Dropper'
        : p.context === 'convince' ? 'a Change My Tune rec'
        : p.context === 'bar' ? 'a Best Bar'
        : p.context === 'bracket' ? 'the Track Madness trash talk'
        : 'a feed comment';
      const snippet = p.snippet ? `: "${p.snippet}"` : '';
      let target: PushTarget = HOME;
      if (p.context === 'concert') target = { pathname: '/concerts', params: p.concert_id ? { focus: String(p.concert_id) } : undefined };
      else if (p.context === 'meeting') target = { pathname: '/club/[id]/rsvp', params: { id: String(event.club_id) } };
      else if (p.context === 'take') target = { pathname: '/clubhouse/takes', params: p.take_id ? { focus: String(p.take_id) } : undefined };
      else if (p.context === 'convince') target = { pathname: '/clubhouse/convince', params: p.post_id ? { focus: String(p.post_id) } : undefined };
      else if (p.context === 'bar') target = { pathname: '/clubhouse/bars', params: p.bar_id ? { focus: String(p.bar_id) } : undefined };
      else if (p.context === 'bracket') target = { pathname: '/clubhouse/madness' };
      else target = { pathname: '/clubhouse/activity', params: p.post_id ? { focus: String(p.post_id) } : undefined };
      return { category, title: t('💬 You were mentioned'), body: `${who} mentioned you in ${where}${snippet}`, target };
    }
    case 'perfect_playlist_started':
      return {
        category,
        title: t('🎶 Perfect Playlist'),
        body: `${who} started the "${p.theme ?? ''}" playlist — add your songs.`,
        target: { pathname: '/clubhouse/playlist' },
      };
    case 'aux_battle_started':
      return {
        category,
        title: t('🎚️ Aux Battle'),
        body: `${who} set the bracket — ${p.pairs ?? ''} matchup${Number(p.pairs) === 1 ? '' : 's'} to vote on.`,
        target: { pathname: '/clubhouse/aux' },
      };
    case 'aux_battle_picked':
      return {
        category,
        title: t("🎚️ You're in the Aux Battle"),
        body: `Your theme: "${p.theme ?? ''}". Submit your song before the meeting.`,
        target: { pathname: '/clubhouse/aux' },
      };
    case 'aux_battle_winner':
      return {
        category,
        title: t('🏆 Aux Battle winner'),
        body: `${p.winner_name ?? 'Someone'} won the cycle ${cyc} Aux Battle ("${p.theme ?? ''}")!`,
        target: { pathname: '/clubhouse/aux' },
      };
    case 'bracket_started':
      return {
        category,
        title: t('🏆 Track Madness'),
        body: `${who} launched the ${p.artist_name ?? ''} bracket — ${p.size ?? ''} songs, seeded and ready.`,
        target: { pathname: '/clubhouse/madness' },
      };
    case 'bracket_champion':
      // Deliberately song-free: naming the champion would spoil members who
      // haven't finished their own bracket yet.
      return {
        category,
        title: t('👑 Champion crowned'),
        body: `${who} locked in their ${p.artist_name ?? ''} bracket (${p.done ?? '?'} of ${p.total ?? '?'} in).`,
        target: { pathname: '/clubhouse/madness' },
      };
    case 'bracket_closed':
      return {
        category,
        title: t('🏆 The club has spoken'),
        body: `The ${p.artist_name ?? ''} bracket is decided — see the club's champion.`,
        target: { pathname: '/clubhouse/madness' },
      };
    case 'convince_post':
      return {
        category,
        title: t('🎯 New rec'),
        body: `${who} wants to put the club on ${p.artist ?? 'an artist'}.`,
        target: { pathname: '/clubhouse/convince', params: p.post_id ? { focus: String(p.post_id) } : undefined },
      };
    case 'convince_target':
      return {
        category,
        title: t('🎯 A rec for you'),
        body: `${who} thinks you'd like ${p.artist ?? 'an artist'}. Hear them out.`,
        target: { pathname: '/clubhouse/convince', params: p.post_id ? { focus: String(p.post_id) } : undefined },
      };
    case 'club_announcement':
      return { category, title: t(`📣 ${p.title ? String(p.title) : 'Announcement'}`), body: String(p.body ?? ''), target: HOME };
    default:
      return null;
  }
}
