import { useCallback, useMemo } from 'react';

import { useConvince } from '@/hooks/useConvince';
import { useCycle } from '@/hooks/useCycle';
import { useFeed } from '@/hooks/useFeed';
import { useAuxBattle } from '@/hooks/useAuxBattle';
import { useBestBars } from '@/hooks/useBestBars';
import { useMusicalTakes } from '@/hooks/useMusicalTakes';
import { usePerfectPlaylist } from '@/hooks/usePerfectPlaylist';
import { useShowdown } from '@/hooks/useShowdown';
import { useSuggestions } from '@/hooks/useSuggestions';
import { useTrackMadness } from '@/hooks/useTrackMadness';
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
  queue: TileStatus;
  showdown: TileStatus;
  takes: TileStatus;
  convince: TileStatus;
  playlist: TileStatus;
  aux: TileStatus;
  bars: TileStatus;
  madness: TileStatus;
  loading: boolean;
  refresh: () => Promise<void>;
}

// Reads the current club's live state and distills it into hub-tile summaries.
// Reuses the same hooks the rooms themselves use, so the hub never drifts from
// what you see when you open a room.
export function useClubhouseStatus(clubId: string | undefined): ClubhouseStatus {
  const cycleHook = useCycle(clubId);
  const feedHook = useFeed(clubId);
  const cycle = cycleHook.cycle;
  const showdownHook = useShowdown(cycle?.id);
  const suggestionsHook = useSuggestions(clubId);
  const takesHook = useMusicalTakes(clubId);
  const barsHook = useBestBars(clubId);
  const convinceHook = useConvince(clubId);
  const playlistHook = usePerfectPlaylist(cycle?.id);
  const auxHook = useAuxBattle(cycle?.id);
  const madnessHook = useTrackMadness(clubId);
  const userId = useAuthStore((s) => s.userId);

  const posts = feedHook.posts;
  const showdown = showdownHook.view;
  const suggestions = suggestionsHook.suggestions;
  const takes = takesHook.takes;
  const bars = barsHook.bars;
  const recs = convinceHook.posts;
  const playlist = playlistHook.playlist;
  const battles = auxHook.battles;
  const madnessLive = madnessHook.live;

  // The hub is "loading" until the club-keyed hooks settle; the cycle-keyed
  // ones only gate once a cycle exists (their ids arrive a beat later).
  const loading =
    cycleHook.loading ||
    feedHook.loading ||
    suggestionsHook.loading ||
    takesHook.loading ||
    barsHook.loading ||
    convinceHook.loading ||
    madnessHook.loading;

  const refresh = useCallback(async () => {
    await Promise.all([
      cycleHook.refresh(),
      feedHook.refresh(),
      showdownHook.refresh(),
      suggestionsHook.refresh(),
      takesHook.refresh(),
      barsHook.refresh(),
      convinceHook.refresh(),
      playlistHook.refresh(),
      auxHook.refresh(),
      madnessHook.refresh(),
    ]);
  }, [
    cycleHook.refresh,
    feedHook.refresh,
    showdownHook.refresh,
    suggestionsHook.refresh,
    takesHook.refresh,
    barsHook.refresh,
    convinceHook.refresh,
    playlistHook.refresh,
    auxHook.refresh,
    madnessHook.refresh,
  ]);

  return useMemo(() => {
    // Feed: how much has been shared since this cycle opened.
    const start = cycle ? new Date(cycle.created_at).getTime() : 0;
    const thisCycle = cycle
      ? posts.filter((p) => new Date(p.created_at).getTime() >= start).length
      : posts.length;
    const feed: TileStatus = {
      line: thisCycle > 0 ? `${thisCycle} this cycle` : 'No posts yet',
    };

    // Queue: how many albums are lined up for future picks.
    const queue: TileStatus = {
      line: suggestions.length > 0 ? `${suggestions.length} queued` : 'Empty — add one',
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

    // Best Bars: standing count of posted lyrics.
    const barsStatus: TileStatus = {
      line: bars.length > 0 ? `${bars.length} bar${bars.length === 1 ? '' : 's'}` : 'No bars yet',
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

    // Track Madness: nudge until YOUR bracket is crowned, then show the club's
    // progress toward a decided bracket.
    let madnessStatus: TileStatus;
    if (!madnessLive) {
      madnessStatus = { line: 'No bracket live' };
    } else {
      const done = madnessLive.progress.completed_ids.length;
      const total = madnessLive.progress.total;
      const mineDone = !!userId && madnessLive.progress.completed_ids.includes(userId);
      madnessStatus = mineDone
        ? { line: `${madnessLive.bracket.artist_name} · ${done}/${total} in` }
        : { line: `${madnessLive.bracket.artist_name} · finish yours`, flag: true };
    }

    return {
      feed,
      queue,
      showdown: showdownStatus,
      takes: takesStatus,
      convince: convinceStatus,
      playlist: playlistStatus,
      aux: auxStatus,
      bars: barsStatus,
      madness: madnessStatus,
      loading,
      refresh,
    };
  }, [cycle, posts, suggestions, showdown, takes, bars, recs, playlist, battles, madnessLive, userId, loading, refresh]);
}
