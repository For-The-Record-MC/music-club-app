import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { Palette } from '@/theme';
import { fonts, radius } from '@/theme';

// A plain-language tour of the Studio's rooms — reached from the "?" in the
// Studio header. Mirrors the room names + what each is for.
type Accent = 'teal' | 'purple' | 'coral' | 'amber' | 'blue';

const accentFg = (p: Palette, a: Accent) => p[a];
const accentBg = (p: Palette, a: Accent) =>
  p[`${a}Bg` as 'tealBg' | 'purpleBg' | 'coralBg' | 'amberBg' | 'blueBg'];

const ROOMS: { emoji: string; image?: number; title: string; body: string; accent: Accent }[] = [
  {
    emoji: '📻',
    title: 'Club Radio',
    body: "Share what you're spinning — a song or an album — then react and comment on what everyone else is playing. The most-loved track gets spotlighted on Home.",
    accent: 'teal',
  },
  {
    emoji: '💿',
    title: 'The Queue',
    body: 'The album backlog. Suggest records the club should hear next; the picker draws from here when it’s their turn to choose.',
    accent: 'amber',
  },
  {
    emoji: '🎵',
    image: require('../../../assets/images/jukebox.png'),
    title: 'Jukebox Showdown',
    body: 'A themed song battle each cycle. Submit one song for the theme, then spend 2 upvotes and a downvote on the rest. Votes stay blind until the meeting, when a winner is crowned.',
    accent: 'purple',
  },
  {
    emoji: '🎶',
    title: 'The Perfect Playlist',
    body: 'One collaborative playlist per cycle built around a vibe — Roadtrip, Beach Day, Summer BBQ. The picker sets the theme and seed; everyone adds up to three songs. It syncs straight to Spotify.',
    accent: 'blue',
  },
  {
    emoji: '🎚️',
    title: 'Aux Battle',
    body: "Each cycle you're paired with another member and handed a theme. You each submit a song — hidden until you post yours — then everyone votes on the other matchups. Wins show on your profile.",
    accent: 'coral',
  },
  {
    emoji: '🔥',
    title: 'Mic Droppers',
    body: 'Hot takes on music. Drop an opinion and watch the club land on a 5-point agree↔disagree scale — the more divisive the split, the better.',
    accent: 'purple',
  },
  {
    emoji: '🎤',
    title: 'Best Bars',
    body: 'Shout out the lyric that lives in your head rent-free. Pin the song, drop the bar, and let the club rate how hard it goes from 1 to 10.',
    accent: 'blue',
  },
  {
    emoji: '🎯',
    title: 'Change My Tune',
    body: 'Put the club on to an artist. Pick three starter tracks, make your pitch, and tag whoever you think will be into it — they can hear you out and mark themselves Converted.',
    accent: 'teal',
  },
  {
    emoji: '🏆',
    title: 'Track Madness',
    body: "One artist's biggest songs, seeded into a tournament. Fill out your own bracket matchup by matchup (listen links included) and crown a champion — then see who the club's champion is once everyone's in.",
    accent: 'amber',
  },
  {
    emoji: '🎱',
    image: require('../../../assets/images/bingo.jpg'),
    title: 'Listening Bingo',
    body: 'A random 5x5 card of music categories, three qualifying lines, and one rule: you have to actually listen. Fill boxes with songs, let the timer run, and call BINGO — a teammate has to verify your line before it counts.',
    accent: 'coral',
  },
];

export default function StudioGuide() {
  const { palette } = useTheme();
  const router = useRouter();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={close} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: palette.tealBg, borderColor: palette.teal }]}>
        <Text style={styles.heroEmoji}>🎛️</Text>
        <Text style={[styles.heroTitle, { color: palette.text1 }]}>Welcome to the Studio</Text>
        <Text style={[styles.heroSub, { color: palette.text2 }]}>
          The Studio is where the club hangs out between meetings. Each tile is its own
          little room — here's what they're for. 👇
        </Text>
      </View>

      <Text style={[styles.sectionLabel, { color: palette.teal }]}>THE ROOMS</Text>
      {ROOMS.map((r) => (
        <View key={r.title} style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={[styles.chip, { backgroundColor: accentBg(palette, r.accent) }]}>
            {r.image ? (
              <Image source={r.image} style={styles.chipImage} contentFit="contain" />
            ) : (
              <Text style={styles.chipEmoji}>{r.emoji}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.cardTitle, { color: accentFg(palette, r.accent) }]}>{r.title}</Text>
            <Text style={[styles.cardText, { color: palette.text2 }]}>{r.body}</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.footer, { color: palette.text3 }]}>
        Jump into whichever room's calling your name. 🎶
      </Text>

      <Button title="Got it" onPress={close} style={{ marginTop: 6 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { marginBottom: 8 },
  back: { fontFamily: fonts.sansBold, fontSize: 22 },
  hero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 22,
  },
  heroEmoji: { fontSize: 46, marginBottom: 10 },
  heroTitle: { fontFamily: fonts.sansBold, fontSize: 24, marginBottom: 8, textAlign: 'center' },
  heroSub: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  sectionLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  chip: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipEmoji: { fontSize: 22 },
  chipImage: { width: 26, height: 26 },
  cardTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 4 },
  cardText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  footer: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 4,
  },
});
