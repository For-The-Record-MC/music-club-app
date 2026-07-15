import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PreviewArt } from '@/components/PreviewArt';
import { Avatar, Button, Card, InlineNote, Label, ListenButton, ListenLinks, Loading, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { useAuxBattle, type AuxBattleView } from '@/hooks/useAuxBattle';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { confirmAsync } from '@/utils/confirm';
import { searchSongs as searchItunes } from '@/utils/itunes';
import { memberName } from '@/utils/memberName';
import { searchSongs as searchSpotify } from '@/utils/spotify';
import { auxBattle, type AuxBattleSong } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

interface SongPick {
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  appleUrl: string | null;
}

export default function AuxBattleScreen() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle, loading: cycleLoading } = useCycle(id);
  const { members, myRole } = useClubData(id);
  const { battles, loading, refresh } = useAuxBattle(cycle?.id);
  const { refreshing, onRefresh } = useRefresh(refresh);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cycleOpen = cycle?.status === 'open';
  const isPicker = !!cycle && cycle.picker_id === userId;
  const canKickoff = (isPicker || myRole === 'owner' || myRole === 'admin') && cycleOpen;
  const pickerName = useMemo(() => {
    const m = members.find((mm) => mm.profile_id === cycle?.picker_id);
    return memberName(m?.profiles?.display_name, m?.profiles?.email);
  }, [members, cycle?.picker_id]);

  const myBattle = useMemo(
    () => battles.find((b) => b.member_a === userId || b.member_b === userId) ?? null,
    [battles, userId],
  );
  const others = useMemo(() => battles.filter((b) => b.id !== myBattle?.id), [battles, myBattle]);

  const start = async () => {
    if (!cycle) return;
    setBusy(true);
    setError(null);
    const { error: err } = await auxBattle.start(cycle.id);
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Could not start.');
      return;
    }
    refresh();
  };

  const reroll = async () => {
    if (!cycle) return;
    const ok = await confirmAsync(
      'Re-roll bracket',
      'Re-pair everyone and clear all submitted songs + votes this cycle?',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error: rErr } = await auxBattle.reset(cycle.id);
    if (!rErr) await auxBattle.start(cycle.id);
    setBusy(false);
    if (rErr) setError(rErr.message ?? 'Could not re-roll.');
    refresh();
  };

  if (!id) return <NoClubSelected what="aux battle" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>EVERYONE PAIRED, WINNER TAKES THE AUX</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎚️ Aux Battle</Text>
        </View>
      </View>

      {loading || cycleLoading ? <Loading /> : (
      <>
      {!cycle ? (
        <InlineNote text="No open cycle yet — the bracket is set when a cycle opens." />
      ) : battles.length === 0 ? (
        canKickoff ? (
          <Card>
            <Label>Set this cycle's bracket</Label>
            <Text style={[styles.hint, { color: palette.text3 }]}>
              Every member gets paired with someone, each matchup gets its own theme. An odd
              member out sits this one out.
            </Text>
            <Button title="🎲 Set the bracket" onPress={start} loading={busy} style={{ marginTop: 12 }} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </Card>
        ) : (
          <InlineNote text={`Not started yet — waiting on ${pickerName} to set the bracket.`} />
        )
      ) : (
        <>
          {canKickoff ? (
            <Button title="🎲 Re-roll bracket" variant="ghost" onPress={reroll} loading={busy} style={{ marginBottom: 14 }} />
          ) : null}
          {error ? <InlineNote text={error} tone="error" /> : null}

          {myBattle ? (
            <>
              <Label>Your matchup</Label>
              <BattleCard battle={myBattle} userId={userId} cycleOpen={cycleOpen} onChange={refresh} />
            </>
          ) : (
            <InlineNote text="You drew a bye this cycle — vote on the matchups below." />
          )}

          {others.length > 0 ? (
            <>
              <View style={{ marginTop: 8 }}>
                <Label>{myBattle ? 'Vote on the rest' : 'The matchups'}</Label>
              </View>
              {others.map((b) => (
                <BattleCard key={b.id} battle={b} userId={userId} cycleOpen={cycleOpen} onChange={refresh} />
              ))}
            </>
          ) : null}
        </>
      )}
      </>
      )}
    </Screen>
  );
}

// One full matchup: theme + tally + the two combatants. Whether the viewer can
// submit a song / vote is derived from their relationship to THIS battle.
function BattleCard({
  battle,
  userId,
  cycleOpen,
  onChange,
}: {
  battle: AuxBattleView;
  userId: string | null;
  cycleOpen: boolean;
  onChange: () => void;
}) {
  const { palette } = useTheme();

  const songOf = (pid: string) => battle.aux_battle_songs.find((s) => s.profile_id === pid) ?? null;
  const votesFor = (pid: string) => battle.aux_battle_votes.filter((v) => v.choice === pid).length;
  const myVote = battle.aux_battle_votes.find((v) => v.profile_id === userId)?.choice ?? null;
  const amCombatant = userId === battle.member_a || userId === battle.member_b;

  const aVotes = votesFor(battle.member_a);
  const bVotes = votesFor(battle.member_b);
  const total = aVotes + bVotes;
  const winner = battle.winner_profile_id;
  // Blindness: as a combatant you can't see the opponent's song (RLS hides the
  // row) until you've submitted your own. Lock: once both are in, no changes.
  const iSubmitted = battle.aux_battle_songs.some((s) => s.profile_id === userId);
  const locked = battle.aux_battle_songs.length >= 2;
  const blindA = amCombatant && !iSubmitted && userId !== battle.member_a;
  const blindB = amCombatant && !iSubmitted && userId !== battle.member_b;

  const vote = async (pid: string) => {
    await auxBattle.vote(battle.id, pid);
    onChange();
  };

  const nameA = memberName(battle.a?.display_name, battle.a?.email);
  const nameB = memberName(battle.b?.display_name, battle.b?.email);

  return (
    <Card style={amCombatant ? { borderColor: palette.amber } : undefined}>
      <Text style={[styles.eyebrow, { color: palette.text3 }]}>
        {nameA} vs {nameB}
      </Text>
      <Text style={[styles.matchupTheme, { color: palette.text1 }]}>{battle.theme_text}</Text>
      {!cycleOpen ? (
        <Text style={[styles.resultBanner, { color: winner ? palette.teal : palette.text3 }]}>
          {winner
            ? `🏆 ${memberName(
                (winner === battle.member_a ? battle.a : battle.b)?.display_name,
                (winner === battle.member_a ? battle.a : battle.b)?.email,
              )} took the aux`
            : '🤝 Draw'}
        </Text>
      ) : (
        <Text style={[styles.meta, { color: palette.text3 }]}>{total} vote{total === 1 ? '' : 's'}</Text>
      )}

      {total > 0 ? (
        <View style={[styles.tally, { backgroundColor: palette.card2 }]}>
          {aVotes > 0 ? <View style={{ flex: aVotes, backgroundColor: palette.teal }} /> : null}
          {bVotes > 0 ? <View style={{ flex: bVotes, backgroundColor: palette.purple }} /> : null}
        </View>
      ) : null}

      <CombatantSide
        member={battle.a}
        memberId={battle.member_a}
        song={songOf(battle.member_a)}
        votes={aVotes}
        accent={palette.teal}
        isMine={userId === battle.member_a}
        amCombatant={amCombatant}
        myVote={myVote}
        cycleOpen={cycleOpen}
        isWinner={winner === battle.member_a}
        battleId={battle.id}
        blindHidden={blindA}
        locked={locked}
        onVote={() => vote(battle.member_a)}
        onChange={onChange}
      />
      <View style={styles.vs}>
        <Text style={[styles.vsText, { color: palette.text3 }]}>VS</Text>
      </View>
      <CombatantSide
        member={battle.b}
        memberId={battle.member_b}
        song={songOf(battle.member_b)}
        votes={bVotes}
        accent={palette.purple}
        isMine={userId === battle.member_b}
        amCombatant={amCombatant}
        myVote={myVote}
        cycleOpen={cycleOpen}
        isWinner={winner === battle.member_b}
        battleId={battle.id}
        blindHidden={blindB}
        locked={locked}
        onVote={() => vote(battle.member_b)}
        onChange={onChange}
      />
    </Card>
  );
}

function CombatantSide({
  member,
  memberId,
  song,
  votes,
  accent,
  isMine,
  amCombatant,
  myVote,
  cycleOpen,
  isWinner,
  battleId,
  blindHidden,
  locked,
  onVote,
  onChange,
}: {
  member: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  memberId: string;
  song: AuxBattleSong | null;
  votes: number;
  accent: string;
  isMine: boolean;
  amCombatant: boolean;
  myVote: string | null;
  cycleOpen: boolean;
  isWinner: boolean;
  battleId: string;
  blindHidden: boolean;
  locked: boolean;
  onVote: () => void;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const [editing, setEditing] = useState(false);

  return (
    <View style={[styles.side, isWinner && { borderColor: accent, borderWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.combHead}>
        <Avatar name={member?.display_name ?? null} colorIndex={member?.avatar_color ?? 0} imageUrl={member?.avatar_url ?? null} size={26} />
        <Text style={[styles.combName, { color: palette.text1 }]}>{memberName(member?.display_name, member?.email)}</Text>
        <Text style={[styles.voteCount, { color: palette.text3 }]}>{votes}</Text>
        {!amCombatant && cycleOpen ? (
          <Pressable
            onPress={onVote}
            hitSlop={8}
            accessibilityLabel={`Vote for ${memberName(member?.display_name, member?.email)}`}
            style={[
              styles.crownBtn,
              { backgroundColor: palette.card2, borderColor: palette.border },
              myVote === memberId && { backgroundColor: palette.amberBg, borderColor: palette.amber },
            ]}
          >
            <Text style={{ fontSize: 15, opacity: myVote === memberId ? 1 : 0.3 }}>👑</Text>
          </Pressable>
        ) : null}
      </View>

      {song && !editing ? (
        <>
          <View style={styles.songRow}>
            {song.artwork_url ? (
              <PreviewArt
                id={`aux:${song.id}`}
                uri={song.artwork_url}
                previewUrl={song.preview_url}
                title={song.title}
                artist={song.artist ?? undefined}
                style={styles.songArt}
              />
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>{song.title}</Text>
              {song.artist ? <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>{song.artist}</Text> : null}
            </View>
            <ListenButton apple={song.apple_url} spotify={song.spotify_url} />
          </View>
          <ListenLinks apple={song.apple_url} spotify={song.spotify_url} other={null} style={{ marginTop: 8 }} />
          {isMine && cycleOpen && !locked ? (
            <Pressable onPress={() => setEditing(true)} style={{ marginTop: 8 }}>
              <Text style={[styles.changeLink, { color: palette.text3 }]}>Change my song</Text>
            </Pressable>
          ) : null}
        </>
      ) : isMine && cycleOpen ? (
        <SubmitSong battleId={battleId} onDone={() => { setEditing(false); onChange(); }} />
      ) : blindHidden ? (
        <Text style={[styles.noSong, { color: palette.text3 }]}>🔒 Hidden until you submit yours.</Text>
      ) : (
        <Text style={[styles.noSong, { color: palette.text3 }]}>No song submitted yet.</Text>
      )}

    </View>
  );
}

function SubmitSong({ battleId, onDone }: { battleId: string; onDone: () => void }) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongPick[]>([]);
  const [busy, setBusy] = useState(false);
  const search = useDebouncedSearch();

  const run = (term: string) => {
    setQuery(term);
    if (term.trim().length < 3) {
      search.cancel();
      setResults([]);
      return;
    }
    search.schedule(async (isCurrent) => {
      const spotify = await searchSpotify(term);
      const mapped: SongPick[] = spotify.length
        ? spotify.map((t) => ({ title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl || null, spotifyUrl: t.spotifyUrl || null, appleUrl: null }))
        : (await searchItunes(term)).map((t) => ({ title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl || null, spotifyUrl: null, appleUrl: t.appleUrl || null }));
      if (isCurrent()) setResults(mapped);
    });
  };

  const pick = async (t: SongPick) => {
    setBusy(true);
    await auxBattle.submitSong(battleId, t);
    setBusy(false);
    onDone();
  };

  return (
    <View style={{ marginTop: 4 }}>
      <TextField placeholder="Search your song…" value={query} onChangeText={run} autoCorrect={false} editable={!busy} />
      {results.map((t, i) => (
        <Pressable key={`${t.title}-${i}`} onPress={() => pick(t)} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}>
          {t.artworkUrl ? <Image source={{ uri: t.artworkUrl }} style={styles.resultArt} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>{t.title}</Text>
            <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>{t.artist}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  hint: { fontFamily: fonts.sans, fontSize: 12, marginTop: 6, lineHeight: 17 },
  matchupTheme: { fontFamily: fonts.sansBold, fontSize: 18, marginTop: 2, marginBottom: 4 },
  meta: { fontFamily: fonts.mono, fontSize: 11, marginTop: 4, marginBottom: 8 },
  resultBanner: { fontFamily: fonts.sansBold, fontSize: 14, marginTop: 6, marginBottom: 8 },
  tally: { flexDirection: 'row', height: 7, borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
  vs: { alignItems: 'center', marginVertical: 4 },
  vsText: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 2 },
  side: { borderRadius: radius.md, padding: 4 },
  combHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  combName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 14 },
  voteCount: { fontFamily: fonts.monoMedium, fontSize: 12 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  songArt: { width: 44, height: 44, borderRadius: radius.sm },
  songTitle: { fontFamily: fonts.sansBold, fontSize: 14 },
  songArtist: { fontFamily: fonts.sans, fontSize: 12, marginTop: 1 },
  noSong: { fontFamily: fonts.mono, fontSize: 12 },
  changeLink: { fontFamily: fonts.monoMedium, fontSize: 11 },
  // Same crown-toggle affordance as the album favorite on Home.
  crownBtn: {
    width: 40,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  resultArt: { width: 40, height: 40, borderRadius: radius.sm },
});
