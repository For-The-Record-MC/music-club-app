import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import {
  trackMadness,
  type Bracket,
  type BracketComment,
  type BracketEntry,
  type BracketTrack,
} from '@/utils/supabase/db';

type Member = { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;

export interface BracketEntryView extends BracketEntry {
  profiles: Member;
}

export interface BracketCommentView extends BracketComment {
  profiles: Member;
}

// What RLS lets the caller see: always their own picks; everyone's once they've
// completed their bracket (or it closed) — the spoiler guard lives server-side,
// so this shape is safe to render as-is.
export interface VisiblePick {
  profile_id: string;
  round: number;
  slot: number;
  winner_track_id: string;
}

// Spoiler-free progress from the bracket_progress RPC.
export interface BracketProgress {
  total: number;
  completed_ids: string[];
  started_ids: string[];
}

export interface BracketState {
  bracket: Bracket;
  tracks: BracketTrack[];
  picks: VisiblePick[];
  entries: BracketEntryView[];
  progress: BracketProgress;
  comments: BracketCommentView[];
}

interface MadnessSnapshot {
  live: BracketState | null;
  archive: Bracket[];
}

// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, MadnessSnapshot>());

export function useTrackMadness(clubId: string | undefined) {
  const [live, setLive] = useState<BracketState | null>(() => (clubId ? cache.get(clubId)?.live : undefined) ?? null);
  const [archive, setArchive] = useState<Bracket[]>(() => (clubId ? cache.get(clubId)?.archive : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const loadBracket = useCallback(async (bracket: Bracket): Promise<BracketState> => {
    const [tracks, picks, entries, progress, comments] = await Promise.all([
      trackMadness.tracks(bracket.id),
      trackMadness.picks(bracket.id),
      trackMadness.entries(bracket.id),
      trackMadness.progress(bracket.id),
      trackMadness.comments(bracket.id),
    ]);
    return {
      bracket,
      tracks: (tracks.data ?? []) as BracketTrack[],
      picks: (picks.data ?? []) as VisiblePick[],
      entries: (entries.data ?? []) as BracketEntryView[],
      progress: (progress.data ?? {
        total: 0,
        completed_ids: [],
        started_ids: [],
      }) as unknown as BracketProgress,
      comments: (comments.data ?? []) as BracketCommentView[],
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!clubId) {
      setLive(null);
      setArchive([]);
      setLoading(false);
      return;
    }
    const [{ data: open }, { data: closed }] = await Promise.all([
      trackMadness.open(clubId),
      trackMadness.archive(clubId),
    ]);
    const next: MadnessSnapshot = {
      live: open ? await loadBracket(open as Bracket) : null,
      archive: (closed ?? []) as Bracket[],
    };
    cache.set(clubId, next);
    setLive(next.live);
    setArchive(next.archive);
    setLoading(false);
  }, [clubId, loadBracket]);

  // On mount or club switch: serve the cached snapshot immediately and
  // revalidate; only show the record when this club has never been loaded.
  useEffect(() => {
    const hit = clubId ? cache.get(clubId) : undefined;
    setLive(hit?.live ?? null);
    setArchive(hit?.archive ?? []);
    setLoading(!hit);
    refresh();
  }, [clubId, refresh]);

  return { live, archive, loading, refresh, loadBracket };
}
