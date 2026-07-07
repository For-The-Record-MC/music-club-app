import { Image } from 'expo-image';
import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, Loading, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import { memberName } from '@/utils/memberName';
import {
  albums as albumsDb,
  archive as archiveDb,
  bestBars as barsDb,
  feed as feedDb,
  musicalTakes as takesDb,
  leaderboard,
  profiles as profilesDb,
  profileTracks as tracksDb,
  ratings as ratingsDb,
  studio as studioDb,
  TRACK_SLOTS,
  TRACK_SLOT_LABELS,
  type Album,
  type FeedPost,
  type LeaderboardRow,
  type Profile,
  type ProfileTrack,
  type StudioMemberStats,
} from '@/utils/supabase/db';

const SLOT_EMOJI: Record<string, string> = { new: '✨', old: '📼', obsession: '🔁' };

interface PickedAlbum extends Album {
  cycles: { club_id: string; number: number; revealed_at: string | null; status: string } | null;
}

// A member's public profile within a club: identity + rank, their three
// featured tracks (global), this club's stats, the albums they've picked, and
// their recently shared posts. Reached by tapping a leaderboard row.
export default function MemberProfile() {
  const { id, profileId } = useLocalSearchParams<{ id: string; profileId: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const { club } = useClubData(id);
  const isMe = profileId === userId;

  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [profileRow, setProfileRow] = useState<Profile | null>(null);
  const [tracks, setTracks] = useState<ProfileTrack[]>([]);
  const [picks, setPicks] = useState<PickedAlbum[]>([]);
  const [archivePicks, setArchivePicks] = useState<Album[]>([]);
  const [albumAvgs, setAlbumAvgs] = useState<Record<string, number>>({});
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [studioStats, setStudioStats] = useState<StudioMemberStats | null>(null);
  const [takes, setTakes] = useState<{ id: string; body: string; agree: number; disagree: number }[]>([]);
  const [bars, setBars] = useState<{ id: string; title: string; artist: string; artwork_url: string | null; lyric: string; avg: number | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id || !profileId) return;
    const [boardRes, profileRes, tracksRes, picksRes, archiveRes, postsRes, studioRes, takesRes, barsRes] = await Promise.all([
      leaderboard.get(id),
      profilesDb.getById(profileId),
      tracksDb.listByProfile(profileId),
      albumsDb.listByMember(id, profileId),
      archiveDb.listByMember(id, profileId),
      feedDb.listByAuthor(id, profileId),
      studioDb.memberStats(id, profileId),
      takesDb.listByAuthor(id, profileId),
      barsDb.listByAuthor(id, profileId),
    ]);
    setBoard((boardRes.data as LeaderboardRow[] | null) ?? []);
    setProfileRow((profileRes.data as Profile | null) ?? null);
    setTracks((tracksRes.data ?? []) as ProfileTrack[]);
    const pickRows = (picksRes.data ?? []) as PickedAlbum[];
    setPicks(pickRows);
    setArchivePicks((archiveRes.data ?? []) as Album[]);
    setPosts((postsRes.data ?? []) as FeedPost[]);
    setStudioStats((studioRes.data ?? null) as StudioMemberStats | null);
    setTakes(((takesRes.data ?? []) as any[]).map((t) => ({
      id: t.id,
      body: t.body,
      agree: (t.musical_take_positions ?? []).filter((x: any) => x.value > 0).length,
      disagree: (t.musical_take_positions ?? []).filter((x: any) => x.value < 0).length,
    })));
    setBars(((barsRes.data ?? []) as any[]).map((b) => {
      const scores = (b.best_bar_ratings ?? []).map((r: any) => r.score);
      return {
        id: b.id,
        title: b.title,
        artist: b.artist,
        artwork_url: b.artwork_url,
        lyric: b.lyric,
        avg: scores.length ? scores.reduce((a: number, x: number) => a + x, 0) / scores.length : null,
      };
    }));

    // Per-album averages, only for revealed cycles (RLS returns nothing else).
    const revealedIds = pickRows.filter((p) => p.cycles?.revealed_at).map((p) => p.id);
    if (revealedIds.length) {
      const { data } = await ratingsDb.scoresForAlbums(revealedIds);
      const sums: Record<string, { t: number; n: number }> = {};
      for (const r of (data ?? []) as { album_id: string; score: number }[]) {
        sums[r.album_id] ??= { t: 0, n: 0 };
        sums[r.album_id].t += r.score;
        sums[r.album_id].n += 1;
      }
      const avgs: Record<string, number> = {};
      for (const [aid, s] of Object.entries(sums)) avgs[aid] = s.t / s.n;
      setAlbumAvgs(avgs);
    } else {
      setAlbumAvgs({});
    }
    setLoading(false);
  }, [id, profileId]);

  useEffect(() => {
    load();
  }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  // This member's row + their Most Active rank (1-based) for the header chip.
  const me = board.find((r) => r.profile_id === profileId) ?? null;
  const activeRank = useMemo(() => {
    if (!me) return null;
    const sorted = [...board].sort((a, b) => b.active_score - a.active_score);
    return sorted.findIndex((r) => r.profile_id === profileId) + 1;
  }, [board, me, profileId]);

  const trackFor = (slot: string) => tracks.find((t) => t.slot === slot) ?? null;
  // Featured-track notes stay collapsed behind a chip so the card reads clean.
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNote = (slot: string) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });

  if (loading && !me) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  const name = memberName(me?.display_name, me?.email);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>
          {club ? club.name.toUpperCase() : 'PROFILE'}
        </Text>
      </View>

      {/* Header */}
      <Card style={{ alignItems: 'center', paddingVertical: 22, gap: 8 }}>
        <Avatar
          name={name}
          colorIndex={me?.avatar_color ?? 0}
          imageUrl={me?.avatar_url}
          size={72}
        />
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: palette.text1 }]}>{name}</Text>
          {me && me.role !== 'member' ? (
            <Badge
              text={me.role}
              color={me.role === 'owner' ? palette.teal : palette.purple}
              bg={me.role === 'owner' ? palette.tealBg : palette.purpleBg}
            />
          ) : null}
        </View>
        {activeRank ? (
          <Text style={[styles.rankChip, { color: palette.teal, backgroundColor: palette.tealBg }]}>
            #{activeRank} Most Active · {Math.round(me?.active_score ?? 0)} pts
          </Text>
        ) : null}
        {profileRow?.avatar_url && profileRow.avatar_label ? (
          <Pressable
            onPress={() => profileRow.avatar_album_url && Linking.openURL(profileRow.avatar_album_url)}
            disabled={!profileRow.avatar_album_url}
          >
            <Text style={[styles.pfpFrom, { color: palette.text3 }]} numberOfLines={1}>
              pfp from {profileRow.avatar_label}{profileRow.avatar_album_url ? ' ↗' : ''}
            </Text>
          </Pressable>
        ) : null}
        {isMe ? (
          <Button
            title="Edit profile"
            variant="ghost"
            onPress={() => router.push('/profile-setup')}
            style={{ marginTop: 6, alignSelf: 'stretch' }}
          />
        ) : null}
      </Card>

      {/* Featured tracks — spinning records on the platter */}
      <Text style={[styles.section, { color: palette.text2 }]}>IN ROTATION</Text>
      <View style={styles.rotationRow}>
        {TRACK_SLOTS.map((slot) => {
          const t = trackFor(slot);
          const noteOpen = openNotes.has(slot);
          return (
            <Pressable
              key={slot}
              style={{ flex: 1 }}
              onPress={
                t?.spotify_url
                  ? () => Linking.openURL(t.spotify_url!)
                  : isMe && !t
                    ? () => router.push('/profile-setup')
                    : undefined
              }
            >
              <Card style={styles.rotationCard}>
                <SpinningTrack uri={t?.artwork_url ?? null} size={72} />
                <Text style={[styles.slotLabel, { color: palette.text3, marginTop: 8 }]}>
                  {SLOT_EMOJI[slot]} {TRACK_SLOT_LABELS[slot].toUpperCase()}
                </Text>
                {t ? (
                  <>
                    <Text numberOfLines={2} style={[styles.rotationTitle, { color: palette.text1 }]}>{t.track_name}</Text>
                    <Text numberOfLines={1} style={[styles.rotationMeta, { color: palette.text3 }]}>{t.artist_name}</Text>
                    {t.caption ? (
                      <Pressable onPress={() => toggleNote(slot)} hitSlop={6}>
                        <Text
                          style={[
                            styles.noteChip,
                            {
                              color: noteOpen ? palette.amber : palette.text3,
                              borderColor: noteOpen ? palette.amber : palette.border,
                              marginTop: 5,
                            },
                          ]}
                        >
                          {noteOpen ? '📝 ▴' : '📝'}
                        </Text>
                      </Pressable>
                    ) : null}
                    {t.caption && noteOpen ? (
                      <Text style={[styles.rotationCaption, { color: palette.text3 }]}>“{t.caption}”</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.emptySlotText, { color: palette.text3 }]}>{isMe ? '+ Add a track' : 'Not set'}</Text>
                )}
              </Card>
            </Pressable>
          );
        })}
      </View>

      {/* Trophy shelf + champions gallery — wins & feats only; participation
          stays numeric in the stats grid (TROPHIES_RECAP_PLAN.md). */}
      {studioStats ? <TrophyShelf data={studioStats} /> : null}
      {studioStats && studioStats.champions.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>CHAMPIONS CROWNED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
            {studioStats.champions.map((c) => (
              <Pressable
                key={c.bracket_id}
                // Solo brackets open as themselves; club brackets open as THIS
                // member's breakdown (with a jump to the official board).
                onPress={() =>
                  router.push({
                    pathname: '/clubhouse/madness',
                    params:
                      c.scope === 'personal'
                        ? { focus: String(c.bracket_id) }
                        : { focus: String(c.bracket_id), member: String(profileId) },
                  })
                }
              >
                <Card style={styles.champCard}>
                  {c.champ_artwork_url ? (
                    <Image source={{ uri: c.champ_artwork_url }} style={styles.champArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.champArt, { backgroundColor: palette.surface }]} />
                  )}
                  <Text numberOfLines={1} style={[styles.champTitle, { color: palette.text1 }]}>
                    👑 {c.champ_title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.champMeta, { color: palette.text3 }]}>
                    {c.artist_name} · #{c.champ_seed} seed{c.scope === 'personal' ? ' · solo' : ''}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Stats */}
      {me ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>STATS IN THIS CLUB</Text>
          <Card style={{ marginBottom: 8 }}>
            <View style={styles.statGrid}>
              <Stat label="Albums picked" value={me.stats.albums_chosen} />
              <Stat
                label="Avg rating"
                value={me.stats.avg_rating_received == null ? '—' : me.stats.avg_rating_received.toFixed(1)}
              />
              <Stat label="Songs shared" value={me.stats.songs_shared} />
              <Stat label="Ratings given" value={me.stats.ratings_given} />
              <Stat label="Reactions out" value={me.stats.interactions_given} />
              <Stat label="Reactions in" value={me.stats.interactions_received} />
              <Stat label="Concerts added" value={me.stats.concerts_added} />
              <Stat label="Meetings" value={me.stats.meetings_attended} />
              <Stat label="Convinced" value={studioStats?.stats.conversions ?? 0} />
              <Stat label="Showdown wins" value={studioStats?.showdown_wins.length ?? 0} />
              <Stat label="Aux Battle wins" value={studioStats?.aux_wins.length ?? 0} />
              <Stat label="Brackets finished" value={studioStats?.stats.brackets_finished ?? 0} />
              <Stat label="Takes posted" value={studioStats?.stats.takes ?? 0} />
              <Stat label="Bars dropped" value={studioStats?.stats.bars ?? 0} />
              <Stat label="Boxes lit" value={studioStats?.stats.boxes_lit ?? 0} />
              <Stat label="Bingos" value={studioStats?.stats.bingos ?? 0} />
            </View>
          </Card>
        </>
      ) : null}

      {/* Their picks — artwork rail (tap for the album page) */}
      {picks.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>ALBUMS PICKED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
            {picks.map((a) => {
              const avg = a.cycles?.revealed_at ? albumAvgs[a.id] : undefined;
              return (
                <Pressable key={a.id} onPress={() => router.push(`/club/${id}/album/${a.id}`)}>
                  <Card style={styles.champCard}>
                    {a.artwork_url ? (
                      <Image source={{ uri: a.artwork_url }} style={styles.champArt} contentFit="cover" />
                    ) : (
                      <View style={[styles.champArt, { backgroundColor: palette.surface }]} />
                    )}
                    <Text numberOfLines={1} style={[styles.champTitle, { color: palette.text1 }]}>{a.title}</Text>
                    <Text numberOfLines={1} style={[styles.champMeta, { color: palette.text3 }]}>
                      {avg != null ? `${avg.toFixed(1)} avg` : a.cycles?.revealed_at ? a.artist : `🔒 ${a.artist}`}
                    </Text>
                  </Card>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {/* Pre-FTR picks — capped rail; the full shelf lives in the Archive */}
      {archivePicks.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>PRE-FTR PICKS · {archivePicks.length}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
            {archivePicks.slice(0, 12).map((a) => (
              <Pressable key={a.id} onPress={() => router.push(`/club/${id}/album/${a.id}`)}>
                <Card style={styles.champCard}>
                  {a.artwork_url ? (
                    <Image source={{ uri: a.artwork_url }} style={styles.champArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.champArt, { backgroundColor: palette.surface }]} />
                  )}
                  <Text numberOfLines={1} style={[styles.champTitle, { color: palette.text1 }]}>{a.title}</Text>
                  <Text numberOfLines={1} style={[styles.champMeta, { color: palette.text3 }]}>{a.artist}</Text>
                </Card>
              </Pressable>
            ))}
            {archivePicks.length > 12 ? (
              <Pressable onPress={() => router.push(`/club/${id}/archive`)}>
                <Card style={{ ...styles.champCard, justifyContent: 'center', minHeight: 140 }}>
                  <Text style={[styles.moreCard, { color: palette.text2 }]}>+{archivePicks.length - 12}</Text>
                  <Text style={[styles.champMeta, { color: palette.text3 }]}>in the Archive</Text>
                </Card>
              </Pressable>
            ) : null}
          </ScrollView>
        </>
      ) : null}

      {/* Hot takes they've dropped */}
      {takes.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>MIC DROPS</Text>
          {takes.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: '/clubhouse/takes', params: { focus: String(t.id) } })}
            >
              <Card style={{ marginBottom: 8 }}>
                <Text style={[styles.quote, { color: palette.text1 }]}>🔥 “{t.body}”</Text>
                {t.agree + t.disagree > 0 ? (
                  <Text style={[styles.quoteMeta, { color: palette.text3 }]}>
                    {t.agree} agree · {t.disagree} disagree
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      {/* Bars they've shouted out */}
      {bars.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>BEST BARS</Text>
          {bars.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => router.push({ pathname: '/clubhouse/bars', params: { focus: String(b.id) } })}
            >
              <Card style={{ marginBottom: 8 }}>
                <View style={styles.trackRow}>
                  {b.artwork_url ? (
                    <Image source={{ uri: b.artwork_url }} style={styles.barArt} contentFit="cover" />
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.quote, { color: palette.text1 }]} numberOfLines={3}>
                      🎤 “{b.lyric}”
                    </Text>
                    <Text style={[styles.quoteMeta, { color: palette.text3 }]} numberOfLines={1}>
                      {b.title}{b.artist ? ` · ${b.artist}` : ''}{b.avg != null ? ` · goes ${b.avg.toFixed(1)}/10 hard` : ''}
                    </Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}

      {/* Recent posts — artwork rail, matching the picks/champions rails */}
      {posts.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>RECENTLY SHARED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
            {posts.map((p) => {
              const art = (p.metadata as { artwork?: string } | null)?.artwork;
              return (
                <Pressable
                  key={p.id}
                  // Album suggestions live in The Queue, not Club Radio —
                  // mirror the activity feed's routing split.
                  onPress={() =>
                    p.is_album_suggestion
                      ? router.push({ pathname: '/club/[id]/suggestions', params: { id: String(id) } })
                      : router.push({ pathname: '/clubhouse/activity', params: { focus: String(p.id) } })
                  }
                >
                  <Card style={styles.champCard}>
                    {art ? (
                      <Image source={{ uri: art }} style={styles.champArt} contentFit="cover" />
                    ) : (
                      <View style={{ ...styles.champArt, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 26 }}>🎧</Text>
                      </View>
                    )}
                    <Text numberOfLines={1} style={[styles.champTitle, { color: palette.text1 }]}>{p.title}</Text>
                    <Text numberOfLines={1} style={[styles.champMeta, { color: palette.text3 }]}>{p.artist || ' '}</Text>
                  </Card>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}

// A featured track as a record on the platter: circular album art on a vinyl
// rim, slowly rotating on its axis (SpinningRecord's loop, at 33⅓-ish pace).
// No artwork → a bare platter.
function SpinningTrack({ uri, size = 92 }: { uri: string | null; size?: number }) {
  const { palette, isDark } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 24000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const vinyl = isDark ? '#161616' : '#1c1c1a';

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: vinyl,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ rotate }],
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size - 12, height: size - 12, borderRadius: (size - 12) / 2 }}
          contentFit="cover"
        />
      ) : (
        <View style={{ width: size - 12, height: size - 12, borderRadius: (size - 12) / 2, backgroundColor: palette.surface }} />
      )}
      {/* Spindle hole — the fixed axis the record turns on. */}
      <View
        style={{
          position: 'absolute',
          width: Math.max(6, size * 0.09),
          height: Math.max(6, size * 0.09),
          borderRadius: size,
          backgroundColor: vinyl,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.25)',
        }}
      />
    </Animated.View>
  );
}

// Emoji trophy cases with counts; tap a case to expand its receipts.
function TrophyShelf({ data }: { data: StudioMemberStats }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState<string | null>(null);

  const cases: { key: string; emoji: string; label: string; count: number; receipts: string[] }[] = [
    {
      key: 'showdown',
      emoji: '🏆',
      label: 'Showdown',
      count: data.showdown_wins.length,
      receipts: data.showdown_wins.map((w) => `Cycle ${w.cycle_number} · “${w.title}”${w.theme ? ` (${w.theme})` : ''}`),
    },
    {
      key: 'aux',
      emoji: '🎚️',
      label: 'Aux Battle',
      count: data.aux_wins.length,
      receipts: data.aux_wins.map((w) => `Cycle ${w.cycle_number} · “${w.theme}”`),
    },
    {
      key: 'crown',
      emoji: '🎱',
      label: 'Bingo crown',
      count: data.bingo_crowns.length,
      receipts: data.bingo_crowns.map((c) => `First bingo of the game · ${new Date(c.at).toLocaleDateString()}`),
    },
    {
      key: 'blackout',
      emoji: '⬛',
      label: 'Blackout',
      count: data.blackouts.length,
      receipts: data.blackouts.map((b) => `Full card · ${new Date(b.at).toLocaleDateString()}`),
    },
  ].filter((c) => c.count > 0);

  if (cases.length === 0) return null;
  const openCase = cases.find((c) => c.key === open) ?? null;

  return (
    <>
      <Text style={[styles.section, { color: palette.text2 }]}>TROPHY SHELF</Text>
      <Card>
        <View style={styles.shelfRow}>
          {cases.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => setOpen(open === c.key ? null : c.key)}
              style={[
                styles.trophyCase,
                { borderColor: open === c.key ? palette.amber : palette.border, backgroundColor: open === c.key ? palette.amberBg : 'transparent' },
              ]}
            >
              <Text style={styles.trophyEmoji}>{c.emoji}</Text>
              <Text style={[styles.trophyCount, { color: palette.text1 }]}>×{c.count}</Text>
              <Text style={[styles.trophyLabel, { color: palette.text3 }]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        {openCase
          ? openCase.receipts.map((r, i) => (
              <Text key={i} style={[styles.receipt, { color: palette.text2, borderTopColor: palette.border }]}>
                {openCase.emoji} {r}
              </Text>
            ))
          : null}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statCellValue, { color: palette.text1 }]}>{value}</Text>
      <Text style={[styles.statCellLabel, { color: palette.text3 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 20 },
  rankChip: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  section: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2, marginTop: 18, marginBottom: 8 },
  slotLabel: { fontFamily: fonts.sansMedium, fontSize: 10, letterSpacing: 0.4, marginBottom: 2, textAlign: 'center' },
  pfpFrom: { fontFamily: fonts.sans, fontSize: 11, fontStyle: 'italic', maxWidth: 260 },
  moreCard: { fontFamily: fonts.sansBold, fontSize: 22 },
  rotationRow: { flexDirection: 'row', gap: 8 },
  rotationCard: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 6 },
  rotationTitle: { fontFamily: fonts.sansBold, fontSize: 12, textAlign: 'center' },
  rotationMeta: { fontFamily: fonts.sans, fontSize: 11, textAlign: 'center' },
  rotationCaption: { fontFamily: fonts.sans, fontSize: 10, lineHeight: 14, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
  noteChip: {
    fontSize: 11,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackArt: { width: 48, height: 48, borderRadius: radius.sm },
  trackName: { fontFamily: fonts.sansBold, fontSize: 14 },
  trackArtist: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  caption: { fontFamily: fonts.sans, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  play: { fontSize: 16 },
  emptySlot: { paddingVertical: 10, alignItems: 'center' },
  emptySlotText: { fontFamily: fonts.mono, fontSize: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '25%', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 2 },
  statCellValue: { fontFamily: fonts.sansBold, fontSize: 18 },
  statCellLabel: { fontFamily: fonts.sansMedium, fontSize: 10, lineHeight: 13, marginTop: 3, textAlign: 'center' },
  shelfRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trophyCase: { alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, minWidth: 72 },
  trophyEmoji: { fontSize: 22 },
  trophyCount: { fontFamily: fonts.sansBold, fontSize: 13, marginTop: 2 },
  trophyLabel: { fontFamily: fonts.sans, fontSize: 9, marginTop: 1 },
  receipt: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, paddingTop: 8, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  galleryRow: { gap: 8, paddingRight: 8 },
  champCard: { width: 120, alignItems: 'center', gap: 4 },
  champArt: { width: 96, height: 96, borderRadius: radius.sm },
  champTitle: { fontFamily: fonts.sansBold, fontSize: 11, maxWidth: 104 },
  champMeta: { fontFamily: fonts.sans, fontSize: 10, maxWidth: 104 },
  quote: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  quoteMeta: { fontFamily: fonts.sans, fontSize: 11, marginTop: 4 },
  barArt: { width: 40, height: 40, borderRadius: radius.sm },
  statBox: { alignItems: 'flex-end', minWidth: 36 },
  statValue: { fontFamily: fonts.sansBold, fontSize: 16 },
  statUnit: { fontFamily: fonts.mono, fontSize: 8, marginTop: 1 },
  sealed: { fontFamily: fonts.mono, fontSize: 14 },
});
