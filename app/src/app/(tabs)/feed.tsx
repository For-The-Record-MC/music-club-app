import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useCycle } from '@/hooks/useCycle';
import { useFeed, type FeedRow } from '@/hooks/useFeed';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { searchSongs as searchItunes } from '@/utils/itunes';
import { searchSongs as searchSpotify } from '@/utils/spotify';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import {
  activity,
  clubs as clubsDb,
  comments as commentsDb,
  feed as feedDb,
  reactions as reactionsDb,
  streaming as streamingDb,
  REACTION_EMOJIS,
  type ReactionEmoji,
  type SongQuota,
} from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

type Platform = 'spotify' | 'apple' | 'other';
type Kind = 'track' | 'album' | 'playlist';
type SearchSource = 'spotify' | 'apple';

// One source-agnostic search row for the composer list. spotifyUri is set only
// for Spotify results — it's what the per-cycle playlist sync needs.
interface SearchResult {
  key: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  url: string;
  platform: Platform;
  spotifyUri?: string;
}

// Artwork URL stored on a post's metadata jsonb (from iTunes search), if any.
function artworkOf(post: FeedRow): string | null {
  const m = post.metadata as { artwork?: string } | null;
  return m?.artwork ?? null;
}

// One social feed for the club. Posts flagged "album suggestion" also surface
// in the picker's backlog (/club/[id]/suggestions).
export default function Feed() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { posts, refresh } = useFeed(id);
  const { cycle } = useCycle(id);
  const { refreshing, onRefresh } = useRefresh(refresh);
  const { focus, scrollRef, onItemLayout } = useFocusTarget();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<Kind>('track');
  const [platform, setPlatform] = useState<Platform>('spotify');
  const [suggestion, setSuggestion] = useState(false);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [spotifyUri, setSpotifyUri] = useState<string | null>(null);
  const [source, setSource] = useState<SearchSource>('spotify');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchSeq = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<SongQuota | null>(null);

  // My per-cycle song quota — drives the "X of N songs left" hint and disables
  // posting a song once the cap is hit. Only kind='track' counts.
  const loadQuota = async () => {
    if (!id) return;
    const { data } = await clubsDb.songQuota(id);
    setQuota((data as unknown as SongQuota) ?? null);
  };
  useEffect(() => {
    loadQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const capped = quota?.limit != null && quota.has_open_cycle;
  const remaining = capped ? Math.max(0, (quota!.limit as number) - quota!.used) : null;
  const songBlocked = kind === 'track' && remaining === 0;

  const runSearch = async (term: string, src: SearchSource = source) => {
    setSearch(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const found: SearchResult[] =
      src === 'spotify'
        ? (await searchSpotify(term)).map((s) => ({
            key: s.id,
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            url: s.spotifyUrl,
            platform: 'spotify' as const,
            spotifyUri: s.uri,
          }))
        : (await searchItunes(term)).map((s) => ({
            key: String(s.trackId),
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            url: s.appleUrl,
            platform: 'apple' as const,
          }));
    if (seq === searchSeq.current) setResults(found);
  };

  // Switching source re-runs the active query against the new provider.
  const switchSource = (src: SearchSource) => {
    setSource(src);
    if (search.trim().length >= 3) runSearch(search, src);
    else setResults([]);
  };

  const pickSong = (s: SearchResult) => {
    setTitle(s.trackName);
    setArtist(s.artistName);
    setUrl(s.url);
    setPlatform(s.platform);
    setArtwork(s.artworkUrl || null);
    setSpotifyUri(s.spotifyUri ?? null);
    setKind('track');
    setResults([]);
    setSearch('');
  };

  const resetComposer = () => {
    setTitle('');
    setArtist('');
    setUrl('');
    setNote('');
    setSuggestion(false);
    setArtwork(null);
    setSpotifyUri(null);
    setSearch('');
    setResults([]);
    setOpen(false);
  };

  const submit = async () => {
    if (!id || !userId || !title.trim()) {
      setError('A title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await feedDb.create({
      club_id: id,
      author_id: userId,
      kind,
      title: title.trim(),
      artist: artist.trim(),
      url: url.trim() || null,
      platform,
      note: note.trim() || null,
      is_album_suggestion: suggestion,
      metadata:
        artwork || spotifyUri
          ? { ...(artwork ? { artwork } : {}), ...(spotifyUri ? { spotify_uri: spotifyUri } : {}) }
          : null,
    });
    if (!err && data) {
      await activity.publish(id, 'feed_post', {
        title: data.title,
        is_album_suggestion: suggestion,
        post_id: data.id,
      });
    }
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    resetComposer();
    refresh();
    loadQuota();
    // Push to the cycle's Spotify playlist if the club is connected. Fire-and-
    // forget + no-ops server-side when not connected / not a track.
    if (kind === 'track') streamingDb.sync(id).catch(() => {});
  };

  if (!id) return <NoClubSelected what="feed" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing} scrollRef={scrollRef}>
      <View style={styles.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHAT YOU'RE HEARING</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>The Feed</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Pressable onPress={() => router.push(`/club/${id}/suggestions`)}>
            <Text style={[styles.link, { color: palette.purple }]}>💡 Backlog</Text>
          </Pressable>
          {cycle?.spotify_playlist_url ? (
            <Pressable onPress={() => Linking.openURL(cycle.spotify_playlist_url!)}>
              <Text style={[styles.link, { color: palette.teal }]}>▶ Playlist</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!open ? (
        <Button title="+ Share something" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <Label>Search a song</Label>
          <View style={[styles.segRow, { marginBottom: 8 }]}>
            {(['spotify', 'apple'] as SearchSource[]).map((src) => (
              <Pressable
                key={src}
                onPress={() => switchSource(src)}
                style={[
                  styles.seg,
                  { borderColor: palette.border, backgroundColor: palette.card2 },
                  source === src && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                ]}
              >
                <Text style={[styles.segText, { color: source === src ? palette.teal : palette.text3 }]}>
                  {src === 'spotify' ? 'Spotify' : 'Apple Music'}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextField
            placeholder={
              source === 'spotify'
                ? 'Search Spotify… (e.g. Dreams Fleetwood Mac)'
                : 'Search Apple Music… (e.g. Dreams Fleetwood Mac)'
            }
            value={search}
            onChangeText={(t) => runSearch(t)}
            autoCorrect={false}
          />
          {results.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => pickSong(s)}
              style={({ pressed }) => [
                styles.resultRow,
                { backgroundColor: pressed ? palette.card2 : 'transparent' },
              ]}
            >
              {s.artworkUrl ? (
                <Image source={{ uri: s.artworkUrl }} style={styles.resultArt} contentFit="cover" />
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>{s.trackName}</Text>
                <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>{s.artistName}</Text>
              </View>
            </Pressable>
          ))}

          {artwork ? (
            <View style={styles.pickedRow}>
              <Image source={{ uri: artwork }} style={styles.resultArt} contentFit="cover" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>{title}</Text>
                <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>{artist}</Text>
              </View>
              <Text onPress={() => { setArtwork(null); setUrl(''); setSpotifyUri(null); }} style={[styles.clearPick, { color: palette.text3 }]}>×</Text>
            </View>
          ) : null}

          <Text style={[styles.orNote, { color: palette.text3 }]}>or enter it manually</Text>

          <View style={styles.segRow}>
            {(['track', 'album', 'playlist'] as Kind[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[
                  styles.seg,
                  { borderColor: palette.border, backgroundColor: palette.card2 },
                  kind === k && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                ]}
              >
                <Text style={[styles.segText, { color: kind === k ? palette.teal : palette.text3 }]}>
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextField placeholder="Title (track / album / playlist)" value={title} onChangeText={setTitle} />
            <TextField placeholder="Artist (optional)" value={artist} onChangeText={setArtist} />
            <TextField placeholder="Paste a link… (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" />
            <TextField
              placeholder="A note — why you love it… (optional)"
              value={note}
              onChangeText={setNote}
              multiline
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
            <View style={styles.segRow}>
              {(['spotify', 'apple', 'other'] as Platform[]).map((pl) => (
                <Pressable
                  key={pl}
                  onPress={() => setPlatform(pl)}
                  style={[
                    styles.seg,
                    { borderColor: palette.border, backgroundColor: palette.card2 },
                    platform === pl && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                  ]}
                >
                  <Text style={[styles.segText, { color: platform === pl ? palette.teal : palette.text3 }]}>
                    {pl}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setSuggestion((s) => !s)} style={styles.checkRow}>
              <View
                style={[
                  styles.checkbox,
                  { borderColor: palette.border2 },
                  suggestion && { backgroundColor: palette.purple, borderColor: palette.purple },
                ]}
              >
                {suggestion ? <Text style={styles.checkmark}>✓</Text> : null}
              </View>
              <Text style={[styles.checkLabel, { color: palette.text2 }]}>
                Suggest as a future album pick (adds to the backlog)
              </Text>
            </Pressable>
            {capped ? (
              <InlineNote
                text={
                  remaining === 0
                    ? `You've used all ${quota!.limit} of this cycle's songs.`
                    : `${remaining} of ${quota!.limit} song${quota!.limit === 1 ? '' : 's'} left this cycle.`
                }
                tone={remaining === 0 ? 'error' : 'muted'}
              />
            ) : null}
            <Button title="Post" onPress={submit} loading={busy} disabled={songBlocked} />
            <Button title="Cancel" variant="ghost" onPress={resetComposer} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {posts.length === 0 ? (
        <InlineNote text="No posts yet — be the first to share what you're listening to." />
      ) : (
        posts.map((post) => (
          <View key={post.id} onLayout={onItemLayout(post.id)}>
            <PostCard post={post} userId={userId} onChange={refresh} highlight={post.id === focus} />
          </View>
        ))
      )}
    </Screen>
  );
}

function PostCard({
  post,
  userId,
  onChange,
  highlight = false,
}: {
  post: FeedRow;
  userId: string | null;
  onChange: () => void;
  highlight?: boolean;
}) {
  const { palette } = useTheme();
  const glow = useGlow(highlight);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentRows, setCommentRows] = useState<
    { id: string; text: string; author_id: string; profiles: { display_name: string | null; avatar_color: number } | null }[]
  >([]);

  const myReaction = post.post_reactions.find((r) => r.profile_id === userId)?.emoji as
    | ReactionEmoji
    | undefined;
  const commentCount = post.post_comments?.[0]?.count ?? 0;
  const canDelete = post.author_id === userId;

  const react = async (emoji: ReactionEmoji) => {
    if (!userId) return;
    if (myReaction === emoji) await reactionsDb.clear(post.id, userId);
    else await reactionsDb.set(post.id, userId, emoji);
    onChange();
  };

  const loadComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) {
      const { data } = await commentsDb.listByPost(post.id);
      setCommentRows((data ?? []) as typeof commentRows);
    }
  };

  const addComment = async () => {
    if (!userId || !commentText.trim()) return;
    await commentsDb.add(post.id, userId, commentText);
    setCommentText('');
    const { data } = await commentsDb.listByPost(post.id);
    setCommentRows((data ?? []) as typeof commentRows);
    onChange();
  };

  const deletePost = async () => {
    if (await confirmAsync('Delete post', 'Remove this post?')) {
      await feedDb.remove(post.id);
      onChange();
    }
  };

  const reactionCounts = post.post_reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card style={glow ? { borderColor: palette.amber } : undefined}>
      <View style={styles.postHead}>
        <Avatar name={post.profiles?.display_name ?? null} colorIndex={post.profiles?.avatar_color ?? 0} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.postAuthor, { color: palette.text1 }]}>
            {post.profiles?.display_name ?? '(no name)'}
          </Text>
          <Text style={[styles.postTime, { color: palette.text3 }]}>{timeAgo(post.created_at)}</Text>
        </View>
        {post.is_album_suggestion ? (
          <Text style={[styles.suggBadge, { color: palette.purple, backgroundColor: palette.purpleBg }]}>
            💡 suggestion
          </Text>
        ) : null}
        {canDelete ? (
          <Pressable onPress={deletePost}>
            <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.postBody}>
        {artworkOf(post) ? (
          <Image source={{ uri: artworkOf(post)! }} style={styles.postArt} contentFit="cover" />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.postTitle, { color: palette.text1 }]}>{post.title}</Text>
          {post.artist ? <Text style={[styles.postArtist, { color: palette.text2 }]}>{post.artist}</Text> : null}
        </View>
      </View>
      {post.note ? <Text style={[styles.postNote, { color: palette.text2 }]}>{post.note}</Text> : null}
      {post.url ? (
        <Pressable onPress={() => Linking.openURL(post.url!)}>
          <Text style={[styles.postLink, { color: palette.teal }]}>▶ Open link</Text>
        </Pressable>
      ) : null}

      <View style={styles.reactionRow}>
        {REACTION_EMOJIS.map((emoji) => {
          const count = reactionCounts[emoji] ?? 0;
          const mine = myReaction === emoji;
          return (
            <Pressable
              key={emoji}
              onPress={() => react(emoji)}
              style={[
                styles.reactBtn,
                { borderColor: palette.border },
                mine && { borderColor: palette.teal, backgroundColor: palette.tealBg },
              ]}
            >
              <Text style={{ fontSize: 14 }}>{emoji}</Text>
              {count > 0 ? (
                <Text style={[styles.reactCount, { color: palette.text2 }]}>{count}</Text>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable onPress={loadComments} style={styles.commentToggle}>
          <Text style={[styles.commentToggleText, { color: palette.text3 }]}>
            💬 {commentCount > 0 ? commentCount : ''}
          </Text>
        </Pressable>
      </View>

      {showComments ? (
        <View style={[styles.commentSection, { borderTopColor: palette.border }]}>
          {commentRows.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Avatar name={c.profiles?.display_name ?? null} colorIndex={c.profiles?.avatar_color ?? 0} size={24} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.commentAuthor, { color: palette.text1 }]}>
                  {c.profiles?.display_name ?? '(no name)'}
                </Text>
                <Text style={[styles.commentText, { color: palette.text1 }]}>{c.text}</Text>
              </View>
            </View>
          ))}
          <View style={styles.commentForm}>
            <TextField
              placeholder="Add a comment…"
              value={commentText}
              onChangeText={setCommentText}
              style={{ flex: 1 }}
              onSubmitEditing={addComment}
            />
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
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  link: { fontFamily: fonts.monoMedium, fontSize: 12 },
  segRow: { flexDirection: 'row', gap: 6 },
  seg: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  segText: { fontFamily: fonts.monoMedium, fontSize: 11, textTransform: 'uppercase' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postAuthor: { fontFamily: fonts.sansBold, fontSize: 13 },
  postTime: { fontFamily: fonts.mono, fontSize: 10 },
  suggBadge: {
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  resultArt: { width: 40, height: 40, borderRadius: radius.sm },
  resultTitle: { fontFamily: fonts.sansMedium, fontSize: 13 },
  resultArtist: { fontFamily: fonts.sans, fontSize: 11 },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 6,
    marginTop: 6,
    borderRadius: radius.md,
  },
  clearPick: { fontSize: 18, paddingHorizontal: 4 },
  orNote: { fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', marginVertical: 8 },
  postBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postArt: { width: 44, height: 44, borderRadius: radius.sm },
  postTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 1 },
  postArtist: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 4 },
  postNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginBottom: 6 },
  postLink: { fontFamily: fonts.monoMedium, fontSize: 11, marginBottom: 4 },
  reactionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  reactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  reactCount: { fontFamily: fonts.monoMedium, fontSize: 11 },
  commentToggle: { marginLeft: 'auto', paddingVertical: 5, paddingHorizontal: 8 },
  commentToggleText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 10, gap: 10 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAuthor: { fontFamily: fonts.sansBold, fontSize: 11, marginBottom: 1 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
