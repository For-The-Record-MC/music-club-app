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
  const title = clubName;

  switch (event.event_type) {
    case 'wheel_spun':
      return { category, title, body: `🎡 The wheel landed on ${p.picker_name ?? 'a member'} for cycle ${p.cycle_number ?? '?'}.`, target: HOME };
    case 'you_are_picker':
      return { category, title, body: `🎡 You're up! Pick 2 albums for cycle ${p.cycle_number ?? '?'}.`, target: HOME };
    case 'albums_set':
      return { category, title, body: `🎵 ${who} set the albums for cycle ${p.cycle_number ?? '?'} — go listen.`, target: HOME };
    case 'meeting_scheduled':
      return { category, title, body: `📅 ${who} scheduled the cycle ${p.cycle_number ?? '?'} meeting${p.meeting_date ? ` for ${p.meeting_date}` : ''}.`, target: HOME };
    case 'meeting_reminder':
      return { category, title, body: `📅 Meeting's coming up for cycle ${p.cycle_number ?? '?'} — rate the albums first.`, target: HOME };
    case 'participation_nudge': {
      const gaps = participationGapPhrases(p);
      const onlyShowdown = Number(p.unrated ?? 0) === 0 && (p.needs_submission || p.needs_votes);
      return {
        category,
        title,
        body: `📋 Before the cycle ${p.cycle_number ?? '?'} meeting, you still need to: ${gaps.join(' · ')}.`,
        target: onlyShowdown ? { pathname: '/feed', params: { tab: 'showdown' } } : HOME,
      };
    }
    case 'ratings_revealed':
      return { category, title, body: `🎙️ Ratings for cycle ${p.cycle_number ?? '?'} are revealed!`, target: HOME };
    case 'cycle_closed':
      return {
        category,
        title,
        body: `🏁 Cycle ${p.cycle_number ?? '?'} wrapped — see the highlights.`,
        target: p.cycle_id
          ? { pathname: '/club/[id]/cycle/[cycleId]', params: { id: String(event.club_id), cycleId: String(p.cycle_id) } }
          : HOME,
      };
    case 'showdown_started':
      return { category, title, body: `🎵 ${who} set the Jukebox Showdown theme: "${p.theme ?? ''}" — submit a song.`, target: { pathname: '/feed', params: { tab: 'showdown' } } };
    case 'showdown_winner':
      return { category, title, body: `🏆 "${p.title ?? 'A song'}"${p.artist ? ` by ${p.artist}` : ''} won the cycle ${p.cycle_number ?? '?'} Showdown!`, target: { pathname: '/feed', params: { tab: 'showdown' } } };
    case 'feed_post':
      return { category, title, body: `${p.is_album_suggestion ? '💡' : '🎧'} ${who} shared ${p.is_album_suggestion ? 'an album suggestion' : 'music'}: ${p.title ?? ''}`, target: { pathname: '/feed', params: p.post_id ? { focus: String(p.post_id) } : undefined } };
    case 'concert_added':
      return { category, title, body: `🎤 ${who} added a concert: ${p.artist ?? ''}.`, target: { pathname: '/concerts', params: p.concert_id ? { focus: String(p.concert_id) } : undefined } };
    case 'comment_mention': {
      const where = p.context === 'concert' ? 'a concert comment' : p.context === 'meeting' ? 'the meeting board' : 'a feed comment';
      const snippet = p.snippet ? `: "${p.snippet}"` : '';
      let target: PushTarget = HOME;
      if (p.context === 'concert') target = { pathname: '/concerts', params: p.concert_id ? { focus: String(p.concert_id) } : undefined };
      else if (p.context === 'meeting') target = { pathname: '/club/[id]/rsvp', params: { id: String(event.club_id) } };
      else target = { pathname: '/feed', params: p.post_id ? { focus: String(p.post_id) } : undefined };
      return { category, title, body: `💬 ${who} mentioned you in ${where}${snippet}`, target };
    }
    case 'club_announcement':
      return { category, title: `📣 ${clubName}${p.title ? ` — ${p.title}` : ''}`, body: String(p.body ?? ''), target: HOME };
    default:
      return null;
  }
}
