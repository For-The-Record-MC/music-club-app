import type { ActivityEvent } from '@/utils/supabase/db';

// Activity-feed rows store no display text — only event_type + payload. This
// renders each event client-side, so wording can change without a migration.
// To add an event type: publish it (publish_activity_event) and add a case here.

// Where tapping an activity row should take you. `pathname` is a tab route;
// `params.focus` (when present) is the id of the specific item to scroll to and
// highlight on that tab.
export interface ActivityTarget {
  pathname: string;
  params?: Record<string, string>;
}

interface Rendered {
  icon: string;
  text: string;
  target?: ActivityTarget;
}

// Cycle-wide events (spin, albums, meeting, reveal) all live on the Home tab,
// which always shows the current cycle.
const HOME: ActivityTarget = { pathname: '/home' };

export function renderActivity(event: ActivityEvent, actorName: string | null): Rendered {
  const p = (event.payload ?? {}) as Record<string, any>;
  const who = actorName ?? 'Someone';
  switch (event.event_type) {
    case 'wheel_spun':
      return {
        icon: '🎡',
        text: `The wheel landed on ${p.picker_name ?? 'a member'} for cycle ${p.cycle_number ?? '?'}.`,
        target: HOME,
      };
    case 'you_are_picker':
      return {
        icon: '🎡',
        text: `You're up — pick 2 albums for cycle ${p.cycle_number ?? '?'}.`,
        target: HOME,
      };
    case 'albums_set':
      return { icon: '🎵', text: `${who} set the albums for cycle ${p.cycle_number ?? '?'}.`, target: HOME };
    case 'meeting_scheduled':
      return {
        icon: '📅',
        text: `${who} scheduled the cycle ${p.cycle_number ?? '?'} meeting${p.meeting_date ? ` for ${p.meeting_date}` : ''}.`,
        target: HOME,
      };
    case 'meeting_reminder':
      return {
        icon: '📅',
        text: `Meeting's coming up for cycle ${p.cycle_number ?? '?'} — rate the albums first.`,
        target: HOME,
      };
    case 'ratings_revealed':
      return { icon: '🎙️', text: `Ratings for cycle ${p.cycle_number ?? '?'} are revealed!`, target: HOME };
    case 'cycle_closed':
      return {
        icon: '🏁',
        text: `Cycle ${p.cycle_number ?? '?'} wrapped — see the highlights.`,
        target: p.cycle_id
          ? { pathname: '/club/[id]/cycle/[cycleId]', params: { id: String(event.club_id), cycleId: String(p.cycle_id) } }
          : HOME,
      };
    case 'showdown_started':
      return {
        icon: '🎵',
        text: `${who} set the Jukebox Showdown theme for cycle ${p.cycle_number ?? '?'}: “${p.theme ?? ''}”`,
        target: { pathname: '/feed', params: { tab: 'showdown' } },
      };
    case 'showdown_winner':
      return {
        icon: '🏆',
        text: `“${p.title ?? 'A song'}”${p.artist ? ` by ${p.artist}` : ''} won the cycle ${p.cycle_number ?? '?'} Showdown${p.submitter_name ? ` — ${p.submitter_name}` : ''}!`,
        target: { pathname: '/feed', params: { tab: 'showdown' } },
      };
    case 'feed_post':
      return {
        icon: p.is_album_suggestion ? '💡' : '🎧',
        text: `${who} shared ${p.is_album_suggestion ? 'an album suggestion' : 'music'}: ${p.title ?? ''}`,
        target: { pathname: '/feed', params: p.post_id ? { focus: String(p.post_id) } : undefined },
      };
    case 'concert_added':
      return {
        icon: '🎤',
        text: `${who} added a concert: ${p.artist ?? ''}.`,
        target: { pathname: '/concerts', params: p.concert_id ? { focus: String(p.concert_id) } : undefined },
      };
    case 'club_announcement':
      return {
        icon: '📣',
        text: p.title ? `${p.title}: ${p.body ?? ''}` : `${p.body ?? 'Announcement'}`,
        target: HOME,
      };
    case 'comment_mention': {
      const where =
        p.context === 'concert'
          ? 'a concert comment'
          : p.context === 'meeting'
            ? 'the meeting board'
            : 'a feed comment';
      const snippet = p.snippet ? `: “${p.snippet}”` : '';
      let target: ActivityTarget | undefined;
      if (p.context === 'concert')
        target = { pathname: '/concerts', params: p.concert_id ? { focus: String(p.concert_id) } : undefined };
      else if (p.context === 'meeting')
        target = { pathname: '/club/[id]/rsvp', params: { id: String(event.club_id) } };
      else
        target = { pathname: '/feed', params: p.post_id ? { focus: String(p.post_id) } : undefined };
      return { icon: '💬', text: `${who} mentioned you in ${where}${snippet}`, target };
    }
    default:
      return { icon: '•', text: `${who} did something.` };
  }
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
