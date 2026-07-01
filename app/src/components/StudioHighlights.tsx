import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';

import { Card, Label } from '@/components/ui';
import { useAuxBattle } from '@/hooks/useAuxBattle';
import { useBestBars } from '@/hooks/useBestBars';
import { useCycle } from '@/hooks/useCycle';
import { useFeed, type FeedRow } from '@/hooks/useFeed';
import { useMusicalTakes } from '@/hooks/useMusicalTakes';
import { usePerfectPlaylist } from '@/hooks/usePerfectPlaylist';
import { useShowdown } from '@/hooks/useShowdown';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { memberName } from '@/utils/memberName';
import type { Palette } from '@/theme';
import { fonts, radius } from '@/theme';

// A single swipeable Studio surface for Home: one highlight card per active
// room (Club Radio, Showdown, Aux Battle, Perfect Playlist, Best Bars, Mic
// Droppers). Only rooms with something to show appear; each card taps into its
// room. Replaces the old separate Showdown + "from the feed" home cards.

type Accent = 'teal' | 'purple' | 'coral' | 'amber' | 'blue';
const accentFg = (p: Palette, a: Accent) => p[a];
const accentBg = (p: Palette, a: Accent) =>
  p[`${a}Bg` as 'tealBg' | 'purpleBg' | 'coralBg' | 'amberBg' | 'blueBg'];

interface Highlight {
  key: string;
  accent: Accent;
  emoji: string;
  room: string;
  onPress: () => void;
  body: ReactNode;
}

// ── Club Radio: the featured (most-loved) track this cycle ──────────────────
const POSITIVE_EMOJIS = ['👍', '❤️', '🔥', '😂'];
function pickFeaturedSong(posts: FeedRow[]): FeedRow | null {
  const tracks = posts.filter((p) => p.kind === 'track');
  if (tracks.length === 0) return null;
  const score = (p: FeedRow) => p.post_reactions.filter((r) => POSITIVE_EMOJIS.includes(r.emoji)).length;
  const max = Math.max(...tracks.map(score));
  const leaders = tracks.filter((p) => score(p) === max);
  if (max > 0 && leaders.length === 1) return leaders[0];
  return tracks[0];
}
function artworkOf(post: FeedRow): string | null {
  return (post.metadata as { artwork?: string } | null)?.artwork ?? null;
}
function featuredMeta(post: FeedRow): string {
  const n = post.post_reactions.filter((r) => POSITIVE_EMOJIS.includes(r.emoji)).length;
  return n > 0 ? `MOST LOVED · ${n} reaction${n === 1 ? '' : 's'}` : 'RECENTLY SHARED';
}

export function StudioHighlights({ clubId, cycleId }: { clubId: string; cycleId: string }) {
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle } = useCycle(clubId);
  const { posts } = useFeed(clubId);
  const { view: showdown } = useShowdown(cycleId);
  const { battles } = useAuxBattle(cycleId);
  const { playlist } = usePerfectPlaylist(cycleId);
  const { bars } = useBestBars(clubId);
  const { takes } = useMusicalTakes(clubId);

  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);

  const highlights = useMemo<Highlight[]>(() => {
    const out: Highlight[] = [];

    // Club Radio — featured track from this cycle.
    const start = cycle ? new Date(cycle.created_at).getTime() : 0;
    const thisCycle = posts.filter((p) => new Date(p.created_at).getTime() >= start);
    const featured = pickFeaturedSong(thisCycle);
    if (featured) {
      out.push({
        key: 'radio',
        accent: 'teal',
        emoji: '📻',
        room: 'CLUB RADIO',
        onPress: () => router.push({ pathname: '/clubhouse/activity', params: { focus: String(featured.id) } }),
        body: (
          <View style={styles.songRow}>
            {artworkOf(featured) ? (
              <Image source={{ uri: artworkOf(featured)! }} style={styles.art} contentFit="cover" />
            ) : (
              <View style={[styles.art, styles.artFallback, { backgroundColor: palette.tealBg }]}>
                <Text style={{ fontSize: 20 }}>🎵</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.metaLine, { color: palette.teal }]}>{featuredMeta(featured)}</Text>
              <Text numberOfLines={1} style={[styles.bigTitle, { color: palette.text1 }]}>{featured.title}</Text>
              {featured.artist ? <Text numberOfLines={1} style={[styles.sub, { color: palette.text2 }]}>{featured.artist}</Text> : null}
            </View>
          </View>
        ),
      });
    }

    // Jukebox Showdown.
    if (showdown) {
      const sub = showdown.revealed
        ? 'Results are in — see who won'
        : `${showdown.submission_count} song${showdown.submission_count === 1 ? '' : 's'} in · submit & vote`;
      out.push({
        key: 'showdown',
        accent: 'purple',
        emoji: '🎵',
        room: 'JUKEBOX SHOWDOWN',
        onPress: () => router.push({ pathname: '/clubhouse/showdown' }),
        body: (
          <View>
            <Text numberOfLines={2} style={[styles.bigTitle, { color: palette.text1 }]}>“{showdown.theme_text}”</Text>
            <Text style={[styles.sub, { color: palette.text2 }]}>{sub}</Text>
          </View>
        ),
      });
    }

    // Aux Battle — your matchup, or a vote nudge.
    if (battles.length > 0) {
      const mine = battles.find((b) => b.member_a === userId || b.member_b === userId);
      const opp = mine ? (mine.member_a === userId ? mine.b : mine.a) : null;
      const line = mine
        ? `You vs ${memberName(opp?.display_name, opp?.email)} · ${mine.theme_text}`
        : `${battles.length} matchup${battles.length === 1 ? '' : 's'} — go vote`;
      out.push({
        key: 'aux',
        accent: 'coral',
        emoji: '🎚️',
        room: 'AUX BATTLE',
        onPress: () => router.push({ pathname: '/clubhouse/aux' }),
        body: <Text numberOfLines={3} style={[styles.bigTitle, { color: palette.text1 }]}>{line}</Text>,
      });
    }

    // Perfect Playlist.
    if (playlist) {
      const total = playlist.perfect_playlist_songs.length;
      const mineCount = playlist.perfect_playlist_songs.filter((s) => s.profile_id === userId).length;
      out.push({
        key: 'playlist',
        accent: 'blue',
        emoji: '🎶',
        room: 'THE PERFECT PLAYLIST',
        onPress: () => router.push({ pathname: '/clubhouse/playlist' }),
        body: (
          <View>
            <Text numberOfLines={1} style={[styles.bigTitle, { color: palette.text1 }]}>{playlist.theme_text}</Text>
            <Text style={[styles.sub, { color: palette.text2 }]}>
              {total} song{total === 1 ? '' : 's'} · {mineCount}/3 yours
            </Text>
          </View>
        ),
      });
    }

    // Best Bars — the highest-rated bar (fall back to newest).
    if (bars.length > 0) {
      const avg = (b: (typeof bars)[number]) =>
        b.best_bar_ratings.length ? b.best_bar_ratings.reduce((t, r) => t + r.score, 0) / b.best_bar_ratings.length : 0;
      const top = [...bars].sort((a, b) => avg(b) - avg(a))[0];
      out.push({
        key: 'bars',
        accent: 'amber',
        emoji: '🎤',
        room: 'BEST BARS',
        onPress: () => router.push({ pathname: '/clubhouse/bars', params: { focus: String(top.id) } }),
        body: (
          <View>
            <Text numberOfLines={2} style={[styles.bigTitle, { color: palette.text1 }]}>“{top.lyric}”</Text>
            <Text numberOfLines={1} style={[styles.sub, { color: palette.text2 }]}>{top.title}{top.artist ? ` · ${top.artist}` : ''}</Text>
          </View>
        ),
      });
    }

    // Mic Droppers — the most divisive take (fall back to newest).
    if (takes.length > 0) {
      const divisiveness = (t: (typeof takes)[number]) => {
        const agree = t.musical_take_positions.filter((p) => p.value > 0).length;
        const disagree = t.musical_take_positions.filter((p) => p.value < 0).length;
        return agree > 0 && disagree > 0 ? 1 - Math.abs(agree - disagree) / (agree + disagree) : 0;
      };
      const top = [...takes].sort((a, b) => divisiveness(b) - divisiveness(a))[0];
      out.push({
        key: 'takes',
        accent: 'purple',
        emoji: '🔥',
        room: 'MIC DROPPERS',
        onPress: () => router.push({ pathname: '/clubhouse/takes', params: { focus: String(top.id) } }),
        body: <Text numberOfLines={3} style={[styles.bigTitle, { color: palette.text1 }]}>“{top.body}”</Text>,
      });
    }

    return out;
  }, [cycle, posts, showdown, battles, playlist, bars, takes, userId, palette, router]);

  if (highlights.length === 0) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setActive(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <Label>In the Studio</Label>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
          >
            {highlights.map((h) => (
              <Pressable key={h.key} onPress={h.onPress} style={{ width }}>
                <Card style={{ minHeight: 118, justifyContent: 'center' }}>
                  <View style={styles.cardHead}>
                    <View style={[styles.chip, { backgroundColor: accentBg(palette, h.accent) }]}>
                      <Text style={styles.chipEmoji}>{h.emoji}</Text>
                    </View>
                    <Text style={[styles.room, { color: accentFg(palette, h.accent) }]}>{h.room}</Text>
                    <Text style={{ color: palette.text3 }}>›</Text>
                  </View>
                  {h.body}
                </Card>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      {highlights.length > 1 ? (
        <View style={styles.dots}>
          {highlights.map((h, i) => (
            <View
              key={h.key}
              style={[
                styles.dot,
                { backgroundColor: i === active ? accentFg(palette, h.accent) : palette.border2 },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  chip: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chipEmoji: { fontSize: 14 },
  room: { flex: 1, fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.5 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 48, height: 48, borderRadius: radius.sm },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  metaLine: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1, marginBottom: 3 },
  bigTitle: { fontFamily: fonts.sansBold, fontSize: 16, lineHeight: 22 },
  sub: { fontFamily: fonts.sans, fontSize: 12, marginTop: 3 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
