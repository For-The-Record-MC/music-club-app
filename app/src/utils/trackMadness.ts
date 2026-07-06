// Track Madness compute layer — pure functions over bracket rows (memoize at
// the screen level per the compute-function rule), plus the bracket-seed Edge
// Function wrapper (the Spotify/Last.fm seeding proxy, same pattern as
// utils/spotify.ts).
//
// Terminology: a bracket of `size` tracks has rounds(size) rounds; round r has
// size / 2^r slots (matchups). Round 1 slot s is fed by the tracks at bracket
// positions 2s-1 / 2s (position = tournament placement, computed server-side);
// round r>1 slot s is fed by a member's own picks at (r-1, 2s-1) / (r-1, 2s).

import { supabase } from './supabase/client';
import type { BracketPick, BracketTrack } from './supabase/db';

export function bracketRounds(size: number): number {
  return Math.round(Math.log2(size));
}

export const pickKey = (round: number, slot: number) => `${round}:${slot}`;

// `${round}:${slot}` → winner_track_id, one member's bracket state.
export type PickMap = Record<string, string>;

export function toPickMap(picks: Pick<BracketPick, 'round' | 'slot' | 'winner_track_id'>[]): PickMap {
  const map: PickMap = {};
  for (const p of picks) map[pickKey(p.round, p.slot)] = p.winner_track_id;
  return map;
}

// The two tracks contesting (round, slot) under `picks`, or null while a feeder
// is undecided. Round 1 feeders come from tournament positions and always exist.
export function matchupFeeders(
  round: number,
  slot: number,
  byPosition: Map<number, BracketTrack>,
  byId: Map<string, BracketTrack>,
  picks: PickMap,
): [BracketTrack, BracketTrack] | null {
  if (round === 1) {
    const a = byPosition.get(2 * slot - 1);
    const b = byPosition.get(2 * slot);
    return a && b ? [a, b] : null;
  }
  const aId = picks[pickKey(round - 1, 2 * slot - 1)];
  const bId = picks[pickKey(round - 1, 2 * slot)];
  const a = aId ? byId.get(aId) : undefined;
  const b = bId ? byId.get(bId) : undefined;
  return a && b ? [a, b] : null;
}

export interface Matchup {
  round: number;
  slot: number;
  a: BracketTrack;
  b: BracketTrack;
}

// The member's undecided-but-ready matchups in play order (round asc, slot asc)
// — the versus-card queue. Empty means the tree is complete and crownable.
export function nextMatchups(
  size: number,
  tracks: BracketTrack[],
  picks: PickMap,
): Matchup[] {
  const byPosition = new Map(tracks.map((t) => [t.position, t]));
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const out: Matchup[] = [];
  const rounds = bracketRounds(size);
  for (let round = 1; round <= rounds; round++) {
    const slots = size / 2 ** round;
    for (let slot = 1; slot <= slots; slot++) {
      if (picks[pickKey(round, slot)]) continue;
      const feeders = matchupFeeders(round, slot, byPosition, byId, picks);
      if (feeders) out.push({ round, slot, a: feeders[0], b: feeders[1] });
    }
  }
  return out;
}

export function picksComplete(size: number, picks: PickMap): boolean {
  return Object.keys(picks).length === size - 1;
}

// Apply a pick locally — the optimistic mirror of save_bracket_pick, including
// its downstream rule: changing a matchup deletes the later picks on this
// branch that had advanced the replaced winner (a track's path is unique, so
// those are exactly the invalidated ones).
export function applyPick(
  picks: PickMap,
  size: number,
  round: number,
  slot: number,
  winnerId: string,
): PickMap {
  const next = { ...picks };
  const old = next[pickKey(round, slot)];
  next[pickKey(round, slot)] = winnerId;
  if (old && old !== winnerId) {
    const rounds = bracketRounds(size);
    for (let r = round + 1; r <= rounds; r++) {
      const s = Math.floor((slot - 1) / 2 ** (r - round)) + 1;
      if (next[pickKey(r, s)] === old) delete next[pickKey(r, s)];
    }
  }
  return next;
}

// March-Madness-style name for the round holding `slots` matchups.
export function roundName(size: number, round: number): string {
  const teams = size / 2 ** (round - 1);
  if (teams === 2) return 'The Championship';
  if (teams === 4) return 'Final Four';
  if (teams === 8) return 'Elite Eight';
  if (teams === 16) return 'Sweet 16';
  return `Round of ${teams}`;
}

// ── Club consensus ──
//
// The locked rule: every song earns 1 advancement point per matchup win across
// all COMPLETED brackets; the consensus bracket is played forward from the real
// seeding, each matchup won by the higher-pointed song. Tie → head-to-head net
// wins among members who actually faced that pair; still tied → better seed.

export interface ConsensusResult {
  picks: PickMap; // the consensus tree, same shape as a member bracket
  champion: BracketTrack | null;
  points: Map<string, number>; // trackId → total advancement points
}

export function computeConsensus(
  size: number,
  tracks: BracketTrack[],
  completedPickMaps: PickMap[],
): ConsensusResult {
  const byPosition = new Map(tracks.map((t) => [t.position, t]));
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const rounds = bracketRounds(size);

  const points = new Map<string, number>();
  // Net head-to-head: h2h.get(`${a}|${b}`) = times a beat b directly.
  const h2h = new Map<string, number>();
  for (const picks of completedPickMaps) {
    for (let round = 1; round <= rounds; round++) {
      const slots = size / 2 ** round;
      for (let slot = 1; slot <= slots; slot++) {
        const winner = picks[pickKey(round, slot)];
        if (!winner) continue;
        points.set(winner, (points.get(winner) ?? 0) + 1);
        const feeders = matchupFeeders(round, slot, byPosition, byId, picks);
        if (!feeders) continue;
        const loser = feeders[0].id === winner ? feeders[1] : feeders[0];
        const key = `${winner}|${loser.id}`;
        h2h.set(key, (h2h.get(key) ?? 0) + 1);
      }
    }
  }

  const beats = (a: BracketTrack, b: BracketTrack): boolean => {
    const pa = points.get(a.id) ?? 0;
    const pb = points.get(b.id) ?? 0;
    if (pa !== pb) return pa > pb;
    const net = (h2h.get(`${a.id}|${b.id}`) ?? 0) - (h2h.get(`${b.id}|${a.id}`) ?? 0);
    if (net !== 0) return net > 0;
    return a.seed < b.seed;
  };

  const consensus: PickMap = {};
  // Play forward: current[i] is the contestant entering round r from feeder i.
  let current: BracketTrack[] = [];
  for (let p = 1; p <= size; p++) {
    const t = byPosition.get(p);
    if (!t) return { picks: {}, champion: null, points };
    current.push(t);
  }
  for (let round = 1; round <= rounds; round++) {
    const next: BracketTrack[] = [];
    for (let slot = 1; slot <= current.length / 2; slot++) {
      const a = current[2 * slot - 2];
      const b = current[2 * slot - 1];
      const winner = beats(a, b) ? a : b;
      consensus[pickKey(round, slot)] = winner.id;
      next.push(winner);
    }
    current = next;
  }

  return { picks: consensus, champion: current[0] ?? null, points };
}

// ── Stats panel ──

export interface BracketStats {
  championTally: { track: BracketTrack; count: number }[]; // desc
  finalFourTally: { track: BracketTrack; count: number }[]; // desc, top 8
  // Round-1 matchup with the closest split among completed brackets (null until
  // 2+ members disagree-ably in).
  mostControversial: { a: BracketTrack; b: BracketTrack; aVotes: number; bVotes: number } | null;
  // The consensus result with the biggest seed differential in the winner's
  // disfavor (a 12-seed knocking out a 5, etc.).
  biggestUpset: { winner: BracketTrack; loser: BracketTrack; round: number } | null;
}

export function computeStats(
  size: number,
  tracks: BracketTrack[],
  completedPickMaps: PickMap[],
  consensus: ConsensusResult,
): BracketStats {
  const byPosition = new Map(tracks.map((t) => [t.position, t]));
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const rounds = bracketRounds(size);

  const tally = (ids: (string | undefined)[]) => {
    const counts = new Map<string, number>();
    for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()]
      .map(([id, count]) => ({ track: byId.get(id)!, count }))
      .filter((x) => x.track)
      .sort((x, y) => y.count - x.count);
  };

  const championTally = tally(completedPickMaps.map((p) => p[pickKey(rounds, 1)]));
  // Final four = the semifinal field = winners at round rounds-2 (4 per member).
  const ffRound = rounds - 2;
  const finalFourTally = tally(
    completedPickMaps.flatMap((p) =>
      Array.from({ length: 4 }, (_, i) => p[pickKey(ffRound, i + 1)]),
    ),
  ).slice(0, 8);

  let mostControversial: BracketStats['mostControversial'] = null;
  let bestMargin = Number.POSITIVE_INFINITY;
  let bestTurnout = 0;
  for (let slot = 1; slot <= size / 2; slot++) {
    const a = byPosition.get(2 * slot - 1);
    const b = byPosition.get(2 * slot);
    if (!a || !b) continue;
    let aVotes = 0;
    let bVotes = 0;
    for (const picks of completedPickMaps) {
      const w = picks[pickKey(1, slot)];
      if (w === a.id) aVotes++;
      else if (w === b.id) bVotes++;
    }
    const total = aVotes + bVotes;
    if (total < 2 || aVotes === 0 || bVotes === 0) continue;
    // Closest split wins; turnout breaks ties.
    const margin = Math.abs(aVotes - bVotes);
    if (margin < bestMargin || (margin === bestMargin && total > bestTurnout)) {
      bestMargin = margin;
      bestTurnout = total;
      mostControversial = { a, b, aVotes, bVotes };
    }
  }

  let biggestUpset: BracketStats['biggestUpset'] = null;
  let bestDiff = 0;
  for (let round = 1; round <= rounds; round++) {
    const slots = size / 2 ** round;
    for (let slot = 1; slot <= slots; slot++) {
      const feeders = matchupFeeders(round, slot, byPosition, byId, consensus.picks);
      const winnerId = consensus.picks[pickKey(round, slot)];
      if (!feeders || !winnerId) continue;
      const winner = feeders[0].id === winnerId ? feeders[0] : feeders[1];
      const loser = feeders[0].id === winnerId ? feeders[1] : feeders[0];
      const diff = winner.seed - loser.seed;
      if (diff > bestDiff) {
        bestDiff = diff;
        biggestUpset = { winner, loser, round };
      }
    }
  }

  return { championTally, finalFourTally, mostControversial, biggestUpset };
}

// ── bracket-seed Edge Function wrapper ──

// One ranked candidate from the seeding function, best-first. playcount is
// Last.fm scrobbles (0 when ranking fell back to Spotify popularity).
export interface SeedCandidate {
  title: string;
  album: string;
  artworkUrl: string;
  spotifyUrl: string;
  spotifyId: string;
  playcount: number;
}

export interface SeedResult {
  results: SeedCandidate[];
  source: 'lastfm' | 'spotify';
}

// Fetch the ranked candidate list for an artist (up to 64 + alternates).
// Returns null on any failure so the creation screen can show a retry.
export async function fetchSeedCandidates(
  artistId: string,
  artistName: string,
): Promise<SeedResult | null> {
  const { data, error } = await supabase.functions.invoke<SeedResult & { ok?: false; message?: string }>(
    'bracket-seed',
    { body: { artistId, artistName } },
  );
  if (error || !data || data.ok === false || !Array.isArray(data.results)) return null;
  return { results: data.results, source: data.source === 'spotify' ? 'spotify' : 'lastfm' };
}


// ── Solo-rankings import ─────────────────────────────────
// Turn a finished personal bracket into a full pick set for a NEW bracket of
// the same artist. Track lists differ between seedings, so this maps by
// advancement score, not by matchup: every win in the solo bracket earns its
// track a point; new-bracket matchups are decided by higher score (unmatched
// tracks score -1, ties break toward the better seed). The result is a
// starting point the member reviews and can freely redo before crowning.

function trackKey(t: { spotify_url: string | null; title: string }): string {
  const m = t.spotify_url?.match(/track\/([A-Za-z0-9]+)/);
  return m ? `id:${m[1]}` : `t:${t.title.trim().toLowerCase()}`;
}

export function deriveImportPicks(
  size: number,
  newTracks: BracketTrack[],
  soloTracks: BracketTrack[],
  soloPicks: { winner_track_id: string }[],
): { round: number; slot: number; winner: string }[] {
  // Advancement score per solo track id.
  const wins = new Map<string, number>();
  for (const p of soloPicks) wins.set(p.winner_track_id, (wins.get(p.winner_track_id) ?? 0) + 1);
  // Solo score keyed by track identity.
  const soloScore = new Map<string, number>();
  for (const t of soloTracks) soloScore.set(trackKey(t), wins.get(t.id) ?? 0);

  const score = (t: BracketTrack): number => soloScore.get(trackKey(t)) ?? -1;
  const byPosition = new Map(newTracks.map((t) => [t.position, t]));
  const rounds = bracketRounds(size);

  const picks: { round: number; slot: number; winner: string }[] = [];
  // winners[slot] per round, starting from positions.
  let feeders: BracketTrack[] = Array.from({ length: size }, (_, i) => byPosition.get(i + 1)!);
  for (let round = 1; round <= rounds; round++) {
    const next: BracketTrack[] = [];
    for (let slot = 1; slot <= size / 2 ** round; slot++) {
      const a = feeders[2 * slot - 2];
      const b = feeders[2 * slot - 1];
      const winner =
        score(a) > score(b) ? a : score(b) > score(a) ? b : a.seed <= b.seed ? a : b;
      picks.push({ round, slot, winner: winner.id });
      next.push(winner);
    }
    feeders = next;
  }
  return picks;
}
