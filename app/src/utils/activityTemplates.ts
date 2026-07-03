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
    case 'participation_nudge': {
      const gaps = participationGapPhrases(p);
      const onlyShowdown = Number(p.unrated ?? 0) === 0 && (p.needs_submission || p.needs_votes);
      return {
        icon: '📋',
        text: `Before the cycle ${p.cycle_number ?? '?'} meeting, you still need to: ${gaps.join(' · ')}.`,
        target: onlyShowdown ? { pathname: '/clubhouse/showdown' } : HOME,
      };
    }
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
        target: { pathname: '/clubhouse/showdown' },
      };
    case 'showdown_winner':
      return {
        icon: '🏆',
        text: `“${p.title ?? 'A song'}”${p.artist ? ` by ${p.artist}` : ''} won the cycle ${p.cycle_number ?? '?'} Showdown${p.submitter_name ? ` — ${p.submitter_name}` : ''}!`,
        target: { pathname: '/clubhouse/showdown' },
      };
    case 'feed_post':
      return p.is_album_suggestion
        ? {
            icon: '💿',
            text: `${who} queued an album: ${p.title ?? ''}`,
            target: { pathname: '/club/[id]/suggestions', params: { id: String(event.club_id) } },
          }
        : {
            icon: '🎧',
            text: `${who} shared music: ${p.title ?? ''}`,
            target: { pathname: '/clubhouse/activity', params: p.post_id ? { focus: String(p.post_id) } : undefined },
          };
    case 'musical_take':
      return {
        icon: '🔥',
        text: `${who} dropped a take: “${p.snippet ?? ''}”`,
        target: { pathname: '/clubhouse/takes', params: p.take_id ? { focus: String(p.take_id) } : undefined },
      };
    case 'perfect_playlist_started':
      return {
        icon: '🎶',
        text: `${who} kicked off the Perfect Playlist: “${p.theme ?? ''}” — add your songs.`,
        target: { pathname: '/clubhouse/playlist' },
      };
    case 'aux_battle_started':
      return {
        icon: '🎚️',
        text: `${who} set the Aux Battle bracket — ${p.pairs ?? ''} matchup${Number(p.pairs) === 1 ? '' : 's'} to vote on.`,
        target: { pathname: '/clubhouse/aux' },
      };
    case 'aux_battle_picked':
      return {
        icon: '🎚️',
        text: `You're in the Aux Battle! Your theme: “${p.theme ?? ''}” — submit your song.`,
        target: { pathname: '/clubhouse/aux' },
      };
    case 'aux_battle_winner':
      return {
        icon: '🏆',
        text: `${p.winner_name ?? 'Someone'} won the cycle ${p.cycle_number ?? '?'} Aux Battle (“${p.theme ?? ''}”)!`,
        target: { pathname: '/clubhouse/aux' },
      };
    case 'bracket_started':
      return {
        icon: '🏆',
        text: `${who} launched the ${p.artist_name ?? ''} Track Madness bracket — ${p.size ?? ''} songs, seeded and ready.`,
        target: { pathname: '/clubhouse/madness' },
      };
    case 'bracket_champion':
      // Song-free on purpose — the champion is a spoiler for anyone mid-bracket.
      return {
        icon: '👑',
        text: `${who} locked in their ${p.artist_name ?? ''} bracket (${p.done ?? '?'} of ${p.total ?? '?'} in).`,
        target: { pathname: '/clubhouse/madness' },
      };
    case 'bracket_closed':
      return {
        icon: '🏆',
        text: `The ${p.artist_name ?? ''} bracket is decided — see the club's champion.`,
        target: { pathname: '/clubhouse/madness' },
      };
    case 'best_bar':
      return {
        icon: '🎤',
        text: `${who} dropped a bar from ${p.title ?? 'a song'}: “${p.snippet ?? ''}”`,
        target: { pathname: '/clubhouse/bars', params: p.bar_id ? { focus: String(p.bar_id) } : undefined },
      };
    case 'convince_post':
      return {
        icon: '🎯',
        text: `${who} wants to put the club on ${p.artist ?? 'an artist'}.`,
        target: { pathname: '/clubhouse/convince', params: p.post_id ? { focus: String(p.post_id) } : undefined },
      };
    case 'convince_target':
      return {
        icon: '🎯',
        text: `${who} thinks you'd like ${p.artist ?? 'an artist'} — hear the case.`,
        target: { pathname: '/clubhouse/convince', params: p.post_id ? { focus: String(p.post_id) } : undefined },
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
            : p.context === 'take'
              ? 'a Mic Dropper'
              : p.context === 'convince'
                ? 'a Change My Tune rec'
                : p.context === 'bar'
                  ? 'a Best Bar'
                  : p.context === 'bracket'
                    ? 'the Track Madness trash talk'
                    : 'a feed comment';
      const snippet = p.snippet ? `: “${p.snippet}”` : '';
      let target: ActivityTarget | undefined;
      if (p.context === 'concert')
        target = { pathname: '/concerts', params: p.concert_id ? { focus: String(p.concert_id) } : undefined };
      else if (p.context === 'meeting')
        target = { pathname: '/club/[id]/rsvp', params: { id: String(event.club_id) } };
      else if (p.context === 'take')
        target = { pathname: '/clubhouse/takes', params: p.take_id ? { focus: String(p.take_id) } : undefined };
      else if (p.context === 'convince')
        target = { pathname: '/clubhouse/convince', params: p.post_id ? { focus: String(p.post_id) } : undefined };
      else if (p.context === 'bar')
        target = { pathname: '/clubhouse/bars', params: p.bar_id ? { focus: String(p.bar_id) } : undefined };
      else if (p.context === 'bracket') target = { pathname: '/clubhouse/madness' };
      else
        target = { pathname: '/clubhouse/activity', params: p.post_id ? { focus: String(p.post_id) } : undefined };
      return { icon: '💬', text: `${who} mentioned you in ${where}${snippet}`, target };
    }
    default:
      return { icon: '•', text: `${who} did something.` };
  }
}

// The human phrases for a participation_nudge's open gaps. Mirrors
// participationGapPhrases in supabase/functions/_shared/pushTemplate.ts — keep
// the two in sync (bell wording vs OS push wording).
function participationGapPhrases(p: Record<string, any>): string[] {
  const gaps: string[] = [];
  const unrated = Number(p.unrated ?? 0);
  if (unrated > 0) gaps.push(`rate ${unrated} album${unrated === 1 ? '' : 's'}`);
  if (p.needs_submission) gaps.push('submit a Showdown song');
  if (p.needs_votes) gaps.push('vote in the Showdown');
  return gaps;
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
