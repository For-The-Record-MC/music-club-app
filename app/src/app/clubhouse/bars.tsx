import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, Button, Card, InlineNote, Label, ListenButton, ListenLinks, Loading, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useBestBars, type BarRow } from '@/hooks/useBestBars';
import { useClubData } from '@/hooks/useClubData';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import { openLyrics } from '@/utils/genius';
import { searchSongs as searchItunes } from '@/utils/itunes';
import { memberName } from '@/utils/memberName';
import { searchSongs as searchSpotify } from '@/utils/spotify';
import { activity, bestBars } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

interface SongPick {
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  appleUrl: string | null;
}

// Map a 1–10 score to red→orange→yellow→green so a rating reads at a glance.
function scoreColor(n: number): string {
  if (n <= 2) return '#e5484d';
  if (n <= 4) return '#f76b15';
  if (n <= 6) return '#f5d90a';
  if (n <= 8) return '#9bd227';
  return '#46c26a';
}

export default function BestBarsScreen() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { bars, loading, refresh } = useBestBars(id);
  const { members } = useClubData(id);
  const { refreshing, onRefresh } = useRefresh(refresh);
  const { focus, scrollRef, onItemLayout } = useFocusTarget();

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

  const [open, setOpen] = useState(false);
  const [song, setSong] = useState<SongPick | null>(null);
  const [lyric, setLyric] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!id || !userId || !song || !lyric.trim()) {
      setError('Pick a song and type the bar.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await bestBars.create(id, userId, song, lyric);
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? 'Could not post.');
      return;
    }
    await activity.publish(id, 'best_bar', {
      bar_id: data.id,
      title: song.title,
      snippet: lyric.trim().replace(/\s+/g, ' ').slice(0, 80),
    });
    setBusy(false);
    setSong(null);
    setLyric('');
    setOpen(false);
    refresh();
  };

  if (!id) return <NoClubSelected what="best bars" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing} scrollRef={scrollRef}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>THE LINES THAT GO TOO HARD</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎤 Best Bars</Text>
        </View>
      </View>

      {loading ? <Loading /> : (
      <>
      {!open ? (
        <Button title="+ Drop a bar" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <Label>The song</Label>
          {song ? (
            <View style={styles.pickedRow}>
              {song.artworkUrl ? <Image source={{ uri: song.artworkUrl }} style={styles.art} contentFit="cover" /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{song.title}</Text>
                <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text2 }]}>{song.artist}</Text>
              </View>
              <Pressable onPress={() => setSong(null)} hitSlop={8}>
                <Text style={{ color: palette.text3, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
          ) : (
            <SongSearch onPick={setSong} />
          )}

          {song ? (
            <>
              <View style={styles.lyricsRow}>
                <Pressable
                  onPress={() => openLyrics(song.artist, song.title)}
                  style={[styles.lyricsBtn, { backgroundColor: palette.amberBg, borderColor: palette.amber }]}
                >
                  <Text style={[styles.lyricsBtnText, { color: palette.amber }]}>Lyrics ↗</Text>
                </Pressable>
              </View>
              <View style={{ marginTop: 12 }}>
                <Label>The bar</Label>
              </View>
              <TextField
                placeholder="Paste or type the lyric…"
                value={lyric}
                onChangeText={setLyric}
                multiline
                maxLength={500}
                style={{ minHeight: 70, textAlignVertical: 'top' }}
              />
            </>
          ) : null}

          <View style={{ gap: 8, marginTop: 12 }}>
            <Button title="Post bar" onPress={submit} loading={busy} disabled={!song || !lyric.trim()} />
            <Button title="Cancel" variant="ghost" onPress={() => { setOpen(false); setSong(null); setLyric(''); setError(null); }} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {bars.length === 0 ? (
        <InlineNote text="No bars yet — drop the lyric that lives in your head rent-free." />
      ) : (
        bars.map((bar) => (
          <View key={bar.id} onLayout={onItemLayout(bar.id)}>
            <BarCard bar={bar} userId={userId} onChange={refresh} highlight={bar.id === focus} mentionMembers={mentionMembers} />
          </View>
        ))
      )}
      </>
      )}
    </Screen>
  );
}

function SongSearch({ onPick }: { onPick: (s: SongPick) => void }) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongPick[]>([]);
  const seq = useRef(0);

  const run = async (term: string) => {
    setQuery(term);
    const s = ++seq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const spotify = await searchSpotify(term);
    const mapped: SongPick[] = spotify.length
      ? spotify.map((t) => ({ title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl || null, spotifyUrl: t.spotifyUrl || null, appleUrl: null }))
      : (await searchItunes(term)).map((t) => ({ title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl || null, spotifyUrl: null, appleUrl: t.appleUrl || null }));
    if (s === seq.current) setResults(mapped);
  };

  return (
    <View style={{ marginTop: 8 }}>
      <TextField placeholder="Search a song…" value={query} onChangeText={run} autoCorrect={false} />
      {results.map((t, i) => (
        <Pressable key={`${t.title}-${i}`} onPress={() => { onPick(t); setQuery(''); setResults([]); }} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}>
          {t.artworkUrl ? <Image source={{ uri: t.artworkUrl }} style={styles.art} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{t.title}</Text>
            <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text2 }]}>{t.artist}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function BarCard({
  bar,
  userId,
  onChange,
  highlight,
  mentionMembers,
}: {
  bar: BarRow;
  userId: string | null;
  onChange: () => void;
  highlight: boolean;
  mentionMembers: MentionMember[];
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const glow = useGlow(highlight);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentRows, setCommentRows] = useState<
    { id: string; text: string; author_id: string; profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null }[]
  >([]);

  const canDelete = bar.author_id === userId;
  const commentCount = bar.best_bar_comments?.[0]?.count ?? 0;
  const myScore = bar.best_bar_ratings.find((r) => r.profile_id === userId)?.score ?? null;
  const ratingCount = bar.best_bar_ratings.length;
  const avg = ratingCount > 0 ? bar.best_bar_ratings.reduce((t, r) => t + r.score, 0) / ratingCount : null;

  const rate = async (score: number) => {
    if (!userId) return;
    if (myScore === score) await bestBars.clearRating(bar.id, userId);
    else await bestBars.setRating(bar.id, userId, score);
    onChange();
  };

  const loadComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) {
      const { data } = await bestBars.listComments(bar.id);
      setCommentRows((data ?? []) as typeof commentRows);
    }
  };

  const addComment = async () => {
    if (!userId || !commentText.trim()) return;
    const text = commentText;
    await bestBars.addComment(bar.id, userId, text);
    setCommentText('');
    const { data } = await bestBars.listComments(bar.id);
    setCommentRows((data ?? []) as typeof commentRows);
    onChange();
    const tagged = resolveMentions(text, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(bar.club_id, tagged, {
          context: 'bar',
          bar_id: bar.id,
          snippet: text.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
  };

  const deleteBar = async () => {
    if (await confirmAsync('Delete bar', 'Remove this bar?')) {
      await bestBars.remove(bar.id);
      onChange();
    }
  };

  return (
    <Card style={glow ? { borderColor: palette.amber } : undefined}>
      <View style={styles.head}>
        <Pressable onPress={() => router.push(`/club/${bar.club_id}/member/${bar.author_id}`)} style={styles.headAuthor} hitSlop={4}>
          <Avatar name={bar.profiles?.display_name ?? null} colorIndex={bar.profiles?.avatar_color ?? 0} imageUrl={bar.profiles?.avatar_url} size={28} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.author, { color: palette.text1 }]}>{memberName(bar.profiles?.display_name, bar.profiles?.email)}</Text>
            <Text style={[styles.time, { color: palette.text3 }]}>{timeAgo(bar.created_at)}</Text>
          </View>
        </Pressable>
        {canDelete ? (
          <Pressable onPress={deleteBar} hitSlop={6}>
            <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.lyric, { color: palette.text1 }]}>“{bar.lyric}”</Text>

      <View style={styles.songRow}>
        {bar.artwork_url ? <Image source={{ uri: bar.artwork_url }} style={styles.artSm} contentFit="cover" /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text2 }]}>{bar.title}</Text>
          {bar.artist ? <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text3 }]}>{bar.artist}</Text> : null}
        </View>
        <ListenButton apple={bar.apple_url} spotify={bar.spotify_url} />
        <Pressable
          onPress={() => openLyrics(bar.artist, bar.title)}
          style={[styles.lyricsBtn, { backgroundColor: palette.amberBg, borderColor: palette.amber }]}
        >
          <Text style={[styles.lyricsBtnText, { color: palette.amber }]}>Lyrics ↗</Text>
        </Pressable>
      </View>
      <ListenLinks apple={bar.apple_url} spotify={bar.spotify_url} other={null} style={{ marginTop: 8 }} />

      <View style={styles.rateHeader}>
        <Text style={[styles.rateLabel, { color: palette.text3 }]}>HOW HARD DOES IT GO?</Text>
        {avg != null ? (
          <Text style={[styles.avg, { color: scoreColor(Math.round(avg)) }]}>
            {avg.toFixed(1)} · {ratingCount} rating{ratingCount === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>
      <View style={styles.scaleRow}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const mine = myScore === n;
          return (
            <Pressable
              key={n}
              onPress={() => rate(n)}
              style={[
                styles.scoreBtn,
                { borderColor: palette.border },
                mine && { borderColor: scoreColor(n), backgroundColor: scoreColor(n) },
              ]}
            >
              <Text style={[styles.scoreText, { color: mine ? '#fff' : palette.text2 }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={loadComments} style={styles.commentToggle}>
        <Text style={[styles.commentToggleText, { color: palette.text3 }]}>
          💬 {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Comment'}
        </Text>
      </Pressable>

      {showComments ? (
        <View style={[styles.commentSection, { borderTopColor: palette.border }]}>
          {commentRows.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Pressable onPress={() => router.push(`/club/${bar.club_id}/member/${c.author_id}`)} hitSlop={4}>
                <Avatar name={c.profiles?.display_name ?? null} colorIndex={c.profiles?.avatar_color ?? 0} imageUrl={c.profiles?.avatar_url} size={24} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.commentAuthor, { color: palette.text1 }]}>{memberName(c.profiles?.display_name, c.profiles?.email)}</Text>
                <MentionText text={c.text} members={mentionMembers} style={[styles.commentText, { color: palette.text1 }]} />
              </View>
            </View>
          ))}
          <View style={styles.commentForm}>
            <MentionInput placeholder="Add a comment… (@ to tag)" value={commentText} onChangeText={setCommentText} members={mentionMembers} onSubmitEditing={addComment} />
            <Button title="Post" onPress={addComment} disabled={!commentText.trim()} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, marginTop: 8, borderRadius: radius.md },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  art: { width: 40, height: 40, borderRadius: radius.sm },
  artSm: { width: 32, height: 32, borderRadius: radius.sm },
  sTitle: { fontFamily: fonts.sansBold, fontSize: 13 },
  sArtist: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1 },
  lyricsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10 },
  lyricsBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 6, paddingHorizontal: 14 },
  lyricsBtnText: { fontFamily: fonts.sansBold, fontSize: 13 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  headAuthor: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  author: { fontFamily: fonts.sansBold, fontSize: 13 },
  time: { fontFamily: fonts.mono, fontSize: 10 },
  lyric: { fontFamily: fonts.sansBold, fontSize: 18, lineHeight: 26, marginBottom: 14 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  rateLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5 },
  avg: { fontFamily: fonts.sansBold, fontSize: 12 },
  scaleRow: { flexDirection: 'row', gap: 4 },
  scoreBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  scoreText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  commentToggle: { marginTop: 14, paddingVertical: 4 },
  commentToggleText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 10, gap: 10 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAuthor: { fontFamily: fonts.sansBold, fontSize: 11, marginBottom: 1 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
