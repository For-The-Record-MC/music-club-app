import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Loading, NoClubSelected, Screen } from '@/components/ui';
import { useClubhouseStatus, type TileStatus } from '@/hooks/useClubhouseStatus';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts, radius } from '@/theme';

// The Clubhouse hub — the landing for the club's interaction rooms. A tiled grid
// fronting the activity Feed, Jukebox Showdown, and (as they ship) the newer
// rooms. Each tile carries a live status line so the hub doubles as a dashboard.
type Accent = 'teal' | 'purple' | 'coral' | 'blue' | 'amber';

interface Tile {
  key: string;
  emoji: string;
  name: string;
  accent: Accent;
  href?: Href; // present = live room; absent = not yet shipped ("Soon")
  status?: TileStatus;
}

export default function Clubhouse() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const status = useClubhouseStatus(id);
  const { refreshing, onRefresh } = useRefresh(status.refresh);

  if (!id) return <NoClubSelected what="clubhouse" />;

  const tiles: Tile[] = [
    { key: 'feed', emoji: '📻', name: 'Club Radio', accent: 'teal', href: '/clubhouse/activity', status: status.feed },
    { key: 'queue', emoji: '💿', name: 'The Queue', accent: 'amber', href: { pathname: '/club/[id]/suggestions', params: { id } }, status: status.queue },
    { key: 'showdown', emoji: '🎵', name: 'Jukebox Showdown', accent: 'purple', href: '/clubhouse/showdown', status: status.showdown },
    { key: 'playlist', emoji: '🎶', name: 'The Perfect Playlist', accent: 'blue', href: '/clubhouse/playlist', status: status.playlist },
    { key: 'aux', emoji: '🎚️', name: 'Aux Battle', accent: 'coral', href: '/clubhouse/aux', status: status.aux },
    { key: 'takes', emoji: '🔥', name: 'Mic Droppers', accent: 'purple', href: '/clubhouse/takes', status: status.takes },
    { key: 'bars', emoji: '🎤', name: 'Best Bars', accent: 'blue', href: '/clubhouse/bars', status: status.bars },
    { key: 'convince', emoji: '🎯', name: 'Change My Tune', accent: 'teal', href: '/clubhouse/convince', status: status.convince },
    { key: 'madness', emoji: '🏆', name: 'Track Madness', accent: 'amber', href: '/clubhouse/madness', status: status.madness },
  ];

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHERE THE CLUB MAKES NOISE</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎛️ The Studio</Text>
        </View>
        <Pressable
          onPress={() => router.push('/clubhouse/guide')}
          hitSlop={8}
          accessibilityLabel="What does each room do?"
          style={({ pressed }) => [
            styles.help,
            { borderColor: palette.border, backgroundColor: palette.card },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.helpText, { color: palette.text2 }]}>?</Text>
        </Pressable>
      </View>

      {status.loading ? (
        <Loading />
      ) : (
      <View style={styles.grid}>
        {tiles.map((t) => {
          const accent = palette[t.accent];
          const accentBg = palette[`${t.accent}Bg` as const];
          const live = !!t.href;
          return (
            <Pressable
              key={t.key}
              onPress={live ? () => router.push(t.href!) : undefined}
              disabled={!live}
              style={({ pressed }) => [
                styles.tile,
                { backgroundColor: palette.card, borderColor: palette.border },
                live && pressed && { opacity: 0.85, borderColor: accent },
                !live && { opacity: 0.6 },
              ]}
            >
              <View style={styles.tileTop}>
                <View style={[styles.emojiWrap, { backgroundColor: accentBg }]}>
                  <Text style={styles.emoji}>{t.emoji}</Text>
                </View>
                {t.status?.flag ? <View style={[styles.dot, { backgroundColor: accent }]} /> : null}
                {!live ? (
                  <Text style={[styles.soon, { color: palette.text3, borderColor: palette.border }]}>SOON</Text>
                ) : null}
              </View>
              <Text style={[styles.tileName, { color: palette.text1 }]} numberOfLines={2}>
                {t.name}
              </Text>
              <Text style={[styles.tileStatus, { color: live ? accent : palette.text3 }]} numberOfLines={1}>
                {live ? t.status?.line ?? '' : 'Coming soon'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 22 },
  help: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: { fontFamily: fonts.sansBold, fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 10,
    minHeight: 92,
    justifyContent: 'space-between',
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  emojiWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 15 },
  dot: { width: 9, height: 9, borderRadius: 5, marginLeft: 'auto' },
  soon: {
    marginLeft: 'auto',
    fontFamily: fonts.monoMedium,
    fontSize: 8,
    letterSpacing: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  tileName: { fontFamily: fonts.sansBold, fontSize: 13, marginBottom: 2 },
  tileStatus: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.3 },
});
