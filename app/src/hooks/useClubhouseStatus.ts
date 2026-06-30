import { useMemo } from 'react';

import { useConvince } from '@/hooks/useConvince';
import { useCycle } from '@/hooks/useCycle';
import { useFeed } from '@/hooks/useFeed';
import { useAuxBattle } from '@/hooks/useAuxBattle';
import { useMusicalTakes } from '@/hooks/useMusicalTakes';
import { usePerfectPlaylist } from '@/hooks/usePerfectPlaylist';
import { useShowdown } from '@/hooks/useShowdown';
import { useAuthStore } from '@/stores/authStore';

// A single glanceable status line per Clubhouse room. `flag` marks "something
// wants you" (drives the dot on a hub tile). Phase 0 wires Feed + Showdown;
// later phases extend this as rooms ship.
export interface TileStatus {
  line: string;
  flag?: boolean;
}

export interface ClubhouseStatus {
  feed: TileStatus;
  showdown: TileStatus;
  takes: TileStatus;
  convince: TileStatus;
  playlist: TileStatus;
  aux: TileStatus;
}

// Reads the current club's live state and distills it into hub-tile summaries.
// Reuses the same hooks the rooms themselves use, so the hub never drifts from
// what you see when you open a room.
export function useClubhouseStatus(clubId: string | undefined): ClubhouseStatus {
  const { cycle } = useCycle(clubId);
  const { posts } = useFeed(clubId);
  const { view: showdown } = useShowdown(cycle?.id);
  const { takes } = useMusicalTakes(clubId);
  const { posts: recs } = useConvince(clubId);
  const { playlist } = usePerfectPlaylist(cycle?.id);
  const { battles } = useAuxBattle(cycle?.id);
  const userId = useAuthStore((s) => s.userId);

  return useMemo(() => {
    // Feed: how much has been shared since this cycle opened.
    const start = cycle ? new Date(cycle.created_at).getTime() : 0;
    const thisCycle = cycle
      ? posts.filter((p) => new Date(p.created_at).getTime() >= start).length
      : posts.length;
    const feed: TileStatus = {
      line: thisCycle > 0 ? `${thisCycle} this cycle` : 'No posts yet',
    };

    // Showdown: not started → blind submissions in → revealed.
    let showdownStatus: TileStatus;
    if (!showdown) {
      showdownStatus = { line: 'Not started' };
    } else if (showdown.revealed) {
      showdownStatus = { line: 'Revealed — see results' };
    } else {
      const n = showdown.submission_count;
      showdownStatus = {
        line: `${n} song${n === 1 ? '' : 's'} in`,
        flag: n > 0,
      };
    }

    // Takes: a standing count; no per-cycle scoping.
    const takesStatus: TileStatus = {
      line: takes.length > 0 ? `${takes.length} take${takes.length === 1 ? '' : 's'}` : 'No takes yet',
    };

    // Convince Me: standing count, with a "for you" nudge when an open rec is
    // aimed at you and you haven't returned a verdict yet.
    const forYou = recs.filter(
      (r) => r.convince_targets.some((t) => t.profile_id === userId && t.verdict == null),
    ).length;
    const convinceStatus: TileStatus =
      forYou > 0
        ? { line: `${forYou} for you`, flag: true }
        : { line: recs.length > 0 ? `${recs.length} rec${recs.length === 1 ? '' : 's'}` : 'No recs yet' };

    // Perfect Playlist: not started → song count + your remaining slots.
    let playlistStatus: TileStatus;
    if (!cycle) {
      playlistStatus = { line: 'No open cycle' };
    } else if (!playlist) {
      playlistStatus = { line: 'Not started' };
    } else {
      const total = playlist.perfect_playlist_songs.length;
      const mine = playlist.perfect_playlist_songs.filter((s) => s.profile_id === userId).length;
      playlistStatus =
        mine < 3
          ? { line: `${playlist.theme_text} · ${mine}/3 yours`, flag: true }
          : { line: `${playlist.theme_text} · ${total} songs` };
    }

    // Aux Battle: a bracket of matchups. Nudge to submit your song, then to vote
    // on the matchups you haven't yet, then the standing count.
    let auxStatus: TileStatus;
    if (!cycle) {
      auxStatus = { line: 'No open cycle' };
    } else if (battles.length === 0) {
      auxStatus = { line: 'Not started' };
    } else if (cycle.status !== 'open') {
      auxStatus = { line: `${battles.length} matchup${battles.length === 1 ? '' : 's'} · settled` };
    } else {
      const myBattle = battles.find((b) => b.member_a === userId || b.member_b === userId);
      const haveSong = myBattle?.aux_battle_songs.some((s) => s.profile_id === userId);
      const toVote = battles.filter(
        (b) => b.member_a !== userId && b.member_b !== userId && !b.aux_battle_votes.some((v) => v.profile_id === userId),
      ).length;
      if (myBattle && !haveSong) auxStatus = { line: "You're up — submit", flag: true };
      else if (toVote > 0) auxStatus = { line: `${toVote} to vote on`, flag: true };
      else auxStatus = { line: `${battles.length} matchup${battles.length === 1 ? '' : 's'}` };
    }

    return {
      feed,
      showdown: showdownStatus,
      takes: takesStatus,
      convince: convinceStatus,
      playlist: playlistStatus,
      aux: auxStatus,
    };
  }, [cycle, posts, showdown, takes, recs, playlist, battles, userId]);
}
