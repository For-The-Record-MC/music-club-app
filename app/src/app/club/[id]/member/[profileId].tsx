import { Image } from 'expo-image';
import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import { memberName } from '@/utils/memberName';
import {
  albums as albumsDb,
  feed as feedDb,
  leaderboard,
  profiles as profilesDb,
  profileTracks as tracksDb,
  ratings as ratingsDb,
  TRACK_SLOTS,
  TRACK_SLOT_LABELS,
  type Album,
  type FeedPost,
  type LeaderboardRow,
  type Profile,
  type ProfileTrack,
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
  const [albumAvgs, setAlbumAvgs] = useState<Record<string, number>>({});
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id || !profileId) return;
    const [boardRes, profileRes, tracksRes, picksRes, postsRes] = await Promise.all([
      leaderboard.get(id),
      profilesDb.getById(profileId),
      tracksDb.listByProfile(profileId),
      albumsDb.listByMember(id, profileId),
      feedDb.listByAuthor(id, profileId),
    ]);
    setBoard((boardRes.data as LeaderboardRow[] | null) ?? []);
    setProfileRow((profileRes.data as Profile | null) ?? null);
    setTracks((tracksRes.data ?? []) as ProfileTrack[]);
    const pickRows = (picksRes.data ?? []) as PickedAlbum[];
    setPicks(pickRows);
    setPosts((postsRes.data ?? []) as FeedPost[]);

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

  if (loading && !me) {
    return (
      <Screen>
        <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12 }}>Loading…</Text>
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
        {isMe ? (
          <Button
            title="Edit profile"
            variant="ghost"
            onPress={() => router.push('/profile-setup')}
            style={{ marginTop: 6, alignSelf: 'stretch' }}
          />
        ) : null}
      </Card>

      {/* The album their profile picture comes from */}
      {profileRow?.avatar_url && profileRow.avatar_label ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>PROFILE PICTURE FROM</Text>
          <Pressable
            onPress={() =>
              profileRow.avatar_album_url && Linking.openURL(profileRow.avatar_album_url)
            }
            disabled={!profileRow.avatar_album_url}
          >
            <Card>
              <View style={styles.trackRow}>
                <Image
                  source={{ uri: profileRow.avatar_url }}
                  style={styles.trackArt}
                  contentFit="cover"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.trackName, { color: palette.text1 }]} numberOfLines={2}>
                    {profileRow.avatar_label}
                  </Text>
                </View>
                {profileRow.avatar_album_url ? (
                  <Text style={[styles.play, { color: palette.teal }]}>↗</Text>
                ) : null}
              </View>
            </Card>
          </Pressable>
        </>
      ) : null}

      {/* Featured tracks */}
      <Text style={[styles.section, { color: palette.text2 }]}>FEATURED TRACKS</Text>
      {TRACK_SLOTS.map((slot) => {
        const t = trackFor(slot);
        return (
          <Card key={slot} style={{ marginBottom: 8 }}>
            <Text style={[styles.slotLabel, { color: palette.text3 }]}>
              {SLOT_EMOJI[slot]} {TRACK_SLOT_LABELS[slot].toUpperCase()}
            </Text>
            {t ? (
              <Pressable
                onPress={() => t.spotify_url && Linking.openURL(t.spotify_url)}
                style={styles.trackRow}
              >
                {t.artwork_url ? (
                  <Image source={{ uri: t.artwork_url }} style={styles.trackArt} contentFit="cover" />
                ) : (
                  <View style={[styles.trackArt, { backgroundColor: palette.surface }]} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.trackName, { color: palette.text1 }]} numberOfLines={1}>
                    {t.track_name}
                  </Text>
                  <Text style={[styles.trackArtist, { color: palette.text2 }]} numberOfLines={1}>
                    {t.artist_name}
                    {t.album_name ? ` · ${t.album_name}` : ''}
                  </Text>
                  {t.caption ? (
                    <Text style={[styles.caption, { color: palette.text3 }]} numberOfLines={2}>
                      “{t.caption}”
                    </Text>
                  ) : null}
                </View>
                {t.spotify_url ? (
                  <Text style={[styles.play, { color: palette.teal }]}>▶</Text>
                ) : null}
              </Pressable>
            ) : (
              <Pressable
                onPress={isMe ? () => router.push('/profile-setup') : undefined}
                style={styles.emptySlot}
              >
                <Text style={[styles.emptySlotText, { color: palette.text3 }]}>
                  {isMe ? '+ Add a track' : 'Not set'}
                </Text>
              </Pressable>
            )}
          </Card>
        );
      })}

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
            </View>
          </Card>
        </>
      ) : null}

      {/* Their picks */}
      {picks.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>ALBUMS PICKED</Text>
          {picks.map((a) => {
            const avg = a.cycles?.revealed_at ? albumAvgs[a.id] : undefined;
            return (
              <Pressable key={a.id} onPress={() => router.push(`/club/${id}/album/${a.id}`)}>
                <Card style={{ marginBottom: 8 }}>
                  <View style={styles.trackRow}>
                    {a.artwork_url ? (
                      <Image source={{ uri: a.artwork_url }} style={styles.trackArt} contentFit="cover" />
                    ) : (
                      <View style={[styles.trackArt, { backgroundColor: palette.surface }]} />
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.trackName, { color: palette.text1 }]} numberOfLines={1}>
                        {a.title}
                      </Text>
                      <Text style={[styles.trackArtist, { color: palette.text2 }]} numberOfLines={1}>
                        {a.artist}
                      </Text>
                    </View>
                    {avg != null ? (
                      <View style={styles.statBox}>
                        <Text style={[styles.statValue, { color: palette.text1 }]}>{avg.toFixed(1)}</Text>
                        <Text style={[styles.statUnit, { color: palette.text3 }]}>avg</Text>
                      </View>
                    ) : (
                      <Text style={[styles.sealed, { color: palette.text3 }]}>
                        {a.cycles?.revealed_at ? '—' : '🔒'}
                      </Text>
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </>
      ) : null}

      {/* Recent posts */}
      {posts.length > 0 ? (
        <>
          <Text style={[styles.section, { color: palette.text2 }]}>RECENTLY SHARED</Text>
          {posts.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: '/feed', params: { focus: String(p.id) } })}
            >
              <Card style={{ marginBottom: 8 }}>
                <Text style={[styles.trackName, { color: palette.text1 }]} numberOfLines={1}>
                  {p.title}
                </Text>
                {p.artist ? (
                  <Text style={[styles.trackArtist, { color: palette.text2 }]} numberOfLines={1}>
                    {p.artist}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}
    </Screen>
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
  slotLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  trackArt: { width: 48, height: 48, borderRadius: radius.sm },
  trackName: { fontFamily: fonts.sansBold, fontSize: 14 },
  trackArtist: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  caption: { fontFamily: fonts.sans, fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  play: { fontSize: 16 },
  emptySlot: { paddingVertical: 10, alignItems: 'center' },
  emptySlotText: { fontFamily: fonts.mono, fontSize: 12 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '25%', alignItems: 'center', paddingVertical: 10 },
  statCellValue: { fontFamily: fonts.sansBold, fontSize: 18 },
  statCellLabel: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.3, marginTop: 3, textAlign: 'center' },
  statBox: { alignItems: 'flex-end', minWidth: 36 },
  statValue: { fontFamily: fonts.sansBold, fontSize: 16 },
  statUnit: { fontFamily: fonts.mono, fontSize: 8, marginTop: 1 },
  sealed: { fontFamily: fonts.mono, fontSize: 14 },
});
