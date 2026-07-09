// Listening Bingo board math — pure functions over the 5x5 grid. Mirrors the
// SQL helpers in the listening_bingo migration; keep the two in sync.
//
// Positions 0–24 row-major; 12 is the free center (no box row exists for it).
// Line indexes 0–11: 0–4 rows (top→bottom), 5–9 columns (left→right),
// 10 main diagonal (TL→BR), 11 anti-diagonal (TR→BL).

import type { BingoBox } from '@/utils/supabase/db';

export const FREE_POSITION = 12;

export function linePositions(line: number): number[] {
  if (line >= 0 && line <= 4) return [0, 1, 2, 3, 4].map((c) => line * 5 + c);
  if (line >= 5 && line <= 9) return [0, 1, 2, 3, 4].map((r) => r * 5 + (line - 5));
  if (line === 10) return [0, 6, 12, 18, 24];
  return [4, 8, 12, 16, 20];
}

export function lineName(line: number): string {
  if (line >= 0 && line <= 4) return `Row ${line + 1}`;
  if (line >= 5 && line <= 9) return `Column ${line - 4}`;
  return line === 10 ? 'Diagonal ↘' : 'Diagonal ↙';
}

export type BoxState = 'empty' | 'filled' | 'listening' | 'lit';

export function boxState(box: BingoBox): BoxState {
  if (box.activated_at) return 'lit';
  if (box.listen_started_at) return 'listening';
  if (box.title) return 'filled';
  return 'empty';
}

// Milliseconds the member must wait after tapping out before "mark listened"
// unlocks. Mirrors mark_bingo_listened: track duration, min 30s, 90s fallback.
export function listenGateMs(box: BingoBox): number {
  return Math.max(box.duration_ms ?? 90_000, 30_000);
}

// Remaining wait, in whole seconds (0 = the gate is open). `now` is passed in
// so screens can drive it off a ticking state value.
export function listenRemainingSecs(box: BingoBox, now: number): number {
  if (!box.listen_started_at) return Infinity;
  const opensAt = new Date(box.listen_started_at).getTime() + listenGateMs(box);
  return Math.max(0, Math.ceil((opensAt - now) / 1000));
}

// Is every non-free box on this line lit?
export function lineComplete(line: number, boxesByPosition: Map<number, BingoBox>): boolean {
  return linePositions(line).every((pos) => {
    if (pos === FREE_POSITION) return true;
    const box = boxesByPosition.get(pos);
    return !!box?.activated_at;
  });
}

// Lit boxes on this line (free center counts) — for "4/5" line progress.
export function lineLitCount(line: number, boxesByPosition: Map<number, BingoBox>): number {
  return linePositions(line).filter((pos) => {
    if (pos === FREE_POSITION) return true;
    return !!boxesByPosition.get(pos)?.activated_at;
  }).length;
}

// ── Rarity ───────────────────────────────────────────────
// HoopGrids-style obscurity scoring from Last.fm global playcounts (SCROBBLES,
// not Spotify streams — ceiling ~3×10⁷ for all-time megahits). Two segments:
// a gentle slope below 100k scrobbles so genuine deep cuts score generously,
// then a steep one so certified hits still fall to the floor:
//   ≤100 → 100 · 1k → 85 · 3k → 78 · 10k → 70 · 64k → 58 · 100k → 55
//   1M → 33 · 10M → 11 · 30M+ → 1
// Pure client math — tune the anchors here without a migration.

export function rarityScore(playcount: number): number {
  const lg = Math.log10(Math.max(playcount, 1));
  const score = lg <= 5 ? 100 - 15 * (lg - 2) : 55 - 22 * (lg - 5);
  return Math.max(1, Math.min(100, Math.round(score)));
}

// Average rarity of a set of boxes; only lit boxes with a known playcount
// count. Null when nothing is scorable (no data ≠ score of zero).
function averageRarity(boxes: BingoBox[]): number | null {
  const scored = boxes.filter((b) => b.activated_at && b.lastfm_playcount != null);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, b) => acc + rarityScore(b.lastfm_playcount!), 0);
  return Math.round(sum / scored.length);
}

// Rarity of one bingo line (free center excluded).
export function lineRarity(line: number, boxesByPosition: Map<number, BingoBox>): number | null {
  const boxes = linePositions(line)
    .filter((pos) => pos !== FREE_POSITION)
    .map((pos) => boxesByPosition.get(pos))
    .filter((b): b is BingoBox => !!b);
  return averageRarity(boxes);
}

// Whole-card rarity: average over every lit, scored box.
export function cardRarity(boxesByPosition: Map<number, BingoBox>): number | null {
  return averageRarity([...boxesByPosition.values()]);
}

// Short human form for a playcount ("2.1M plays").
export function formatPlays(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B plays`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M plays`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K plays`;
  return `${n} play${n === 1 ? '' : 's'}`;
}
