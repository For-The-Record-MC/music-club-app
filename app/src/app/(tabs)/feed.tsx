import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NoClubSelected, Screen } from '@/components/ui';
import { useClubhouseStatus, type TileStatus } from '@/hooks/useClubhouseStatus';
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

  if (!id) return <NoClubSelected what="clubhouse" />;

  const tiles: Tile[] = [
    { key: 'feed', emoji: '🎧', name: 'The Feed', accent: 'teal', href: '/clubhouse/activity', status: status.feed },
    { key: 'showdown', emoji: '🎵', name: 'Jukebox Showdown', accent: 'purple', href: '/clubhouse/showdown', status: status.showdown },
    { key: 'takes', emoji: '🔥', name: 'Musical Takes', accent: 'coral', href: '/clubhouse/takes', status: status.takes },
    { key: 'playlist', emoji: '🎶', name: 'The Perfect Playlist', accent: 'blue', href: '/clubhouse/playlist', status: status.playlist },
    { key: 'aux', emoji: '🎚️', name: 'Aux Battle', accent: 'amber', href: '/clubhouse/aux', status: status.aux },
    { key: 'convince', emoji: '🎯', name: 'Convince Me', accent: 'teal', href: '/clubhouse/convince', status: status.convince },
  ];

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHERE THE CLUB HANGS OUT</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>🎪 Clubhouse</Text>
      </View>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 14,
    minHeight: 124,
    justifyContent: 'space-between',
  },
  tileTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  emojiWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
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
  tileName: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 3 },
  tileStatus: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.3 },
});
