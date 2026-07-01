import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, Button, Card, InlineNote, Label, ListenLinks, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useConvince, type ConvinceRow } from '@/hooks/useConvince';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import { searchSongs as searchItunes } from '@/utils/itunes';
import { memberName } from '@/utils/memberName';
import { normKey } from '@/utils/normalize';
import { searchArtists, searchSongs as searchSpotify, type SpotifyArtist } from '@/utils/spotify';
import { activity, convince, type ConvinceTrackInput, type ConvinceVerdict } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

interface PickedArtist {
  name: string;
  imageUrl: string | null;
  ref: string | null;
}

export default function ConvinceMeScreen() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { posts, refresh } = useConvince(id);
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
  const targetCandidates = useMemo(() => mentionMembers.filter((m) => m.profile_id !== userId), [mentionMembers, userId]);

  const [open, setOpen] = useState(false);
  const [artist, setArtist] = useState<PickedArtist | null>(null);
  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<SpotifyArtist[]>([]);
  const artistSeq = useRef(0);
  const [tracks, setTracks] = useState<(ConvinceTrackInput | null)[]>([null, null, null]);
  const [blurb, setBlurb] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runArtistSearch = async (term: string) => {
    setArtistQuery(term);
    const seq = ++artistSeq.current;
    if (term.trim().length < 2) {
      setArtistResults([]);
      return;
    }
    const found = await searchArtists(term);
    if (seq === artistSeq.current) setArtistResults(found);
  };

  const pickArtist = (a: SpotifyArtist) => {
    setArtist({ name: a.name, imageUrl: a.imageUrl || null, ref: a.spotifyUrl || null });
    setArtistResults([]);
    setArtistQuery('');
  };

  const setTrack = (i: number, t: ConvinceTrackInput | null) =>
    setTracks((prev) => prev.map((x, idx) => (idx === i ? t : x)));

  const toggleTarget = (pid: string) =>
    setTargets((t) => (t.includes(pid) ? t.filter((x) => x !== pid) : [...t, pid]));

  const resetComposer = () => {
    setArtist(null);
    setArtistQuery('');
    setArtistResults([]);
    setTracks([null, null, null]);
    setBlurb('');
    setTargets([]);
    setError(null);
    setOpen(false);
  };

  const filledTracks = tracks.filter((t): t is ConvinceTrackInput => t !== null);
  const canPost = !!artist && filledTracks.length === 3 && blurb.trim().length > 0;

  const submit = async () => {
    if (!id || !userId || !artist || filledTracks.length !== 3 || !blurb.trim()) {
      setError('Pick an artist, 3 tracks, and write a pitch.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data: postId, error: err } = await convince.create(
      id,
      { name: artist.name, imageUrl: artist.imageUrl, ref: artist.ref },
      blurb,
      filledTracks,
      targets,
    );
    if (err) {
      setBusy(false);
      setError(err.message ?? 'Could not post.');
      return;
    }
    // The targeted push events are published server-side by the RPC; the bell's
    // mention notify is only for @-mentions in the blurb itself.
    const tagged = resolveMentions(blurb, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length && postId) {
      void activity
        .notifyMentions(id, tagged, { context: 'convince', post_id: String(postId), snippet: artist.name })
        .then(undefined, () => {});
    }
    setBusy(false);
    resetComposer();
    refresh();
  };

  if (!id) return <NoClubSelected what="convince" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing} scrollRef={scrollRef}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>SELL THE CLUB ON AN ARTIST</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎯 Change My Tune</Text>
        </View>
      </View>

      {!open ? (
        <Button title="+ Make your case" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <Label>The artist</Label>
          {artist ? (
            <View style={styles.pickedArtist}>
              {artist.imageUrl ? (
                <Image source={{ uri: artist.imageUrl }} style={styles.artistImg} contentFit="cover" />
              ) : (
                <View style={[styles.artistImg, styles.artistImgFallback, { backgroundColor: palette.tealBg }]}>
                  <Text style={{ fontSize: 18 }}>🎤</Text>
                </View>
              )}
              <Text style={[styles.pickedArtistName, { color: palette.text1 }]}>{artist.name}</Text>
              <Pressable onPress={() => setArtist(null)} hitSlop={8}>
                <Text style={{ color: palette.text3, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextField
                placeholder="Search an artist… (e.g. Phoebe Bridgers)"
                value={artistQuery}
                onChangeText={runArtistSearch}
                autoCorrect={false}
              />
              {artistResults.map((a) => (
                <Pressable key={a.id} onPress={() => pickArtist(a)} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}>
                  {a.imageUrl ? (
                    <Image source={{ uri: a.imageUrl }} style={styles.resultArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.resultArt, styles.artistImgFallback, { backgroundColor: palette.tealBg }]}>
                      <Text>🎤</Text>
                    </View>
                  )}
                  <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>{a.name}</Text>
                </Pressable>
              ))}
              {artistQuery.trim().length >= 2 ? (
                <Pressable
                  onPress={() => setArtist({ name: artistQuery.trim(), imageUrl: null, ref: null })}
                  style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}
                >
                  <View style={[styles.resultArt, styles.artistImgFallback, { backgroundColor: palette.tealBg }]}>
                    <Text>✏️</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text2 }]}>
                    Use “{artistQuery.trim()}”
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}

          <View style={{ marginTop: 14 }}>
            <Label>Three starter tracks</Label>
          </View>
          {[0, 1, 2].map((i) => (
            <TrackSlot key={i} index={i} value={tracks[i]} onChange={(t) => setTrack(i, t)} />
          ))}

          <View style={{ marginTop: 14 }}>
            <Label>Your pitch</Label>
          </View>
          <TextField
            placeholder="Why the club needs this artist in their life…"
            value={blurb}
            onChangeText={setBlurb}
            multiline
            maxLength={1000}
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />

          {targetCandidates.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.sharePickLabel, { color: palette.text3 }]}>WHO'S THIS FOR? (THEY GET A PING)</Text>
              <View style={styles.chips}>
                {targetCandidates.map((m) => {
                  const on = targets.includes(m.profile_id);
                  return (
                    <Pressable
                      key={m.profile_id}
                      onPress={() => toggleTarget(m.profile_id)}
                      style={[
                        styles.chip,
                        { borderColor: palette.border, backgroundColor: palette.card2 },
                        on && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                      ]}
                    >
                      <Avatar name={m.display_name} colorIndex={m.avatar_color} imageUrl={m.avatar_url} size={20} />
                      <Text numberOfLines={1} style={[styles.chipText, { color: on ? palette.teal : palette.text2 }]}>
                        {memberName(m.display_name, m.email)}
                      </Text>
                      {on ? <Text style={[styles.chipCheck, { color: palette.teal }]}>✓</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={{ gap: 8, marginTop: 14 }}>
            <Button title={targets.length > 0 ? `Post & ping ${targets.length}` : 'Post'} onPress={submit} loading={busy} disabled={!canPost} />
            <Button title="Cancel" variant="ghost" onPress={resetComposer} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {posts.length === 0 ? (
        <InlineNote text="No recs yet — put someone on to your favorite artist." />
      ) : (
        posts.map((post) => (
          <View key={post.id} onLayout={onItemLayout(post.id)}>
            <ConvinceCard post={post} userId={userId} onChange={refresh} highlight={post.id === focus} mentionMembers={mentionMembers} />
          </View>
        ))
      )}
    </Screen>
  );
}

// One of the three track slots in the composer. Self-contained song search
// (Spotify first, iTunes fallback) that reports the picked track upward.
function TrackSlot({
  index,
  value,
  onChange,
}: {
  index: number;
  value: ConvinceTrackInput | null;
  onChange: (t: ConvinceTrackInput | null) => void;
}) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConvinceTrackInput[]>([]);
  const seq = useRef(0);

  const run = async (term: string) => {
    setQuery(term);
    const s = ++seq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const spotify = await searchSpotify(term);
    const mapped: ConvinceTrackInput[] = spotify.length
      ? spotify.map((t) => ({
          title: t.trackName,
          artist: t.artistName,
          artwork_url: t.artworkUrl || null,
          spotify_url: t.spotifyUrl || null,
          apple_url: null,
          norm_key: normKey(t.trackName, t.artistName),
        }))
      : (await searchItunes(term)).map((t) => ({
          title: t.trackName,
          artist: t.artistName,
          artwork_url: t.artworkUrl || null,
          spotify_url: null,
          apple_url: t.appleUrl || null,
          norm_key: normKey(t.trackName, t.artistName),
        }));
    if (s === seq.current) setResults(mapped);
  };

  if (value) {
    return (
      <View style={[styles.slotPicked, { borderColor: palette.border }]}>
        <Text style={[styles.slotNum, { color: palette.text3 }]}>{index + 1}</Text>
        {value.artwork_url ? <Image source={{ uri: value.artwork_url }} style={styles.resultArt} contentFit="cover" /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>{value.title}</Text>
          <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>{value.artist}</Text>
        </View>
        <Pressable onPress={() => onChange(null)} hitSlop={8}>
          <Text style={{ color: palette.text3, fontSize: 18 }}>×</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <View style={styles.slotSearchRow}>
        <Text style={[styles.slotNum, { color: palette.text3 }]}>{index + 1}</Text>
        <View style={{ flex: 1 }}>
          <TextField placeholder={`Search track ${index + 1}…`} value={query} onChangeText={run} autoCorrect={false} />
        </View>
      </View>
      {results.map((t, i) => (
        <Pressable
          key={`${t.norm_key}-${i}`}
          onPress={() => { onChange(t); setQuery(''); setResults([]); }}
          style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}
        >
          {t.artwork_url ? <Image source={{ uri: t.artwork_url }} style={styles.resultArt} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>{t.title}</Text>
            <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>{t.artist}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ConvinceCard({
  post,
  userId,
  onChange,
  highlight,
  mentionMembers,
}: {
  post: ConvinceRow;
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

  const canDelete = post.author_id === userId;
  const commentCount = post.convince_comments?.[0]?.count ?? 0;
  const myTarget = post.convince_targets.find((t) => t.profile_id === userId);
  const tracks = [...post.convince_tracks].sort((a, b) => a.position - b.position);
  const memberById = useMemo(() => new Map(mentionMembers.map((m) => [m.profile_id, m])), [mentionMembers]);

  const converted = post.convince_targets.filter((t) => t.verdict === 'converted').length;

  const setVerdict = async (verdict: ConvinceVerdict) => {
    const next = myTarget?.verdict === verdict ? null : verdict;
    await convince.setVerdict(post.id, next);
    onChange();
  };

  const loadComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) {
      const { data } = await convince.listComments(post.id);
      setCommentRows((data ?? []) as typeof commentRows);
    }
  };

  const addComment = async () => {
    if (!userId || !commentText.trim()) return;
    const text = commentText;
    await convince.addComment(post.id, userId, text);
    setCommentText('');
    const { data } = await convince.listComments(post.id);
    setCommentRows((data ?? []) as typeof commentRows);
    onChange();
    const tagged = resolveMentions(text, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(post.club_id, tagged, {
          context: 'convince',
          post_id: post.id,
          snippet: text.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
  };

  const deletePost = async () => {
    if (await confirmAsync('Delete rec', 'Remove this rec?')) {
      await convince.remove(post.id);
      onChange();
    }
  };

  return (
    <Card style={glow ? { borderColor: palette.amber } : undefined}>
      <View style={styles.head}>
        <Pressable onPress={() => router.push(`/club/${post.club_id}/member/${post.author_id}`)} style={styles.headAuthor} hitSlop={4}>
          <Avatar name={post.profiles?.display_name ?? null} colorIndex={post.profiles?.avatar_color ?? 0} imageUrl={post.profiles?.avatar_url} size={28} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.author, { color: palette.text1 }]}>{memberName(post.profiles?.display_name, post.profiles?.email)}</Text>
            <Text style={[styles.time, { color: palette.text3 }]}>{timeAgo(post.created_at)}</Text>
          </View>
        </Pressable>
        {canDelete ? (
          <Pressable onPress={deletePost} hitSlop={6}>
            <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.artistHeader}>
        {post.artist_image_url ? (
          <Image source={{ uri: post.artist_image_url }} style={styles.artistImgLg} contentFit="cover" />
        ) : (
          <View style={[styles.artistImgLg, styles.artistImgFallback, { backgroundColor: palette.tealBg }]}>
            <Text style={{ fontSize: 24 }}>🎤</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>YOU SHOULD HEAR</Text>
          <Text style={[styles.artistName, { color: palette.text1 }]}>{post.artist_name}</Text>
          {converted > 0 ? (
            <Text style={[styles.convertedTag, { color: palette.teal }]}>✅ Convinced {converted}</Text>
          ) : null}
        </View>
      </View>

      <Text style={[styles.blurb, { color: palette.text2 }]}>{post.blurb}</Text>

      <View style={styles.tracks}>
        {tracks.map((t) => (
          <View key={t.id} style={styles.trackRow}>
            {t.artwork_url ? <Image source={{ uri: t.artwork_url }} style={styles.trackArt} contentFit="cover" /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.trackTitle, { color: palette.text1 }]}>{t.title}</Text>
              <ListenLinks apple={t.apple_url} spotify={t.spotify_url} other={null} style={{ marginTop: 4 }} />
            </View>
          </View>
        ))}
      </View>

      {post.convince_targets.length > 0 ? (
        <View style={styles.targetRow}>
          <Text style={[styles.targetLabel, { color: palette.text3 }]}>FOR</Text>
          {post.convince_targets.map((t) => {
            const m = memberById.get(t.profile_id);
            return (
              <View key={t.profile_id} style={[styles.targetChip, { borderColor: palette.border }]}>
                <Avatar name={m?.display_name ?? null} colorIndex={m?.avatar_color ?? 0} imageUrl={m?.avatar_url ?? null} size={18} />
                <Text numberOfLines={1} style={[styles.targetName, { color: palette.text2 }]}>
                  {memberName(m?.display_name, m?.email)}
                </Text>
                {t.verdict === 'converted' ? <Text style={{ fontSize: 11 }}>✅</Text> : t.verdict === 'not_for_me' ? <Text style={{ fontSize: 11 }}>❌</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {myTarget ? (
        <View style={styles.verdictRow}>
          <Pressable
            onPress={() => setVerdict('converted')}
            style={[styles.verdictBtn, { borderColor: palette.border }, myTarget.verdict === 'converted' && { borderColor: palette.teal, backgroundColor: palette.tealBg }]}
          >
            <Text style={[styles.verdictText, { color: myTarget.verdict === 'converted' ? palette.teal : palette.text2 }]}>✅ Converted</Text>
          </Pressable>
          <Pressable
            onPress={() => setVerdict('not_for_me')}
            style={[styles.verdictBtn, { borderColor: palette.border }, myTarget.verdict === 'not_for_me' && { borderColor: palette.coral, backgroundColor: palette.coralBg }]}
          >
            <Text style={[styles.verdictText, { color: myTarget.verdict === 'not_for_me' ? palette.coral : palette.text2 }]}>❌ Not for me</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={loadComments} style={styles.commentToggle}>
        <Text style={[styles.commentToggleText, { color: palette.text3 }]}>
          💬 {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Comment'}
        </Text>
      </Pressable>

      {showComments ? (
        <View style={[styles.commentSection, { borderTopColor: palette.border }]}>
          {commentRows.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Pressable onPress={() => router.push(`/club/${post.club_id}/member/${c.author_id}`)} hitSlop={4}>
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
  pickedArtist: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  artistImg: { width: 44, height: 44, borderRadius: 22 },
  artistImgFallback: { alignItems: 'center', justifyContent: 'center' },
  pickedArtistName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 15 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  resultArt: { width: 40, height: 40, borderRadius: radius.sm },
  resultTitle: { fontFamily: fonts.sansMedium, fontSize: 13 },
  resultArtist: { fontFamily: fonts.sans, fontSize: 11 },
  orNote: { fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', marginVertical: 8 },
  slotSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slotNum: { fontFamily: fonts.monoMedium, fontSize: 13, width: 16, textAlign: 'center' },
  slotPicked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, marginTop: 8, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  sharePickLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10 },
  chipText: { fontFamily: fonts.sansMedium, fontSize: 12, flexShrink: 1 },
  chipCheck: { fontFamily: fonts.monoMedium, fontSize: 11 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  headAuthor: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  author: { fontFamily: fonts.sansBold, fontSize: 13 },
  time: { fontFamily: fonts.mono, fontSize: 10 },
  artistHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  artistImgLg: { width: 60, height: 60, borderRadius: 30 },
  artistName: { fontFamily: fonts.sansBold, fontSize: 20 },
  convertedTag: { fontFamily: fonts.sansBold, fontSize: 11, marginTop: 2 },
  blurb: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  tracks: { gap: 10, marginBottom: 12 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackArt: { width: 40, height: 40, borderRadius: radius.sm },
  trackTitle: { fontFamily: fonts.sansMedium, fontSize: 13 },
  targetRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  targetLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5, marginRight: 2 },
  targetChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingVertical: 3, paddingHorizontal: 7 },
  targetName: { fontFamily: fonts.sansMedium, fontSize: 11, maxWidth: 90 },
  verdictRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  verdictBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  verdictText: { fontFamily: fonts.sansBold, fontSize: 12 },
  commentToggle: { marginTop: 12, paddingVertical: 4 },
  commentToggleText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 10, gap: 10 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAuthor: { fontFamily: fonts.sansBold, fontSize: 11, marginBottom: 1 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
