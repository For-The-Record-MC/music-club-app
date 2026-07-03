import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, Button, Card, InlineNote, Label, ListenLinks, Loading, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useTrackMadness, type BracketState } from '@/hooks/useTrackMadness';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import { searchSongs as searchItunes } from '@/utils/itunes';
import { memberName } from '@/utils/memberName';
import { searchArtists, searchSongs as searchSpotify, type SpotifyArtist } from '@/utils/spotify';
import { activity, trackMadness, type Bracket, type BracketTrack } from '@/utils/supabase/db';
import {
  applyPick,
  bracketRounds,
  computeConsensus,
  computeStats,
  fetchSeedCandidates,
  matchupFeeders,
  nextMatchups,
  pickKey,
  picksComplete,
  roundName,
  toPickMap,
  type PickMap,
  type SeedCandidate,
} from '@/utils/trackMadness';
import { fonts, radius } from '@/theme';

const SIZES = [16, 32, 64] as const;

function formatPlays(n: number): string {
  if (n <= 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M plays`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K plays`;
  return `${n} plays`;
}

export default function TrackMadnessScreen() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle } = useCycle(id);
  const { members, myRole } = useClubData(id);
  const { live, archive, loading, refresh, loadBracket } = useTrackMadness(id);
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

  // A closed bracket the member tapped open from the archive shelf.
  const [archived, setArchived] = useState<BracketState | null>(null);
  const openArchived = async (b: Bracket) => setArchived(await loadBracket(b));

  if (!id) return <NoClubSelected what="track madness" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => (archived ? setArchived(null) : router.back())} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>ONE ARTIST. EVERY HIT. ONE CHAMPION.</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🏆 Track Madness</Text>
        </View>
      </View>

      {archived ? (
        <LiveBracket state={archived} userId={userId} canRun={false} mentionMembers={mentionMembers} onChange={() => openArchived(archived.bracket)} />
      ) : (
        <>
          {loading ? <Loading /> : live ? (
            <LiveBracket state={live} userId={userId} canRun={canRun} mentionMembers={mentionMembers} onChange={refresh} />
          ) : canRun ? (
            <CreateBracket clubId={id} onCreated={refresh} />
          ) : (
            <InlineNote text="No bracket live right now — an admin or the picker can start one." />
          )}

          {archive.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: palette.text3 }]}>PAST BRACKETS</Text>
              {archive.map((b) => (
                <Pressable key={b.id} onPress={() => openArchived(b)}>
                  <Card style={styles.archiveRow}>
                    {b.artist_image_url ? <Image source={{ uri: b.artist_image_url }} style={styles.artistArt} contentFit="cover" /> : null}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{b.artist_name}</Text>
                      <Text style={[styles.sArtist, { color: palette.text3 }]}>
                        {b.size} songs · closed {b.closed_at ? timeAgo(b.closed_at) : ''}
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
// Creation flow: artist search → seeded review list → publish.
// ─────────────────────────────────────────────────────────

function CreateBracket({ clubId, onCreated }: { clubId: string; onCreated: () => void }) {
  const { palette } = useTheme();
  const [artist, setArtist] = useState<SpotifyArtist | null>(null);
  const [candidates, setCandidates] = useState<SeedCandidate[] | null>(null);
  const [source, setSource] = useState<'lastfm' | 'spotify'>('lastfm');
  const [size, setSize] = useState<number>(32);
  const [seeding, setSeeding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [swapSeed, setSwapSeed] = useState<number | null>(null); // 1-based seed being replaced

  const seed = async (a: SpotifyArtist) => {
    setArtist(a);
    setSeeding(true);
    setError(null);
    const res = await fetchSeedCandidates(a.id, a.name);
    setSeeding(false);
    if (!res || res.results.length < 16) {
      setError(
        res
          ? `Only ${res.results.length} distinct songs found — not enough for a bracket.`
          : 'Could not build the field. Try again.',
      );
      setArtist(null);
      return;
    }
    setCandidates(res.results);
    setSource(res.source);
    setSize(res.results.length >= 32 ? 32 : 16);
  };

  const removeAt = (seedNum: number) => {
    if (!candidates) return;
    setCandidates(candidates.filter((_, i) => i !== seedNum - 1));
  };

  const swapIn = (c: SeedCandidate) => {
    if (!candidates || swapSeed == null) return;
    const next = [...candidates];
    next[swapSeed - 1] = c;
    setCandidates(next);
    setSwapSeed(null);
  };

  const publish = async () => {
    if (!artist || !candidates) return;
    setPublishing(true);
    setError(null);
    const field = candidates.slice(0, size);
    // Best-effort Apple link + preview per track (keyless iTunes Search, small
    // batches so we don't trip its per-IP burst throttle). Missing → nulls.
    const apple: { appleUrl: string | null; previewUrl: string | null }[] = [];
    for (let i = 0; i < field.length; i += 4) {
      setPublishStep(`Linking Apple Music ${Math.min(i + 4, field.length)}/${field.length}…`);
      const batch = await Promise.all(
        field.slice(i, i + 4).map(async (c) => {
          try {
            const hit = (await searchItunes(`${c.title} ${artist.name}`))[0];
            return { appleUrl: hit?.appleUrl || null, previewUrl: hit?.previewUrl || null };
          } catch {
            return { appleUrl: null, previewUrl: null };
          }
        }),
      );
      apple.push(...batch);
    }
    setPublishStep('Publishing…');
    const { error: err } = await trackMadness.create(
      clubId,
      artist.name,
      artist.id,
      artist.imageUrl || null,
      size,
      field.map((c, i) => ({
        title: c.title,
        album: c.album,
        artwork_url: c.artworkUrl || null,
        spotify_url: c.spotifyUrl || null,
        apple_url: apple[i]?.appleUrl ?? null,
        preview_url: apple[i]?.previewUrl ?? null,
        playcount: c.playcount,
      })),
    );
    setPublishing(false);
    setPublishStep('');
    if (err) {
      setError(err.message ?? 'Could not publish.');
      return;
    }
    onCreated();
  };

  if (!artist || !candidates) {
    return (
      <Card>
        <Label>Start a bracket</Label>
        <Text style={[styles.hint, { color: palette.text3 }]}>
          Pick an artist — their most-played songs get seeded into a tournament and every
          member fills out their own bracket.
        </Text>
        <ArtistSearch onPick={seed} disabled={seeding} />
        {seeding ? <InlineNote text="Building the field — ranking their catalog…" /> : null}
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>
    );
  }

  const sized = candidates.slice(0, size);
  return (
    <Card>
      <View style={styles.reviewHead}>
        {artist.imageUrl ? <Image source={{ uri: artist.imageUrl }} style={styles.artistArt} contentFit="cover" /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>{artist.name}</Label>
          <Text style={[styles.hint, { color: palette.text3 }]}>
            Seeded by {source === 'lastfm' ? 'all-time plays (Last.fm)' : 'Spotify popularity'} — review the field, swap
            anything that doesn't belong, then publish.
          </Text>
        </View>
        <Pressable onPress={() => { setArtist(null); setCandidates(null); setError(null); }} hitSlop={8}>
          <Text style={{ color: palette.text3, fontSize: 18 }}>×</Text>
        </Pressable>
      </View>

      <View style={styles.sizeRow}>
        {SIZES.map((s) => {
          const enabled = candidates.length >= s;
          const active = size === s;
          return (
            <Pressable
              key={s}
              disabled={!enabled}
              onPress={() => setSize(s)}
              style={[
                styles.sizeBtn,
                { borderColor: active ? palette.amber : palette.border, backgroundColor: active ? palette.amberBg : 'transparent' },
                !enabled && { opacity: 0.35 },
              ]}
            >
              <Text style={[styles.sizeText, { color: active ? palette.amber : palette.text2 }]}>{s}</Text>
            </Pressable>
          );
        })}
        <Text style={[styles.hint, { color: palette.text3, flex: 1 }]}>{size - 1} picks per member</Text>
      </View>

      {sized.map((c, i) => (
        <View key={`${c.spotifyId}-${i}`} style={[styles.seedRow, { borderTopColor: palette.border }]}>
          <Text style={[styles.seedNum, { color: palette.text3 }]}>{i + 1}</Text>
          {c.artworkUrl ? <Image source={{ uri: c.artworkUrl }} style={styles.art} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{c.title}</Text>
            <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text3 }]}>
              {formatPlays(c.playcount) || c.album}
            </Text>
          </View>
          <Pressable onPress={() => setSwapSeed(swapSeed === i + 1 ? null : i + 1)} hitSlop={6}>
            <Text style={{ color: palette.amber, fontSize: 13, fontFamily: fonts.sansBold }}>swap</Text>
          </Pressable>
          <Pressable onPress={() => removeAt(i + 1)} hitSlop={6} style={{ marginLeft: 10 }}>
            <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
          </Pressable>
        </View>
      ))}
      {swapSeed != null ? (
        <TrackSwapSearch
          artistName={artist.name}
          exclude={new Set(sized.map((c) => c.spotifyId))}
          onPick={swapIn}
          onCancel={() => setSwapSeed(null)}
          seedNum={swapSeed}
        />
      ) : null}

      <Button
        title={publishing ? publishStep || 'Publishing…' : `🏆 Publish the ${size}-song bracket`}
        onPress={publish}
        loading={publishing}
        style={{ marginTop: 14 }}
      />
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Card>
  );
}

function ArtistSearch({ onPick, disabled }: { onPick: (a: SpotifyArtist) => void; disabled?: boolean }) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const seq = useRef(0);

  const run = async (term: string) => {
    setQuery(term);
    const s = ++seq.current;
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    const artists = await searchArtists(term);
    if (s === seq.current) setResults(artists);
  };

  return (
    <View style={{ marginTop: 8 }}>
      <TextField placeholder="Search an artist…" value={query} onChangeText={run} autoCorrect={false} editable={!disabled} />
      {results.map((a) => (
        <Pressable
          key={a.id}
          disabled={disabled}
          onPress={() => { onPick(a); setQuery(''); setResults([]); }}
          style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}
        >
          {a.imageUrl ? <Image source={{ uri: a.imageUrl }} style={styles.artistArt} contentFit="cover" /> : null}
          <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1, flex: 1 }]}>{a.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Same-artist-only replacement search (the locked rule: swaps keep the premise
// honest). Filters Spotify track results to this artist.
function TrackSwapSearch({
  artistName,
  exclude,
  seedNum,
  onPick,
  onCancel,
}: {
  artistName: string;
  exclude: Set<string>;
  seedNum: number;
  onPick: (c: SeedCandidate) => void;
  onCancel: () => void;
}) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SeedCandidate[]>([]);
  const seq = useRef(0);

  const run = async (term: string) => {
    setQuery(term);
    const s = ++seq.current;
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    const tracks = await searchSpotify(`${term} ${artistName}`);
    const artistLc = artistName.toLowerCase();
    const mapped = tracks
      .filter((t) => t.artistName.toLowerCase().includes(artistLc) && !exclude.has(t.id))
      .map((t) => ({
        title: t.trackName,
        album: t.collectionName,
        artworkUrl: t.artworkUrl,
        spotifyUrl: t.spotifyUrl,
        spotifyId: t.id,
        playcount: 0,
      }));
    if (s === seq.current) setResults(mapped);
  };

  return (
    <View style={[styles.swapBox, { borderColor: palette.amber, backgroundColor: palette.amberBg }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[styles.hint, { color: palette.text2, flex: 1 }]}>Replace the {seedNum}-seed ({artistName} only)</Text>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
        </Pressable>
      </View>
      <TextField placeholder="Search their songs…" value={query} onChangeText={run} autoCorrect={false} />
      {results.map((c) => (
        <Pressable key={c.spotifyId} onPress={() => onPick(c)} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}>
          {c.artworkUrl ? <Image source={{ uri: c.artworkUrl }} style={styles.art} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{c.title}</Text>
            <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text3 }]}>{c.album}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// The live (or archived) bracket.
// ─────────────────────────────────────────────────────────

function LiveBracket({
  state,
  userId,
  canRun,
  mentionMembers,
  onChange,
}: {
  state: BracketState;
  userId: string | null;
  canRun: boolean;
  mentionMembers: MentionMember[];
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const { bracket, tracks, picks, entries, progress, comments } = state;
  const size = bracket.size;
  const closed = bracket.status === 'closed';
  const rounds = bracketRounds(size);

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const byPosition = useMemo(() => new Map(tracks.map((t) => [t.position, t])), [tracks]);

  // Optimistic copy of MY picks; server stays source of truth via onChange.
  const serverMyPicks = useMemo(
    () => toPickMap(picks.filter((p) => p.profile_id === userId)),
    [picks, userId],
  );
  const [myPicks, setMyPicks] = useState<PickMap>(serverMyPicks);
  useEffect(() => setMyPicks(serverMyPicks), [serverMyPicks]);

  const myEntry = entries.find((e) => e.profile_id === userId) ?? null;
  const iAmDone = !!myEntry?.completed_at;
  const queue = useMemo(
    () => (iAmDone || closed ? [] : nextMatchups(size, tracks, myPicks)),
    [iAmDone, closed, size, tracks, myPicks],
  );
  const complete = picksComplete(size, myPicks);
  // A matchup the member reopened from their bracket view (redo a branch).
  const [redo, setRedo] = useState<{ round: number; slot: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMyBracket, setShowMyBracket] = useState(false);
  // Another member's finished bracket, opened from the results shelf.
  const [peek, setPeek] = useState<string | null>(null);

  const current: { round: number; slot: number; a: BracketTrack; b: BracketTrack } | null = useMemo(() => {
    if (redo) {
      const feeders = matchupFeeders(redo.round, redo.slot, byPosition, byId, myPicks);
      if (feeders) return { ...redo, a: feeders[0], b: feeders[1] };
    }
    return queue[0] ?? null;
  }, [redo, queue, byPosition, byId, myPicks]);

  const pick = async (winnerId: string) => {
    if (!current) return;
    const { round, slot } = current;
    setMyPicks((p) => applyPick(p, size, round, slot, winnerId));
    setRedo(null);
    setError(null);
    const { error: err } = await trackMadness.savePick(bracket.id, round, slot, winnerId);
    if (err) {
      setError(err.message ?? 'Pick did not save — pull to refresh.');
      onChange();
    }
  };

  const crown = async () => {
    const champId = myPicks[pickKey(rounds, 1)];
    const champ = champId ? byId.get(champId) : null;
    const ok = await confirmAsync(
      'Crown your champion',
      `Crown “${champ?.title ?? '?'}”? This locks your bracket — no more changes.`,
    );
    if (!ok) return;
    setBusy(true);
    const { error: err } = await trackMadness.crown(bracket.id);
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Could not crown.');
      return;
    }
    onChange();
  };

  const closeBracket = async () => {
    const ok = await confirmAsync(
      'Close the bracket',
      `End the ${bracket.artist_name} bracket now? Unfinished brackets are frozen and the club champion is decided from everyone who finished.`,
    );
    if (!ok) return;
    setBusy(true);
    const { error: err } = await trackMadness.close(bracket.id);
    setBusy(false);
    if (err) setError(err.message ?? 'Could not close.');
    onChange();
  };

  const deleteBracket = async () => {
    const ok = await confirmAsync('Delete bracket', 'Scrap this bracket entirely (all picks lost)?');
    if (!ok) return;
    await trackMadness.remove(bracket.id);
    onChange();
  };

  // Consensus — only computable once the spoiler guard lifts for this member.
  const resultsVisible = iAmDone || closed;
  const completedSet = useMemo(() => new Set(progress.completed_ids), [progress.completed_ids]);
  const consensus = useMemo(() => {
    if (!resultsVisible || completedSet.size === 0) return null;
    const byMember = new Map<string, { round: number; slot: number; winner_track_id: string }[]>();
    for (const p of picks) {
      if (!completedSet.has(p.profile_id)) continue;
      const arr = byMember.get(p.profile_id) ?? [];
      arr.push(p);
      byMember.set(p.profile_id, arr);
    }
    const maps = [...byMember.values()].map(toPickMap);
    if (maps.length === 0) return null;
    return computeConsensus(size, tracks, maps);
  }, [resultsVisible, completedSet, picks, size, tracks]);
  const stats = useMemo(() => {
    if (!consensus) return null;
    const maps = [...completedSet]
      .map((pid) => toPickMap(picks.filter((p) => p.profile_id === pid)));
    return computeStats(size, tracks, maps, consensus);
  }, [consensus, completedSet, picks, size, tracks]);

  const doneCount = progress.completed_ids.length;
  const finishedEntries = entries.filter((e) => e.completed_at);
  const memberById = (pid: string) => mentionMembers.find((m) => m.profile_id === pid) ?? null;

  return (
    <>
      {/* Header card: artist + progress + admin valves */}
      <Card>
        <View style={styles.reviewHead}>
          {bracket.artist_image_url ? <Image source={{ uri: bracket.artist_image_url }} style={styles.artistArtLg} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.artistName, { color: palette.text1 }]}>{bracket.artist_name}</Text>
            <Text style={[styles.hint, { color: palette.text3 }]}>
              {size}-song bracket · {closed ? 'closed' : `${doneCount} of ${progress.total} finished`}
            </Text>
          </View>
        </View>
        {!closed && canRun ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Button title="Close bracket" variant="ghost" onPress={closeBracket} loading={busy} style={{ flex: 1 }} />
            <Button title="Scrap" variant="ghost" onPress={deleteBracket} style={{ flex: 1 }} />
          </View>
        ) : null}
      </Card>
      {error ? <InlineNote text={error} tone="error" /> : null}

      {/* My versus flow */}
      {!closed && !iAmDone ? (
        current ? (
          <>
            <Text style={[styles.sectionTitle, { color: palette.text3 }]}>
              <Text style={[styles.roundName, { color: palette.amber }]}>
                {roundName(size, current.round).toUpperCase()}
              </Text>
              {' · '}
              {Object.keys(myPicks).length} OF {size - 1} PICKS MADE
            </Text>
            <VersusCard a={current.a} b={current.b} onPick={pick} />
          </>
        ) : complete ? (
          <Card>
            <Label>Your champion awaits</Label>
            {(() => {
              const champ = byId.get(myPicks[pickKey(rounds, 1)] ?? '');
              return champ ? <TrackRow track={champ} big /> : null;
            })()}
            <Button title="👑 Crown your champion" onPress={crown} loading={busy} style={{ marginTop: 12 }} />
            <Text style={[styles.hint, { color: palette.text3, marginTop: 8 }]}>
              Crowning locks your bracket and reveals the club's picks.
            </Text>
          </Card>
        ) : null
      ) : null}

      {/* My bracket (editable until crowned) */}
      {!closed && !iAmDone ? (
        <>
          <Pressable onPress={() => setShowMyBracket((v) => !v)} style={{ paddingVertical: 6 }}>
            <Text style={[styles.sectionTitle, { color: palette.text3, marginTop: 4 }]}>
              {showMyBracket ? '▾' : '▸'} MY BRACKET {showMyBracket ? '· TAP A MATCHUP TO REDO IT' : ''}
            </Text>
          </Pressable>
          {showMyBracket ? (
            <BracketTree
              size={size}
              tracks={tracks}
              picks={myPicks}
              onTapMatchup={(round, slot) => setRedo({ round, slot })}
            />
          ) : null}
        </>
      ) : null}

      {/* Results: consensus + stats + member champions (spoiler-gated) */}
      {resultsVisible ? (
        <>
          {iAmDone && !closed ? (
            <InlineNote text={`You're locked in${doneCount < progress.total ? ` — ${progress.total - doneCount} still picking` : ''}.`} />
          ) : null}

          {consensus?.champion ? (
            <Card>
              <Label>The club's champion {closed ? '' : '(so far)'}</Label>
              <TrackRow track={consensus.champion} big />
              <Text style={[styles.hint, { color: palette.text3, marginTop: 6 }]}>
                From {doneCount} finished bracket{doneCount === 1 ? '' : 's'} — each win anywhere earns a song a point,
                and the field is replayed on points.
              </Text>
            </Card>
          ) : null}

          {stats ? <StatsPanel stats={stats} /> : null}

          {finishedEntries.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: palette.text3 }]}>CHAMPIONS CROWNED</Text>
              {finishedEntries.map((e) => {
                const m = memberById(e.profile_id);
                const champ = e.champion_track_id ? byId.get(e.champion_track_id) : null;
                const isOpen = peek === e.profile_id;
                const ffRound = rounds - 2;
                const theirPicks = toPickMap(picks.filter((p) => p.profile_id === e.profile_id));
                const finalFour = Array.from({ length: 4 }, (_, i) => theirPicks[pickKey(ffRound, i + 1)])
                  .map((tid) => (tid ? byId.get(tid) : undefined))
                  .filter((t): t is BracketTrack => !!t);
                return (
                  <Card key={e.profile_id}>
                    <Pressable onPress={() => setPeek(isOpen ? null : e.profile_id)} style={styles.champHead}>
                      <Avatar name={m?.display_name ?? null} colorIndex={m?.avatar_color ?? 0} imageUrl={m?.avatar_url} size={28} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.author, { color: palette.text1 }]}>{memberName(m?.display_name, m?.email)}</Text>
                        <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text3 }]}>
                          👑 {champ?.title ?? '?'}
                        </Text>
                      </View>
                      <Text style={{ color: palette.text3 }}>{isOpen ? '▾' : '▸'}</Text>
                    </Pressable>
                    <View style={styles.ffRow}>
                      {finalFour.map((t) => (
                        <View key={t.id} style={styles.ffItem}>
                          {t.artwork_url ? <Image source={{ uri: t.artwork_url }} style={styles.art} contentFit="cover" /> : null}
                          <Text numberOfLines={2} style={[styles.ffTitle, { color: palette.text2 }]}>{t.title}</Text>
                        </View>
                      ))}
                    </View>
                    {isOpen ? <BracketTree size={size} tracks={tracks} picks={theirPicks} /> : null}
                  </Card>
                );
              })}
            </>
          ) : null}
        </>
      ) : null}

      {/* Comments */}
      <CommentThread state={state} userId={userId} mentionMembers={mentionMembers} onChange={onChange} />
    </>
  );
}

function VersusCard({ a, b, onPick }: { a: BracketTrack; b: BracketTrack; onPick: (id: string) => void }) {
  const { palette } = useTheme();
  const side = (t: BracketTrack) => (
    <View style={[styles.vsSide, { borderColor: palette.border, backgroundColor: palette.card2 }]}>
      {t.artwork_url ? <Image source={{ uri: t.artwork_url }} style={styles.vsArt} contentFit="cover" /> : null}
      <Text style={[styles.seedBadge, { color: palette.amber }]}>#{t.seed}</Text>
      <Text numberOfLines={2} style={[styles.vsTitle, { color: palette.text1 }]}>{t.title}</Text>
      {t.album ? <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text3 }]}>{t.album}</Text> : null}
      <ListenLinks apple={t.apple_url} spotify={t.spotify_url} other={null} style={{ marginTop: 6 }} />
      <Button title="This one" onPress={() => onPick(t.id)} style={{ marginTop: 8, alignSelf: 'stretch' }} />
    </View>
  );
  return (
    <View style={styles.vsRow}>
      {side(a)}
      <Text style={[styles.vsBadge, { color: palette.amber }]}>VS</Text>
      {side(b)}
    </View>
  );
}

function TrackRow({ track, big }: { track: BracketTrack; big?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.songRow, big && { marginTop: 8 }]}>
      {track.artwork_url ? (
        <Image source={{ uri: track.artwork_url }} style={big ? styles.artLg : styles.art} contentFit="cover" />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={[big ? styles.champTitle : styles.sTitle, { color: palette.text1 }]}>
          {track.title}
        </Text>
        <Text style={[styles.sArtist, { color: palette.text3 }]}>#{track.seed} seed{track.album ? ` · ${track.album}` : ''}</Text>
        <ListenLinks apple={track.apple_url} spotify={track.spotify_url} other={null} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

// The whole tree as sectioned rounds — phone-honest instead of a pinch-zoom
// tree. Winner side is highlighted; undecided sides render muted.
function BracketTree({
  size,
  tracks,
  picks,
  onTapMatchup,
}: {
  size: number;
  tracks: BracketTrack[];
  picks: PickMap;
  onTapMatchup?: (round: number, slot: number) => void;
}) {
  const { palette } = useTheme();
  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const byPosition = useMemo(() => new Map(tracks.map((t) => [t.position, t])), [tracks]);
  const rounds = bracketRounds(size);
  const [openRound, setOpenRound] = useState(rounds); // default: show the business end

  return (
    <View style={{ marginBottom: 12 }}>
      {Array.from({ length: rounds }, (_, i) => i + 1).map((round) => {
        const slots = size / 2 ** round;
        const open = openRound === round;
        return (
          <View key={round}>
            <Pressable onPress={() => setOpenRound(open ? 0 : round)} style={{ paddingVertical: 6 }}>
              <Text style={[styles.roundHead, { color: palette.text3 }]}>
                {open ? '▾' : '▸'}{' '}
                <Text style={[styles.roundName, { color: palette.amber }]}>{roundName(size, round).toUpperCase()}</Text>
              </Text>
            </Pressable>
            {open
              ? Array.from({ length: slots }, (_, s) => s + 1).map((slot) => {
                  const feeders = matchupFeeders(round, slot, byPosition, byId, picks);
                  const winner = picks[pickKey(round, slot)];
                  const cell = (t: BracketTrack | null) => {
                    const won = !!t && winner === t.id;
                    const lost = !!t && !!winner && winner !== t.id;
                    return (
                      <View style={[styles.treeCell, { borderColor: palette.border }, won && { borderColor: palette.amber, backgroundColor: palette.amberBg }]}>
                        <Text
                          numberOfLines={1}
                          style={[styles.treeCellText, { color: won ? palette.amber : lost ? palette.text3 : palette.text2 }]}
                        >
                          {t ? `${t.seed} · ${t.title}` : '—'}
                        </Text>
                      </View>
                    );
                  };
                  return (
                    <Pressable
                      key={slot}
                      disabled={!onTapMatchup || !feeders}
                      onPress={() => onTapMatchup?.(round, slot)}
                      style={styles.treeRow}
                    >
                      {cell(feeders?.[0] ?? null)}
                      {cell(feeders?.[1] ?? null)}
                    </Pressable>
                  );
                })
              : null}
          </View>
        );
      })}
    </View>
  );
}

function StatsPanel({ stats }: { stats: ReturnType<typeof computeStats> }) {
  const { palette } = useTheme();
  return (
    <Card>
      <Label>Bracket math</Label>
      {stats.championTally.length > 0 ? (
        <Text style={[styles.statLine, { color: palette.text2 }]}>
          👑 Champions: {stats.championTally.map((c) => `${c.track.title} ×${c.count}`).join(' · ')}
        </Text>
      ) : null}
      {stats.finalFourTally.length > 0 ? (
        <Text style={[styles.statLine, { color: palette.text2 }]}>
          🎪 Final-four regulars: {stats.finalFourTally.slice(0, 4).map((c) => `${c.track.title} (${c.count})`).join(' · ')}
        </Text>
      ) : null}
      {stats.mostControversial ? (
        <Text style={[styles.statLine, { color: palette.text2 }]}>
          🔥 Most controversial: {stats.mostControversial.a.title} {stats.mostControversial.aVotes}–
          {stats.mostControversial.bVotes} {stats.mostControversial.b.title}
        </Text>
      ) : null}
      {stats.biggestUpset ? (
        <Text style={[styles.statLine, { color: palette.text2 }]}>
          😱 Biggest upset: #{stats.biggestUpset.winner.seed} {stats.biggestUpset.winner.title} over #
          {stats.biggestUpset.loser.seed} {stats.biggestUpset.loser.title}
        </Text>
      ) : null}
    </Card>
  );
}

function CommentThread({
  state,
  userId,
  mentionMembers,
  onChange,
}: {
  state: BracketState;
  userId: string | null;
  mentionMembers: MentionMember[];
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const { bracket, comments } = state;
  const [text, setText] = useState('');

  const add = async () => {
    if (!userId || !text.trim()) return;
    const body = text;
    await trackMadness.addComment(bracket.id, userId, body);
    setText('');
    onChange();
    const tagged = resolveMentions(body, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(bracket.club_id, tagged, {
          context: 'bracket',
          snippet: body.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
  };

  return (
    <Card>
      <Label>Trash talk</Label>
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
            <Pressable onPress={async () => { await trackMadness.removeComment(c.id); onChange(); }} hitSlop={6}>
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
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  art: { width: 40, height: 40, borderRadius: radius.sm },
  artLg: { width: 64, height: 64, borderRadius: radius.md },
  artistArt: { width: 40, height: 40, borderRadius: 20 },
  artistArtLg: { width: 52, height: 52, borderRadius: 26 },
  artistName: { fontFamily: fonts.sansBold, fontSize: 17 },
  sTitle: { fontFamily: fonts.sansBold, fontSize: 13 },
  sArtist: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 6 },
  sizeBtn: { borderWidth: 1, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 16 },
  sizeText: { fontFamily: fonts.sansBold, fontSize: 14 },
  seedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  seedNum: { fontFamily: fonts.monoMedium, fontSize: 11, width: 20, textAlign: 'right' },
  swapBox: { borderWidth: 1, borderRadius: radius.md, padding: 10, marginTop: 10, gap: 8 },
  archiveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  vsSide: { flex: 1, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: 10 },
  vsArt: { width: 84, height: 84, borderRadius: radius.md, marginBottom: 6 },
  vsBadge: { fontFamily: fonts.sansBold, fontSize: 14, alignSelf: 'center' },
  vsTitle: { fontFamily: fonts.sansBold, fontSize: 14, textAlign: 'center' },
  seedBadge: { fontFamily: fonts.monoMedium, fontSize: 14, marginBottom: 2 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  champTitle: { fontFamily: fonts.sansBold, fontSize: 16 },
  champHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ffRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  ffItem: { flex: 1, alignItems: 'center', gap: 4 },
  ffTitle: { fontFamily: fonts.sans, fontSize: 10, textAlign: 'center' },
  roundHead: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.5 },
  roundName: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1.5 },
  treeRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  treeCell: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8 },
  treeCellText: { fontFamily: fonts.sans, fontSize: 11 },
  statLine: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, marginTop: 6 },
  author: { fontFamily: fonts.sansBold, fontSize: 13 },
  time: { fontFamily: fonts.mono, fontSize: 10 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10 },
  commentAuthor: { fontFamily: fonts.sansBold, fontSize: 11, marginBottom: 1 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentForm: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
});
