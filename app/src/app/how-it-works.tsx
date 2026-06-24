import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { Palette } from '@/theme';
import { fonts, radius } from '@/theme';
import { useOnboardingStore } from '@/stores/onboardingStore';

// A friendly, plain-language tour of how a listening club actually works —
// reachable from the account menu and auto-shown once to new members. The copy
// mirrors the real mechanics: the wheel, two album picks, sealed ratings, the
// 👑 favorite vote, the reveal at the meeting, then close → playlists → respin.

type Accent = 'teal' | 'purple' | 'coral' | 'amber' | 'blue';

const accentFg = (p: Palette, a: Accent) => p[a];
const accentBg = (p: Palette, a: Accent) =>
  p[`${a}Bg` as 'tealBg' | 'purpleBg' | 'coralBg' | 'amberBg' | 'blueBg'];

// The heart of the app: one cycle, start to finish.
const CYCLE_STEPS: { emoji: string; title: string; body: string }[] = [
  {
    emoji: '🎡',
    title: 'Spin the wheel',
    body: 'An admin spins to pick who chooses this round. Everyone gets their turn over time.',
  },
  {
    emoji: '💿',
    title: 'The picker chooses two albums',
    body: 'Whoever the wheel lands on picks two albums for the whole club to listen to.',
  },
  {
    emoji: '🎧',
    title: 'Everybody listens',
    body: 'Take the week to sit with both records. Open an album for the tracklist and listen links.',
  },
  {
    emoji: '⭐',
    title: 'Rate, review & crown a favorite',
    body: 'Score each album, jot a review, and crown your favorite of the two. It all stays sealed until the meeting.',
  },
  {
    emoji: '🎙️',
    title: 'Meet up & reveal',
    body: "At the meeting, an admin hits Reveal and everyone's scores, reviews, and picks unlock at once.",
  },
  {
    emoji: '🎶',
    title: 'Close it out',
    body: 'Closing the cycle builds a highlights playlist, adds the best tracks to your all-time favorites, and unlocks the wheel for the next spin.',
  },
];

const FEATURES: { emoji: string; title: string; body: string; accent: Accent }[] = [
  {
    emoji: '⭐',
    title: 'Ratings & reviews',
    body: "Give each album a score and write what you thought. Nobody sees anyone else's until the reveal — so first impressions stay honest.",
    accent: 'amber',
  },
  {
    emoji: '👑',
    title: 'The favorite vote',
    body: 'Tap a crown to mark which of the two albums you liked best. The tally is sealed until the reveal, then you see how the club split.',
    accent: 'purple',
  },
  {
    emoji: '📝',
    title: 'Song notes',
    body: 'Keep private, track-by-track notes as you listen — your own little journal. Unlike ratings, notes stay editable across every cycle.',
    accent: 'blue',
  },
  {
    emoji: '💬',
    title: 'The feed',
    body: "Share songs you're loving, drop a thought, and react to what others post. The most-loved track gets spotlighted on the home screen.",
    accent: 'teal',
  },
  {
    emoji: '🎵',
    title: 'Jukebox Showdown',
    body: 'Each cycle has a fun theme — like “Songs with colors in the title.” Submit one song, then spend 2 upvotes and a downvote on the rest. Votes stay blind until the meeting, when a winner is crowned.',
    accent: 'purple',
  },
  {
    emoji: '🎫',
    title: 'Concerts',
    body: "Post shows the group might want to catch and RSVP so everyone knows who's in. Add them straight to your calendar.",
    accent: 'coral',
  },
  {
    emoji: '🎶',
    title: 'Playlists',
    body: 'Each cycle gets a highlights playlist, and the club builds an ever-growing all-time favorites list. Connect Spotify to listen in one tap.',
    accent: 'teal',
  },
  {
    emoji: '📜',
    title: 'History',
    body: 'Every closed cycle is saved with its scores, the crowned album, and its highlights — a running record of everything the club has heard.',
    accent: 'purple',
  },
  {
    emoji: '🔔',
    title: 'Activity',
    body: 'The bell at the top of Home keeps you caught up — new picks, reveals, RSVPs, and feed buzz, all in one place.',
    accent: 'blue',
  },
];

export default function HowItWorks() {
  const { palette } = useTheme();
  const router = useRouter();
  const markSeen = useOnboardingStore((s) => s.markSeen);

  const close = () => {
    markSeen();
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

      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: palette.tealBg, borderColor: palette.teal }]}>
        <Text style={styles.heroEmoji}>🍷</Text>
        <Text style={[styles.heroTitle, { color: palette.text1 }]}>Welcome to the club</Text>
        <Text style={[styles.heroSub, { color: palette.text2 }]}>
          Here's the whole rhythm: pick albums, listen, rate them in secret, then
          gather to reveal what everyone really thought. Short version below. 👇
        </Text>
      </View>

      {/* The cycle flow */}
      <Text style={[styles.sectionLabel, { color: palette.teal }]}>HOW A CYCLE WORKS</Text>
      <View style={[styles.flowCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
        {CYCLE_STEPS.map((step, i) => (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepRail}>
              <View style={[styles.stepDot, { backgroundColor: palette.tealBg, borderColor: palette.teal }]}>
                <Text style={[styles.stepNum, { color: palette.teal }]}>{i + 1}</Text>
              </View>
              {i < CYCLE_STEPS.length - 1 ? (
                <View style={[styles.stepLine, { backgroundColor: palette.border2 }]} />
              ) : null}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepTitle, { color: palette.text1 }]}>
                {step.emoji}  {step.title}
              </Text>
              <Text style={[styles.stepText, { color: palette.text2 }]}>{step.body}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Feature cards */}
      <Text style={[styles.sectionLabel, { color: palette.teal }]}>THE BITS THAT MAKE IT FUN</Text>
      {FEATURES.map((f) => (
        <View key={f.title} style={[styles.featureCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={[styles.featureChip, { backgroundColor: accentBg(palette, f.accent) }]}>
            <Text style={styles.featureEmoji}>{f.emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.featureTitle, { color: accentFg(palette, f.accent) }]}>{f.title}</Text>
            <Text style={[styles.featureText, { color: palette.text2 }]}>{f.body}</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.footer, { color: palette.text3 }]}>
        That's it — the rest you'll pick up as you go. Pour something nice and press play. 🎶
      </Text>

      <Button title="Got it — let's listen" onPress={close} style={{ marginTop: 6 }} />
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
  flowCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 26,
  },
  step: { flexDirection: 'row', gap: 14 },
  stepRail: { alignItems: 'center', width: 32 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontFamily: fonts.monoMedium, fontSize: 13 },
  stepLine: { width: StyleSheet.hairlineWidth, flex: 1, marginVertical: 4 },
  stepBody: { flex: 1, paddingBottom: 18 },
  stepTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 3, marginTop: 4 },
  stepText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  featureChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureEmoji: { fontSize: 22 },
  featureTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 4 },
  featureText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  footer: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 4,
  },
});
