import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, InlineNote, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { clubMembers, leaderboard, type LeaderboardRow } from '@/utils/supabase/db';

type Mode = 'active' | 'rated' | 'loved';

const MODES: { key: Mode; label: string }[] = [
  { key: 'active', label: 'Most Active' },
  { key: 'rated', label: 'Top Rated' },
  { key: 'loved', label: 'Most Loved' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

// Most-recent-activity tie-break: newer activity ranks higher; nulls last.
function byRecent(a: LeaderboardRow, b: LeaderboardRow): number {
  const ta = a.last_active_at ? Date.parse(a.last_active_at) : 0;
  const tb = b.last_active_at ? Date.parse(b.last_active_at) : 0;
  return tb - ta;
}

// The big number shown on a row for the active mode.
function primaryStat(row: LeaderboardRow, mode: Mode): { value: string; unit: string } {
  if (mode === 'rated') {
    const v = row.stats.avg_rating_received;
    return { value: v == null ? '—' : v.toFixed(1), unit: 'avg' };
  }
  if (mode === 'loved') return { value: String(row.stats.interactions_received), unit: 'received' };
  return { value: String(Math.round(row.active_score)), unit: 'pts' };
}

// The small secondary line beneath the name, tuned to the mode.
function secondaryLine(row: LeaderboardRow, mode: Mode): string {
  const s = row.stats;
  if (mode === 'rated') return `${s.albums_chosen} picked · ${s.songs_shared} shared`;
  if (mode === 'loved') return `${s.songs_shared} shared · ${s.interactions_given} given`;
  return `${s.songs_shared} shared · ${s.meetings_attended} meetings · ${s.albums_chosen} picked`;
}

// The Club Hub: a ranked leaderboard of every member, with three lenses —
// Most Active (weighted points), Top Rated (avg rating their picks received,
// revealed cycles only), and Most Loved (reactions + comments others left on
// their posts). Tap a row to open that member's profile. Reached from the Home
// avatar stack. Owner/admin controls and Leave live at the bottom.
export default function Leaderboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const clearClub = useCurrentClubStore((s) => s.setClub);
  const { club, members, myRole } = useClubData(id);

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('active');

  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await leaderboard.get(id);
    setRows((data as LeaderboardRow[] | null) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  // Ranked + (for Top Rated) the muted "not yet rated" tail.
  const { ranked, unrated } = useMemo(() => {
    if (mode === 'rated') {
      const withRating = rows.filter((r) => r.stats.avg_rating_received != null);
      const without = rows.filter((r) => r.stats.avg_rating_received == null);
      withRating.sort(
        (a, b) =>
          (b.stats.avg_rating_received ?? 0) - (a.stats.avg_rating_received ?? 0) || byRecent(a, b),
      );
      without.sort((a, b) =>
        (a.display_name ?? '~').localeCompare(b.display_name ?? '~'),
      );
      return { ranked: withRating, unrated: without };
    }
    const sorted = [...rows];
    if (mode === 'loved') {
      sorted.sort(
        (a, b) => b.stats.interactions_received - a.stats.interactions_received || byRecent(a, b),
      );
    } else {
      sorted.sort((a, b) => b.active_score - a.active_score || byRecent(a, b));
    }
    return { ranked: sorted, unrated: [] as LeaderboardRow[] };
  }, [rows, mode]);

  const leave = async () => {
    if (!club) return;
    const me = members.find((m) => m.profile_id === userId);
    if (!me) return;
    if (await confirmAsync('Leave club', `Leave "${club.name}"?`)) {
      await clubMembers.remove(me.id);
      clearClub(null);
      router.replace('/');
    }
  };

  if (!club) {
    return (
      <Screen>
        <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12 }}>Loading…</Text>
      </Screen>
    );
  }

  const openProfile = (profileId: string) =>
    router.push(`/club/${club.id}/member/${profileId}`);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>{club.name.toUpperCase()}</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>Leaderboard</Text>
        </View>
      </View>

      {/* Mode toggle */}
      <View style={[styles.segment, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        {MODES.map((m) => {
          const on = m.key === mode;
          return (
            <Pressable key={m.key} onPress={() => setMode(m.key)} style={styles.segBtn}>
              <View
                style={[
                  styles.segInner,
                  on && { backgroundColor: palette.tealBg, borderColor: palette.teal },
                ]}
              >
                <Text
                  style={[
                    styles.segText,
                    { color: on ? palette.teal : palette.text2 },
                  ]}
                >
                  {m.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12, marginTop: 8 }}>
          Loading…
        </Text>
      ) : mode === 'rated' && ranked.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🔒</Text>
          <Text style={[styles.emptyTitle, { color: palette.text1 }]}>No ratings revealed yet</Text>
          <Text style={[styles.emptySub, { color: palette.text2 }]}>
            Once a cycle is revealed, picks get ranked by the average score the club gave them.
          </Text>
        </Card>
      ) : (
        <>
          {ranked.map((row, i) => (
            <Row
              key={row.profile_id}
              row={row}
              rank={i + 1}
              mode={mode}
              isMe={row.profile_id === userId}
              onPress={() => openProfile(row.profile_id)}
            />
          ))}

          {unrated.length > 0 ? (
            <>
              <Text style={[styles.groupLabel, { color: palette.text3 }]}>NOT YET RATED</Text>
              {unrated.map((row) => (
                <Row
                  key={row.profile_id}
                  row={row}
                  rank={null}
                  mode={mode}
                  isMe={row.profile_id === userId}
                  muted
                  onPress={() => openProfile(row.profile_id)}
                />
              ))}
            </>
          ) : null}
        </>
      )}

      {isAdmin ? (
        <Button
          title="⚙ Club settings"
          variant="ghost"
          onPress={() => router.push(`/club/${club.id}/settings`)}
          style={{ marginTop: 18 }}
        />
      ) : null}
      {!isOwner ? (
        <Button title="Leave club" variant="danger" onPress={leave} style={{ marginTop: 12 }} />
      ) : null}

      <InlineNote text="Tap a member to see their profile and featured tracks." />
    </Screen>
  );
}

function Row({
  row,
  rank,
  mode,
  isMe,
  muted = false,
  onPress,
}: {
  row: LeaderboardRow;
  rank: number | null;
  mode: Mode;
  isMe: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const stat = primaryStat(row, mode);
  const medal = rank !== null && rank <= 3 ? MEDALS[rank - 1] : null;
  const podium = medal !== null;

  return (
    <Pressable onPress={onPress}>
      <Card
        style={{
          marginBottom: 8,
          ...(isMe ? { borderColor: palette.teal } : {}),
          ...(podium ? { backgroundColor: palette.tealBg } : {}),
          ...(muted ? { opacity: 0.6 } : {}),
        }}
      >
        <View style={styles.row}>
          <View style={styles.rankBox}>
            {medal ? (
              <Text style={{ fontSize: 20 }}>{medal}</Text>
            ) : (
              <Text style={[styles.rankNum, { color: palette.text3 }]}>
                {rank !== null ? rank : '–'}
              </Text>
            )}
          </View>
          <Avatar
            name={row.display_name}
            colorIndex={row.avatar_color}
            imageUrl={row.avatar_url}
            size={40}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameLine}>
              <Text style={[styles.name, { color: palette.text1 }]} numberOfLines={1}>
                {row.display_name ?? '(no name yet)'}
              </Text>
              {isMe ? <Text style={[styles.you, { color: palette.teal }]}>· you</Text> : null}
              {row.role !== 'member' ? (
                <Badge
                  text={row.role}
                  color={row.role === 'owner' ? palette.teal : palette.purple}
                  bg={row.role === 'owner' ? palette.tealBg : palette.purpleBg}
                />
              ) : null}
            </View>
            <Text style={[styles.meta, { color: palette.text3 }]} numberOfLines={1}>
              {secondaryLine(row, mode)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: palette.text1 }]}>{stat.value}</Text>
            <Text style={[styles.statUnit, { color: palette.text3 }]}>{stat.unit}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: 14,
  },
  segBtn: { flex: 1 },
  segInner: {
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segText: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBox: { width: 24, alignItems: 'center' },
  rankNum: { fontFamily: fonts.monoMedium, fontSize: 13 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: fonts.sansBold, fontSize: 14, flexShrink: 1 },
  you: { fontFamily: fonts.monoMedium, fontSize: 10 },
  meta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 3 },
  statBox: { alignItems: 'flex-end', minWidth: 42 },
  statValue: { fontFamily: fonts.sansBold, fontSize: 18 },
  statUnit: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.5, marginTop: 1 },
  groupLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2, marginTop: 14, marginBottom: 8 },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 6 },
  emptySub: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 280 },
});
