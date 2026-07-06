import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { SongSearchField, type PickedSong } from '@/components/SongSearchField';
import { Avatar, Button, Card, InlineNote, Label, ListenLinks, Loading, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useListeningBingo, type BingoCardView, type BingoClaimView, type BingoGameState } from '@/hooks/useListeningBingo';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import {
  FREE_POSITION,
  boxState,
  cardRarity,
  formatPlays,
  lineComplete,
  lineLitCount,
  lineName,
  linePositions,
  lineRarity,
  listenRemainingSecs,
  rarityScore,
} from '@/utils/listeningBingo';
import { memberName } from '@/utils/memberName';
import { activity, listeningBingo, type BingoBox, type BingoGame } from '@/utils/supabase/db';
import { fetchTrackPlaycount } from '@/utils/trackStats';
import { fonts, radius } from '@/theme';

// The grid cell shows a compressed category ("Song by a boy band" → "by a boy
// band") — the full label lives in the box panel.
function shortLabel(label: string): string {
  return label.replace(/^Song /, '');
}

function mmss(totalSecs: number): string {
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ListeningBingoScreen() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle } = useCycle(id);
  const { members, myRole } = useClubData(id);
  const { live, archive, loading, refresh, loadGame } = useListeningBingo(id);
  const { refreshing, onRefresh } = useRefresh(refresh);

  const canRun = myRole === 'owner' || myRole === 'admin' || (!!cycle && cycle.status === 'open' && cycle.picker_id === userId);

  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map((m) => ({
        profile_id: m.profile_id,
        display_name: m.profiles?.display_name ?? null,
        email: m.profiles?.email ?? null,
        avatar_color: m.profiles?.avatar_color ?? 0,
        avatar_url: m.profiles?.avatar_url ?? null,
      })),
    [members],
  );

  // A closed game the member tapped open from the archive shelf.
  const [archived, setArchived] = useState<BingoGameState | null>(null);
  const openArchived = async (g: BingoGame) => setArchived(await loadGame(g));

  if (!id) return <NoClubSelected what="listening bingo" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => (archived ? setArchived(null) : router.back())} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>FILL THE CARD. PROVE THE LISTEN. CALL IT.</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎱 Listening Bingo</Text>
        </View>
      </View>

      {archived ? (
        <LiveGame state={archived} userId={userId} canRun={false} mentionMembers={mentionMembers} onChange={() => openArchived(archived.game)} />
      ) : (
        <>
          {loading ? <Loading /> : live ? (
            <LiveGame state={live} userId={userId} canRun={canRun} mentionMembers={mentionMembers} onChange={refresh} />
          ) : canRun ? (
            <LaunchGame clubId={id} hasOpenCycle={!!cycle && cycle.status === 'open'} onCreated={refresh} />
          ) : (
            <InlineNote text="No bingo game live right now — an admin or the picker can deal the cards." />
          )}

          {archive.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: palette.text3 }]}>PAST GAMES</Text>
              {archive.map((g) => (
                <Pressable key={g.id} onPress={() => openArchived(g)}>
                  <Card style={styles.archiveRow}>
                    <Text style={styles.archiveEmoji}>🎱</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.sTitle, { color: palette.text1 }]}>Bingo game</Text>
                      <Text style={[styles.sSub, { color: palette.text3 }]}>
                        closed {g.closed_at ? timeAgo(g.closed_at) : ''}
                      </Text>
                    </View>
                    <Text style={{ color: palette.text3 }}>›</Text>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────
// Launch flow: trim the built-in pool, add customs, deal.
// ─────────────────────────────────────────────────────────

function LaunchGame({ clubId, hasOpenCycle, onCreated }: { clubId: string; hasOpenCycle: boolean; onCreated: () => void }) {
  const { palette } = useTheme();
  const [builtins, setBuiltins] = useState<{ id: string; label: string }[] | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [customs, setCustoms] = useState<string[]>([]);
  const [customText, setCustomText] = useState('');
  const [showPool, setShowPool] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listeningBingo.builtinCategories().then(({ data }) => setBuiltins((data ?? []).map((c) => ({ id: c.id, label: c.label }))));
  }, []);

  const poolCount = (builtins ? builtins.length - dropped.size : 0) + customs.length;

  const addCustom = () => {
    const label = customText.trim();
    if (!label) return;
    if (customs.some((c) => c.toLowerCase() === label.toLowerCase())) return;
    setCustoms([...customs, label]);
    setCustomText('');
  };

  const launch = async () => {
    if (!builtins) return;
    const labels = [...builtins.filter((c) => !dropped.has(c.id)).map((c) => c.label), ...customs];
    setBusy(true);
    setError(null);
    const { error: err } = await listeningBingo.create(clubId, labels);
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Could not start the game.');
      return;
    }
    onCreated();
  };

  if (!hasOpenCycle) return <InlineNote text="Bingo runs inside a cycle — start one first." />;

  return (
    <Card>
      <Label>Deal the cards</Label>
      <Text style={[styles.hint, { color: palette.text3 }]}>
        Every member gets a random 5x5 card of categories with 3 qualifying lines. Fill boxes with
        songs, prove the listen, call BINGO — the game runs until the cycle wraps.
      </Text>

      {builtins === null ? (
        <Loading />
      ) : (
        <>
          <Pressable onPress={() => setShowPool((v) => !v)} style={{ paddingVertical: 8 }}>
            <Text style={[styles.sectionTitle, { color: palette.text3, marginTop: 4, marginBottom: 0 }]}>
              {showPool ? '▾' : '▸'} CATEGORY POOL · {poolCount} IN PLAY
            </Text>
          </Pressable>
          {showPool ? (
            <>
              {builtins.map((c) => {
                const off = dropped.has(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      const next = new Set(dropped);
                      if (off) next.delete(c.id);
                      else next.add(c.id);
                      setDropped(next);
                    }}
                    style={[styles.poolRow, { borderTopColor: palette.border }]}
                  >
                    <Text style={[styles.poolCheck, { color: off ? palette.text3 : palette.amber }]}>{off ? '○' : '●'}</Text>
                    <Text style={[styles.poolLabel, { color: off ? palette.text3 : palette.text1 }, off && styles.strike]}>{c.label}</Text>
                  </Pressable>
                );
              })}
              {customs.map((label) => (
                <Pressable
                  key={label}
                  onPress={() => setCustoms(customs.filter((c) => c !== label))}
                  style={[styles.poolRow, { borderTopColor: palette.border }]}
                >
                  <Text style={[styles.poolCheck, { color: palette.teal }]}>◆</Text>
                  <Text style={[styles.poolLabel, { color: palette.text1 }]}>{label}</Text>
                  <Text style={{ color: palette.text3, fontSize: 14 }}>×</Text>
                </Pressable>
              ))}
              <View style={styles.customRow}>
                <View style={{ flex: 1 }}>
                  <TextField
                    placeholder="Add your own category…"
                    value={customText}
                    onChangeText={setCustomText}
                    onSubmitEditing={addCustom}
                  />
                </View>
                <Button title="Add" variant="ghost" onPress={addCustom} disabled={!customText.trim()} />
              </View>
            </>
          ) : null}

          <Button
            title={busy ? 'Dealing…' : `🎱 Deal the cards (${poolCount} categories)`}
            onPress={launch}
            loading={busy}
            disabled={poolCount < 24}
            style={{ marginTop: 12 }}
          />
          {poolCount < 24 ? <InlineNote text="The pool needs at least 24 categories." /> : null}
          {error ? <InlineNote text={error} tone="error" /> : null}
        </>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// The live (or archived) game.
// ─────────────────────────────────────────────────────────

function LiveGame({
  state,
  userId,
  canRun,
  mentionMembers,
  onChange,
}: {
  state: BingoGameState;
  userId: string | null;
  canRun: boolean;
  mentionMembers: MentionMember[];
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const { game, categories, cards, boxes, claims, comments } = state;
  const closed = game.status === 'closed';

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);
  const boxesByCard = useMemo(() => {
    const m = new Map<string, Map<number, BingoBox>>();
    for (const b of boxes) {
      const inner = m.get(b.card_id) ?? new Map<number, BingoBox>();
      inner.set(b.position, b);
      m.set(b.card_id, inner);
    }
    return m;
  }, [boxes]);

  const myCard = cards.find((c) => c.profile_id === userId) ?? null;
  const myBoxes = myCard ? boxesByCard.get(myCard.id) ?? new Map<number, BingoBox>() : new Map<number, BingoBox>();

  // Deal my card lazily on first open (once — the RPC is idempotent anyway).
  const dealtRef = useRef(false);
  useEffect(() => {
    if (!myCard && !closed && userId && !dealtRef.current) {
      dealtRef.current = true;
      listeningBingo.deal(game.id).then(() => onChange());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCard, closed, userId, game.id]);

  // Backfill rarity playcounts for MY songs picked before rarity shipped (or
  // whose lookup failed). Lazy, once per mount, own card only — each member's
  // visit heals their own boxes.
  const backfillRef = useRef(false);
  useEffect(() => {
    if (backfillRef.current || !myCard) return;
    const missing = [...myBoxes.values()].filter((b) => b.title && b.lastfm_playcount == null);
    if (missing.length === 0) return;
    backfillRef.current = true;
    (async () => {
      let stamped = 0;
      for (const b of missing) {
        const pc = await fetchTrackPlaycount(b.title!, b.artist);
        if (pc != null) {
          await listeningBingo.setPlaycount(b.id, pc);
          stamped++;
        }
      }
      if (stamped > 0) onChange();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myCard, myBoxes]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verifiedClaims = useMemo(
    () =>
      claims
        .filter((c) => c.status === 'verified')
        .sort((a, b) => (a.resolved_at ?? '').localeCompare(b.resolved_at ?? '')),
    [claims],
  );
  // Pending claims by OTHERS — the caller can verify these.
  const toVerify = useMemo(
    () => claims.filter((c) => c.status === 'pending' && c.bingo_cards.profile_id !== userId),
    [claims, userId],
  );
  const myPending = useMemo(
    () => claims.filter((c) => c.status === 'pending' && c.bingo_cards.profile_id === userId),
    [claims, userId],
  );

  const memberById = (pid: string) => mentionMembers.find((m) => m.profile_id === pid) ?? null;
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  // Latest challenge reason per position on MY card (from rejected claims) —
  // shown on the box panel so the claimer knows what to fix.
  const myChallengeByPos = useMemo(() => {
    const m = new Map<number, string>();
    if (!myCard) return m;
    for (const c of claims) {
      if (c.card_id !== myCard.id || c.status !== 'rejected') continue;
      for (const ch of c.bingo_challenges) m.set(ch.position, ch.reason);
    }
    return m;
  }, [claims, myCard]);

  const closeGame = async () => {
    const ok = await confirmAsync(
      'Close the game',
      'End bingo now? Unverified claims pass as self-certified and the boards freeze.',
    );
    if (!ok) return;
    setBusy(true);
    const { error: err } = await listeningBingo.close(game.id);
    setBusy(false);
    if (err) setError(err.message ?? 'Could not close.');
    onChange();
  };

  const scrapGame = async () => {
    const ok = await confirmAsync('Scrap game', 'Delete this bingo game entirely (all cards lost)?');
    if (!ok) return;
    await listeningBingo.remove(game.id);
    onChange();
  };

  const claimLine = async (line: number) => {
    if (!myCard) return;
    const ok = await confirmAsync('BINGO!', `Call bingo on ${lineName(line)}? The club will be asked to verify it.`);
    if (!ok) return;
    setError(null);
    const { error: err } = await listeningBingo.claim(myCard.id, line);
    if (err) setError(err.message ?? 'Could not claim.');
    onChange();
  };

  return (
    <>
      {/* Header: status + admin valves */}
      <Card>
        <View style={styles.headRow}>
          <Text style={styles.headEmoji}>🎱</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.headTitle, { color: palette.text1 }]}>
              {closed ? 'Final boards' : 'Game on'}
            </Text>
            <Text style={[styles.hint, { color: palette.text3 }]}>
              {cards.length} card{cards.length === 1 ? '' : 's'} dealt · {verifiedClaims.length} bingo
              {verifiedClaims.length === 1 ? '' : 's'}
              {toVerify.length > 0 && !closed ? ` · ${toVerify.length} claim${toVerify.length === 1 ? '' : 's'} to verify` : ''}
            </Text>
          </View>
        </View>
        {!closed && canRun ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Button title="Close game" variant="ghost" onPress={closeGame} loading={busy} style={{ flex: 1 }} />
            <Button title="Scrap" variant="ghost" onPress={scrapGame} style={{ flex: 1 }} />
          </View>
        ) : null}
      </Card>
      {error ? <InlineNote text={error} tone="error" /> : null}

      {/* Standings */}
      {verifiedClaims.length > 0 ? (
        <Card>
          <Label>Bingos on the board</Label>
          {verifiedClaims.map((c, i) => {
            const card = cardById.get(c.card_id);
            const m = card ? memberById(card.profile_id) : null;
            const medal = i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🎱';
            const rarity = lineRarity(c.line_index, boxesByCard.get(c.card_id) ?? new Map());
            return (
              <View key={c.id} style={styles.standingRow}>
                <Text style={{ fontSize: 16 }}>{medal}</Text>
                <Avatar name={m?.display_name ?? null} colorIndex={m?.avatar_color ?? 0} imageUrl={m?.avatar_url} size={24} />
                <Text style={[styles.sTitle, { color: palette.text1, flex: 1 }]} numberOfLines={1}>
                  {memberName(m?.display_name, m?.email)} · {lineName(c.line_index)}
                  {rarity != null ? <Text style={{ color: palette.text3 }}>{'  💎 '}{rarity}</Text> : null}
                </Text>
                {c.self_certified ? (
                  <Text style={[styles.selfBadge, { color: palette.text3, borderColor: palette.border }]}>SELF-CERTIFIED</Text>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* Claims waiting on ME to verify */}
      {!closed && toVerify.map((c) => (
        <VerifyClaim
          key={c.id}
          claim={c}
          card={cardById.get(c.card_id) ?? null}
          boxesByPos={boxesByCard.get(c.card_id) ?? new Map()}
          catById={catById}
          memberById={memberById}
          onChange={onChange}
        />
      ))}

      {/* My board */}
      {myCard ? (
        <MyBoard
          card={myCard}
          boxesByPos={myBoxes}
          catById={catById}
          closed={closed}
          myPendingLines={new Set(myPending.map((c) => c.line_index))}
          verifiedLines={new Set(verifiedClaims.filter((c) => c.card_id === myCard.id).map((c) => c.line_index))}
          challengeByPos={myChallengeByPos}
          onClaim={claimLine}
          onChange={onChange}
        />
      ) : !closed ? (
        <Loading />
      ) : null}

      {/* Everyone else's boards */}
      <OtherBoards
        cards={cards.filter((c) => c.profile_id !== userId)}
        boxesByCard={boxesByCard}
        catById={catById}
        claims={claims}
        memberById={memberById}
      />

      {/* Comments */}
      <CommentThread state={state} userId={userId} mentionMembers={mentionMembers} onChange={onChange} />
    </>
  );
}

// ─────────────────────────────────────────────────────────
// My board: the grid, the box panel, the BINGO buttons.
// ─────────────────────────────────────────────────────────

function MyBoard({
  card,
  boxesByPos,
  catById,
  closed,
  myPendingLines,
  verifiedLines,
  challengeByPos,
  onClaim,
  onChange,
}: {
  card: BingoCardView;
  boxesByPos: Map<number, BingoBox>;
  catById: Map<string, string>;
  closed: boolean;
  myPendingLines: Set<number>;
  verifiedLines: Set<number>;
  challengeByPos: Map<number, string>;
  onClaim: (line: number) => void;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const qualifying = (card.qualifying_lines ?? []) as number[];

  const claimable = qualifying.filter(
    (l) => !closed && lineComplete(l, boxesByPos) && !myPendingLines.has(l) && !verifiedLines.has(l),
  );

  const selectedBox = selected != null ? boxesByPos.get(selected) ?? null : null;
  const allLit = boxesByPos.size === 24 && [...boxesByPos.values()].every((b) => b.activated_at);

  return (
    <>
      <Text style={[styles.sectionTitle, { color: palette.text3 }]}>
        MY CARD{(() => { const r = cardRarity(boxesByPos); return r != null ? ` · 💎 RARITY ${r}` : ''; })()}
      </Text>
      <Card>
        {allLit ? <BlackoutBanner /> : null}
        <View style={styles.lineChips}>
          {qualifying.map((l, i) => {
            const done = lineComplete(l, boxesByPos);
            const lit = lineLitCount(l, boxesByPos);
            return (
              <View
                key={l}
                style={[
                  styles.lineChip,
                  { borderColor: done ? palette.amber : palette.border, backgroundColor: done ? palette.amberBg : 'transparent' },
                ]}
              >
                <Text style={[styles.lineChipText, { color: done ? palette.amber : palette.text2 }]}>
                  {i >= 3 ? '⭐ ' : ''}{lineName(l)} · {lit}/5{verifiedLines.has(l) ? ' ✓' : myPendingLines.has(l) ? ' ⏳' : ''}
                </Text>
              </View>
            );
          })}
        </View>
        {qualifying.length > 3 && !closed && !allLit ? (
          <InlineNote text={`Bonus line unlocked: ${lineName(qualifying[qualifying.length - 1])} ⭐ — finish it to reveal the next, all the way to a full-card blackout.`} />
        ) : null}
        <Text style={[styles.hint, { color: palette.text3, marginBottom: 8 }]}>
          {qualifying.length > 3
            ? `${qualifying.length} lines in play. Tap a box to add a song and prove the listen.`
            : 'Only these 3 lines count for bingo. Tap a box to add a song and prove the listen.'}
        </Text>

        <BingoGrid
          boxesByPos={boxesByPos}
          catById={catById}
          qualifying={qualifying}
          selected={selected}
          onSelect={(pos) => setSelected(selected === pos ? null : pos)}
        />

        {selectedBox ? (
          <BoxPanel
            box={selectedBox}
            category={catById.get(selectedBox.category_id) ?? ''}
            closed={closed}
            challengeReason={challengeByPos.get(selectedBox.position) ?? null}
            lockedInClaim={
              [...myPendingLines, ...verifiedLines].some((l) => linePositions(l).includes(selectedBox.position))
            }
            onChange={onChange}
          />
        ) : null}

        {myPendingLines.size > 0 ? (
          <InlineNote text={`Your ${[...myPendingLines].map(lineName).join(' + ')} bingo is waiting on a teammate to verify.`} />
        ) : null}
        {claimable.map((l) => (
          <Button key={l} title={`🎱 BINGO! — ${lineName(l)}`} onPress={() => onClaim(l)} style={{ marginTop: 10 }} />
        ))}
      </Card>
    </>
  );
}

// Full-card celebration: springs in, then pulses gently forever. Shown atop
// MY CARD once every box is lit — the completionist's trophy.
function BlackoutBanner() {
  const { palette } = useTheme();
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }).start();
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 2400, easing: Easing.linear, useNativeDriver: true }),
    );
    pulseLoop.start();
    spinLoop.start();
    return () => {
      pulseLoop.stop();
      spinLoop.stop();
    };
  }, [enter, pulse, spin]);

  const scale = Animated.multiply(enter, pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }));
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      style={[
        styles.blackoutBanner,
        { borderColor: palette.amber, backgroundColor: palette.amberBg, transform: [{ scale }] },
      ]}
    >
      <Animated.Text style={[styles.blackoutBall, { transform: [{ rotate }] }]}>🎱</Animated.Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.blackoutTitle, { color: palette.amber }]}>FULL-CARD BLACKOUT!</Text>
        <Text style={[styles.hint, { color: palette.text2 }]}>All 24 boxes lit — every category, actually listened.</Text>
      </View>
      <Animated.Text style={[styles.blackoutBall, { transform: [{ rotate }] }]}>🎱</Animated.Text>
    </Animated.View>
  );
}

function BingoGrid({
  boxesByPos,
  catById,
  qualifying,
  selected,
  onSelect,
}: {
  boxesByPos: Map<number, BingoBox>;
  catById: Map<string, string>;
  qualifying: number[];
  selected: number | null;
  onSelect?: (pos: number) => void;
}) {
  const { palette } = useTheme();
  const qualifyingPositions = useMemo(() => {
    const s = new Set<number>();
    for (const l of qualifying) for (const p of linePositions(l)) s.add(p);
    return s;
  }, [qualifying]);

  return (
    <View>
      {[0, 1, 2, 3, 4].map((row) => (
        <View key={row} style={styles.gridRow}>
          {[0, 1, 2, 3, 4].map((col) => {
            const pos = row * 5 + col;
            const onPath = qualifyingPositions.has(pos);
            if (pos === FREE_POSITION) {
              return (
                <View key={pos} style={[styles.cell, { borderColor: onPath ? palette.amber : palette.border, backgroundColor: palette.amberBg }]}>
                  <Text style={styles.cellFree}>🎱</Text>
                  <Text style={[styles.cellFreeLabel, { color: palette.amber }]}>FREE</Text>
                </View>
              );
            }
            const box = boxesByPos.get(pos);
            const state = box ? boxState(box) : 'empty';
            const bg =
              state === 'lit' ? palette.tealBg : state === 'listening' ? palette.amberBg : state === 'filled' ? palette.card2 : 'transparent';
            const border =
              selected === pos ? palette.text1 : state === 'lit' ? palette.teal : onPath ? palette.amber : palette.border;
            // A lit box wears its album cover — the card fills in visually as
            // you play. Category text stays for lit boxes with no artwork.
            const showArt = state === 'lit' && !!box?.artwork_url;
            return (
              <Pressable
                key={pos}
                disabled={!onSelect || !box}
                onPress={() => onSelect?.(pos)}
                style={[styles.cell, { borderColor: border, backgroundColor: bg }, selected === pos && styles.cellSelected]}
              >
                {showArt ? (
                  <>
                    <Image source={{ uri: box!.artwork_url! }} style={styles.cellArt} contentFit="cover" />
                    <View style={[styles.cellTitleStrip, { backgroundColor: palette.card }]}>
                      <Text numberOfLines={1} style={[styles.cellTitleText, { color: palette.text1 }]}>
                        {box!.title}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text
                    numberOfLines={4}
                    style={[styles.cellText, { color: state === 'lit' ? palette.teal : state === 'empty' ? palette.text2 : palette.text1 }]}
                  >
                    {box ? (state === 'lit' ? box.title : shortLabel(catById.get(box.category_id) ?? '')) : ''}
                  </Text>
                )}
                {state === 'lit' ? (
                  <View style={[styles.cellCheckChip, { backgroundColor: palette.card }]}>
                    <Text style={[styles.cellCheckText, { color: palette.teal }]}>✓</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// The selected box: full category, song picker, listen gate, activation.
function BoxPanel({
  box,
  category,
  closed,
  challengeReason,
  lockedInClaim,
  onChange,
}: {
  box: BingoBox;
  category: string;
  closed: boolean;
  challengeReason: string | null;
  lockedInClaim: boolean;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = boxState(box);

  // 1s tick while the listen gate is counting down.
  const [now, setNow] = useState(() => Date.now());
  const remaining = state === 'listening' ? listenRemainingSecs(box, now) : Infinity;
  useEffect(() => {
    if (state !== 'listening' || remaining <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state, remaining]);

  const pickSeq = useRef(0);
  const pickSong = async (song: PickedSong) => {
    setError(null);
    const seq = ++pickSeq.current;
    const { error: err } = await listeningBingo.setSong(box.id, {
      title: song.title,
      artist: song.artist,
      artworkUrl: song.artworkUrl,
      spotifyUrl: song.spotifyUrl,
      appleUrl: song.appleUrl,
      spotifyId: song.spotifyId,
      durationMs: song.durationMs,
    });
    if (err) {
      setError(err.message ?? 'Could not save the song.');
      return;
    }
    setSwapping(false);
    onChange();
    // Rarity lookup rides behind the save (Last.fm can be slow); the seq guard
    // keeps a stale lookup from stamping a since-swapped box.
    void fetchTrackPlaycount(song.title, song.artist).then((pc) => {
      if (pc != null && seq === pickSeq.current) {
        void listeningBingo.setPlaycount(box.id, pc).then(() => onChange());
      }
    });
  };

  const startListen = () => {
    // Stamp the gate as the link-out opens. The server enforces max 3 boxes
    // listening at once — surface that rejection when the member returns
    // (the link has already opened; the timer just didn't start).
    void listeningBingo.startListen(box.id).then(({ error: err }) => {
      if (err) setError(err.message ?? 'Could not start the listen timer.');
      else onChange();
    });
  };

  const markListened = async () => {
    setError(null);
    const { error: err } = await listeningBingo.markListened(box.id);
    if (err) {
      setError(err.message ?? 'Not yet — keep listening.');
      return;
    }
    onChange();
  };

  const editable = !closed && !lockedInClaim;

  return (
    <View style={[styles.boxPanel, { borderColor: palette.border, backgroundColor: palette.card2 }]}>
      <Text style={[styles.boxCategory, { color: palette.text1 }]}>{category}</Text>
      {challengeReason && state !== 'lit' ? (
        <InlineNote text={`Challenged: “${challengeReason}” — swap the song (or defend it with a better pick) and listen again.`} tone="error" />
      ) : null}

      {box.title && !swapping ? (
        <>
          <View style={styles.songRow}>
            {box.artwork_url ? <Image source={{ uri: box.artwork_url }} style={styles.art} contentFit="cover" /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{box.title}</Text>
              <Text numberOfLines={1} style={[styles.sSub, { color: palette.text3 }]}>
                {box.artist}
                {box.lastfm_playcount != null
                  ? ` · ${formatPlays(box.lastfm_playcount)} · 💎 ${rarityScore(box.lastfm_playcount)}`
                  : ''}
              </Text>
            </View>
            {state === 'lit' ? <Text style={{ color: palette.teal, fontSize: 16 }}>✓</Text> : null}
          </View>
          <ListenLinks
            apple={box.apple_url}
            spotify={box.spotify_url}
            other={null}
            onOpen={editable && state !== 'lit' ? startListen : undefined}
            style={{ marginTop: 8 }}
          />

          {editable && state === 'filled' ? (
            <Text style={[styles.hint, { color: palette.text3, marginTop: 6 }]}>
              Tap out and listen — the box lights up once the song has had time to play.
            </Text>
          ) : null}
          {editable && state === 'listening' ? (
            remaining > 0 ? (
              <Button title={`🎧 Listening… ${mmss(remaining)}`} disabled onPress={() => {}} style={{ marginTop: 10 }} />
            ) : (
              <Button title="✓ Mark listened" onPress={markListened} style={{ marginTop: 10 }} />
            )
          ) : null}

          {editable ? (
            <Pressable onPress={() => setSwapping(true)} hitSlop={6} style={{ marginTop: 8 }}>
              <Text style={[styles.swapLink, { color: palette.text3 }]}>
                Swap song{state === 'lit' ? ' (resets the listen)' : ''}
              </Text>
            </Pressable>
          ) : lockedInClaim && !closed ? (
            <Text style={[styles.hint, { color: palette.text3, marginTop: 6 }]}>Locked — this box is part of a claimed line.</Text>
          ) : null}
        </>
      ) : editable ? (
        <>
          {swapping ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.hint, { color: palette.text2, flex: 1 }]}>Pick the replacement — you'll listen again.</Text>
              <Pressable onPress={() => setSwapping(false)} hitSlop={8}>
                <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
              </Pressable>
            </View>
          ) : null}
          <SongSearchField placeholder={`A song for “${shortLabel(category)}”…`} onPick={pickSong} />
        </>
      ) : (
        <Text style={[styles.hint, { color: palette.text3 }]}>No song.</Text>
      )}
      {error ? <InlineNote text={error} tone="error" /> : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Verifying someone else's claim: the line's songs vs categories,
// approve, or challenge specific boxes with reasons.
// ─────────────────────────────────────────────────────────

function VerifyClaim({
  claim,
  card,
  boxesByPos,
  catById,
  memberById,
  onChange,
}: {
  claim: BingoClaimView;
  card: BingoCardView | null;
  boxesByPos: Map<number, BingoBox>;
  catById: Map<string, string>;
  memberById: (pid: string) => MentionMember | null;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const [challenges, setChallenges] = useState<Map<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!card) return null;
  const m = memberById(card.profile_id);
  const positions = linePositions(claim.line_index).filter((p) => p !== FREE_POSITION);

  const toggle = (pos: number) => {
    const next = new Map(challenges);
    if (next.has(pos)) next.delete(pos);
    else next.set(pos, '');
    setChallenges(next);
  };

  const resolve = async (approve: boolean) => {
    setError(null);
    if (!approve) {
      if (challenges.size === 0) {
        setError('Tap the box that fails and say why.');
        return;
      }
      if ([...challenges.values()].some((r) => !r.trim())) {
        setError('Every challenged box needs a reason.');
        return;
      }
    }
    setBusy(true);
    const { error: err } = await listeningBingo.resolveClaim(
      claim.id,
      approve,
      approve ? [] : [...challenges.entries()].map(([position, reason]) => ({ position, reason: reason.trim() })),
    );
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Could not resolve.');
      return;
    }
    onChange();
  };

  return (
    <Card style={{ borderColor: palette.amber, borderWidth: 1 }}>
      <View style={styles.headRow}>
        <Avatar name={m?.display_name ?? null} colorIndex={m?.avatar_color ?? 0} imageUrl={m?.avatar_url} size={28} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>{memberName(m?.display_name, m?.email)} called BINGO!</Label>
          <Text style={[styles.hint, { color: palette.text3 }]}>
            {lineName(claim.line_index)} · {timeAgo(claim.claimed_at)} — does every song fit its category?
          </Text>
        </View>
      </View>

      {positions.map((pos) => {
        const box = boxesByPos.get(pos);
        if (!box) return null;
        const challenged = challenges.has(pos);
        return (
          <View key={pos} style={[styles.verifyRow, { borderTopColor: palette.border }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.sSub, { color: palette.text3 }]} numberOfLines={2}>
                {catById.get(box.category_id) ?? ''}
              </Text>
              <View style={styles.songRow}>
                {box.artwork_url ? <Image source={{ uri: box.artwork_url }} style={styles.artSm} contentFit="cover" /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{box.title ?? '?'}</Text>
                  <Text numberOfLines={1} style={[styles.sSub, { color: palette.text3 }]}>{box.artist}</Text>
                </View>
                <ListenLinks apple={box.apple_url} spotify={box.spotify_url} other={null} />
              </View>
              {challenged ? (
                <TextField
                  placeholder="Why doesn't it fit?"
                  value={challenges.get(pos) ?? ''}
                  onChangeText={(t) => setChallenges(new Map(challenges).set(pos, t))}
                />
              ) : null}
            </View>
            <Pressable onPress={() => toggle(pos)} hitSlop={6}>
              <Text style={[styles.challengeToggle, { color: challenged ? palette.coral : palette.text3, borderColor: challenged ? palette.coral : palette.border }]}>
                {challenged ? 'CHALLENGED' : 'CHALLENGE'}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {challenges.size === 0 ? (
          <Button title="✓ Verify bingo" onPress={() => resolve(true)} loading={busy} style={{ flex: 1 }} />
        ) : (
          <Button title="Reject claim" onPress={() => resolve(false)} loading={busy} style={{ flex: 1 }} />
        )}
      </View>
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// Everyone else's boards (public — browsing is half the fun).
// ─────────────────────────────────────────────────────────

function OtherBoards({
  cards,
  boxesByCard,
  catById,
  claims,
  memberById,
}: {
  cards: BingoCardView[];
  boxesByCard: Map<string, Map<number, BingoBox>>;
  catById: Map<string, string>;
  claims: BingoClaimView[];
  memberById: (pid: string) => MentionMember | null;
}) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [peekPos, setPeekPos] = useState<number | null>(null);

  if (cards.length === 0) return null;

  return (
    <>
      <Text style={[styles.sectionTitle, { color: palette.text3 }]}>THE OTHER CARDS</Text>
      {cards.map((c) => {
        const boxesByPos = boxesByCard.get(c.id) ?? new Map<number, BingoBox>();
        const lit = [...boxesByPos.values()].filter((b) => b.activated_at).length;
        const bingos = claims.filter((cl) => cl.card_id === c.id && cl.status === 'verified').length;
        const rarity = cardRarity(boxesByPos);
        const m = memberById(c.profile_id);
        const isOpen = open === c.id;
        const peekBox = isOpen && peekPos != null ? boxesByPos.get(peekPos) ?? null : null;
        return (
          <Card key={c.id}>
            <Pressable
              onPress={() => {
                setOpen(isOpen ? null : c.id);
                setPeekPos(null);
              }}
              style={styles.headRow}
            >
              <Avatar name={m?.display_name ?? null} colorIndex={m?.avatar_color ?? 0} imageUrl={m?.avatar_url} size={28} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.sTitle, { color: palette.text1 }]}>{memberName(m?.display_name, m?.email)}</Text>
                <Text style={[styles.sSub, { color: palette.text3 }]}>
                  {lit === 24 ? '⬛ BLACKOUT · ' : ''}{lit}/24 lit{bingos > 0 ? ` · ${bingos} bingo${bingos === 1 ? '' : 's'}` : ''}
                  {rarity != null ? ` · 💎 ${rarity}` : ''}
                </Text>
              </View>
              <Text style={{ color: palette.text3 }}>{isOpen ? '▾' : '▸'}</Text>
            </Pressable>
            {isOpen ? (
              <View style={{ marginTop: 10 }}>
                <BingoGrid
                  boxesByPos={boxesByPos}
                  catById={catById}
                  qualifying={(c.qualifying_lines ?? []) as number[]}
                  selected={peekPos}
                  onSelect={(pos) => setPeekPos(peekPos === pos ? null : pos)}
                />
                {peekBox ? (
                  <View style={[styles.boxPanel, { borderColor: palette.border, backgroundColor: palette.card2 }]}>
                    <Text style={[styles.boxCategory, { color: palette.text1 }]}>{catById.get(peekBox.category_id) ?? ''}</Text>
                    {peekBox.title ? (
                      <View style={styles.songRow}>
                        {peekBox.artwork_url ? <Image source={{ uri: peekBox.artwork_url }} style={styles.art} contentFit="cover" /> : null}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{peekBox.title}</Text>
                          <Text numberOfLines={1} style={[styles.sSub, { color: palette.text3 }]}>{peekBox.artist}</Text>
                        </View>
                        <ListenLinks apple={peekBox.apple_url} spotify={peekBox.spotify_url} other={null} />
                      </View>
                    ) : (
                      <Text style={[styles.hint, { color: palette.text3 }]}>No song yet.</Text>
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Comments (Best Bars pattern, 'bingo' mention context).
// ─────────────────────────────────────────────────────────

function CommentThread({
  state,
  userId,
  mentionMembers,
  onChange,
}: {
  state: BingoGameState;
  userId: string | null;
  mentionMembers: MentionMember[];
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const { game, comments } = state;
  const [text, setText] = useState('');

  const add = async () => {
    if (!userId || !text.trim()) return;
    const body = text;
    await listeningBingo.addComment(game.id, userId, body);
    setText('');
    onChange();
    const tagged = resolveMentions(body, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(game.club_id, tagged, {
          context: 'bingo',
          snippet: body.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
  };

  return (
    <Card>
      <Label>Table talk</Label>
      {comments.map((c) => (
        <View key={c.id} style={styles.commentRow}>
          <Avatar name={c.profiles?.display_name ?? null} colorIndex={c.profiles?.avatar_color ?? 0} imageUrl={c.profiles?.avatar_url} size={24} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.commentAuthor, { color: palette.text1 }]}>
              {memberName(c.profiles?.display_name, c.profiles?.email)}{' '}
              <Text style={[styles.time, { color: palette.text3 }]}>{timeAgo(c.created_at)}</Text>
            </Text>
            <MentionText text={c.text} members={mentionMembers} style={[styles.commentText, { color: palette.text1 }]} />
          </View>
          {c.author_id === userId ? (
            <Pressable onPress={async () => { await listeningBingo.removeComment(c.id); onChange(); }} hitSlop={6}>
              <Text style={{ color: palette.text3, fontSize: 14 }}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <View style={styles.commentForm}>
        <MentionInput placeholder="Talk your talk… (@ to tag)" value={text} onChangeText={setText} members={mentionMembers} onSubmitEditing={add} />
        <Button title="Post" onPress={add} disabled={!text.trim()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  hint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  sectionTitle: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.5, marginTop: 14, marginBottom: 8 },
  archiveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  archiveEmoji: { fontSize: 22 },
  sTitle: { fontFamily: fonts.sansBold, fontSize: 13 },
  sSub: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headEmoji: { fontSize: 26 },
  headTitle: { fontFamily: fonts.sansBold, fontSize: 16 },
  poolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth },
  poolCheck: { fontSize: 12, width: 16, textAlign: 'center' },
  poolLabel: { fontFamily: fonts.sans, fontSize: 13, flex: 1 },
  strike: { textDecorationLine: 'line-through' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  lineChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  blackoutBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  blackoutBall: { fontSize: 22 },
  blackoutTitle: { fontFamily: fonts.sansBold, fontSize: 15, letterSpacing: 1 },
  lineChip: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 4, paddingHorizontal: 10 },
  lineChipText: { fontFamily: fonts.sansBold, fontSize: 11 },
  gridRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellSelected: { borderWidth: 2 },
  cellText: { fontFamily: fonts.sansMedium, fontSize: 10, lineHeight: 12, textAlign: 'center' },
  cellArt: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.sm - 1 },
  cellTitleStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.92,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  cellTitleText: { fontFamily: fonts.sansMedium, fontSize: 8, lineHeight: 10, textAlign: 'center' },
  cellCheckChip: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellCheckText: { fontSize: 9, fontFamily: fonts.sansBold, lineHeight: 11 },
  cellFree: { fontSize: 16 },
  cellFreeLabel: { fontFamily: fonts.monoMedium, fontSize: 7, letterSpacing: 1, marginTop: 1 },
  boxPanel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: 12, marginTop: 10, gap: 6 },
  boxCategory: { fontFamily: fonts.sansBold, fontSize: 14 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  art: { width: 44, height: 44, borderRadius: radius.sm },
  artSm: { width: 34, height: 34, borderRadius: radius.sm },
  swapLink: { fontFamily: fonts.sansMedium, fontSize: 12, textDecorationLine: 'underline' },
  standingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  selfBadge: {
    fontFamily: fonts.monoMedium,
    fontSize: 8,
    letterSpacing: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  verifyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  challengeToggle: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10 },
  commentAuthor: { fontFamily: fonts.sansBold, fontSize: 11, marginBottom: 1 },
  time: { fontFamily: fonts.mono, fontSize: 10 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentForm: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
});
