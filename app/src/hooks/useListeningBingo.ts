import { useCallback, useEffect, useState } from 'react';

import { registerCache } from '@/utils/dataCache';
import {
  listeningBingo,
  type BingoBox,
  type BingoCard,
  type BingoChallenge,
  type BingoClaim,
  type BingoComment,
  type BingoGame,
  type BingoGameCategory,
} from '@/utils/supabase/db';

type Member = { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;

export interface BingoCardView extends BingoCard {
  profiles: Member;
}

export interface BingoClaimView extends BingoClaim {
  bingo_cards: { game_id: string; profile_id: string };
  bingo_challenges: BingoChallenge[];
}

export interface BingoCommentView extends BingoComment {
  profiles: Member;
}

// Everything one game needs to render: boards are fully public inside the
// club, so this is a plain join-free fan-out of selects — no spoiler filtering.
export interface BingoGameState {
  game: BingoGame;
  categories: BingoGameCategory[];
  cards: BingoCardView[];
  boxes: BingoBox[]; // all cards' boxes; group by card_id client-side
  claims: BingoClaimView[];
  comments: BingoCommentView[];
}

interface BingoSnapshot {
  live: BingoGameState | null;
  archive: BingoGame[];
}

// Stale-while-revalidate cache keyed by club id — see useFeed for the pattern.
const cache = registerCache(new Map<string, BingoSnapshot>());

export function useListeningBingo(clubId: string | undefined) {
  const [live, setLive] = useState<BingoGameState | null>(() => (clubId ? cache.get(clubId)?.live : undefined) ?? null);
  const [archive, setArchive] = useState<BingoGame[]>(() => (clubId ? cache.get(clubId)?.archive : undefined) ?? []);
  const [loading, setLoading] = useState(() => !(clubId && cache.has(clubId)));

  const loadGame = useCallback(async (game: BingoGame): Promise<BingoGameState> => {
    const [categories, cards, boxes, claims, comments] = await Promise.all([
      listeningBingo.gameCategories(game.id),
      listeningBingo.cards(game.id),
      listeningBingo.boxes(game.id),
      listeningBingo.claims(game.id),
      listeningBingo.comments(game.id),
    ]);
    return {
      game,
      categories: (categories.data ?? []) as BingoGameCategory[],
      cards: (cards.data ?? []) as BingoCardView[],
      boxes: (boxes.data ?? []) as BingoBox[],
      claims: (claims.data ?? []) as unknown as BingoClaimView[],
      comments: (comments.data ?? []) as BingoCommentView[],
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
      listeningBingo.open(clubId),
      listeningBingo.archive(clubId),
    ]);
    const next: BingoSnapshot = {
      live: open ? await loadGame(open as BingoGame) : null,
      archive: (closed ?? []) as BingoGame[],
    };
    cache.set(clubId, next);
    setLive(next.live);
    setArchive(next.archive);
    setLoading(false);
  }, [clubId, loadGame]);

  // On mount or club switch: serve the cached snapshot immediately and
  // revalidate; only show the loading state when this club has never loaded.
  useEffect(() => {
    const hit = clubId ? cache.get(clubId) : undefined;
    setLive(hit?.live ?? null);
    setArchive(hit?.archive ?? []);
    setLoading(!hit);
    refresh();
  }, [clubId, refresh]);

  return { live, archive, loading, refresh, loadGame };
}
