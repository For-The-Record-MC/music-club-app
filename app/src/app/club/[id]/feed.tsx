import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useFeed, type FeedRow } from '@/hooks/useFeed';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import {
  activity,
  comments as commentsDb,
  feed as feedDb,
  reactions as reactionsDb,
  REACTION_EMOJIS,
  type ReactionEmoji,
} from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

type Platform = 'spotify' | 'apple' | 'other';
type Kind = 'track' | 'album' | 'playlist';

// One social feed for the club. Posts flagged "album suggestion" also surface
// in the picker's backlog (/club/[id]/suggestions).
export default function Feed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { posts, refresh } = useFeed(id);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<Kind>('track');
  const [platform, setPlatform] = useState<Platform>('spotify');
  const [suggestion, setSuggestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    });
    if (!err && data) {
      await activity.publish(id, 'feed_post', {
        title: data.title,
        is_album_suggestion: suggestion,
      });
    }
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setTitle('');
    setArtist('');
    setUrl('');
    setNote('');
    setSuggestion(false);
    setOpen(false);
    refresh();
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHAT YOU'RE HEARING</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>The Feed</Text>
        </View>
        <Pressable onPress={() => router.push(`/club/${id}/suggestions`)}>
          <Text style={[styles.link, { color: palette.purple }]}>💡 Backlog</Text>
        </Pressable>
      </View>

      {!open ? (
        <Button title="+ Share something" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <Label>Share with the club</Label>
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
            <Button title="Post" onPress={submit} loading={busy} />
            <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {posts.length === 0 ? (
        <InlineNote text="No posts yet — be the first to share what you're listening to." />
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} userId={userId} onChange={refresh} />
        ))
      )}
    </Screen>
  );
}

function PostCard({
  post,
  userId,
  onChange,
}: {
  post: FeedRow;
  userId: string | null;
  onChange: () => void;
}) {
  const { palette } = useTheme();
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
    <Card>
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

      <Text style={[styles.postTitle, { color: palette.text1 }]}>{post.title}</Text>
      {post.artist ? <Text style={[styles.postArtist, { color: palette.text2 }]}>{post.artist}</Text> : null}
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
