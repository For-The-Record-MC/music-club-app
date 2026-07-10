import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { PlaylistComposer } from '@/components/PlaylistComposer';
import { PreviewArt } from '@/components/PreviewArt';
import { ShareComposer } from '@/components/ShareComposer';
import { Avatar, BottomSheet, Button, Card, InlineNote, Label, ListenButton, ListenLinks, Loading, NoClubSelected, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useFeed, type FeedRow } from '@/hooks/useFeed';
import { useMyClubs } from '@/hooks/useMyClubs';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import { memberName } from '@/utils/memberName';
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

// Artwork URL stored on a post's metadata jsonb, if any.
function artworkOf(post: FeedRow): string | null {
  const m = post.metadata as { artwork?: string } | null;
  return m?.artwork ?? null;
}

// 30s Apple preview stashed in metadata by the apple-music resolver.
function previewOf(post: FeedRow): string | null {
  const m = post.metadata as { preview_url?: string } | null;
  return m?.preview_url ?? null;
}

// The listen links to render on a post. New posts carry both in metadata; older
// posts (or manual pastes) fall back to the legacy url+platform pair, with a
// generic "Open link" for anything unrecognized.
function linksOf(post: FeedRow): { apple: string | null; spotify: string | null; other: string | null } {
  const meta = post.metadata as { apple_url?: string; spotify_url?: string } | null;
  const apple = meta?.apple_url ?? (post.platform === 'apple' ? post.url : null);
  const spotify = meta?.spotify_url ?? (post.platform === 'spotify' ? post.url : null);
  const other = !apple && !spotify ? post.url : null;
  return { apple, spotify, other };
}

// A club the current user belongs to, trimmed to what the share UI needs.
interface ClubLite {
  id: string;
  name: string;
  emoji: string;
}

// The original this post traces back to (itself, if it's not a copy).
const rootPostId = (p: FeedRow) => p.origin_post_id ?? p.id;

// The original poster to credit on a copy. Propagates through re-shares, and is
// hidden when the original poster is the same person viewing/sharing.
function sharedFromOf(post: FeedRow): { id: string; name: string | null } | null {
  const m = post.metadata as { shared_from_id?: string; shared_from_name?: string | null } | null;
  if (m?.shared_from_id && m.shared_from_id !== post.author_id) {
    return { id: m.shared_from_id, name: m.shared_from_name ?? null };
  }
  return null;
}

// Cross-post a feed post into another club as the sharer (so it counts against
// the sharer's cap there), crediting the original poster, then sync that club's
// playlist for tracks. Returns an error (e.g. song cap hit) or null on success.
async function sharePostTo(targetClubId: string, post: FeedRow, userId: string) {
  const srcMeta = (post.metadata ?? {}) as Record<string, string | null | undefined>;
  const originId = srcMeta.shared_from_id ?? post.author_id;
  const originName = srcMeta.shared_from_name ?? post.profiles?.display_name ?? null;
  const metadata = { ...srcMeta, shared_from_id: originId, shared_from_name: originName };
  const { data, error } = await feedDb.create({
    club_id: targetClubId,
    author_id: userId,
    kind: post.kind,
    title: post.title,
    artist: post.artist,
    url: post.url,
    platform: post.platform,
    note: post.note,
    is_album_suggestion: post.is_album_suggestion,
    metadata,
    origin_post_id: rootPostId(post),
  });
  if (error || !data) return error;
  await activity.publish(targetClubId, 'feed_post', {
    title: data.title,
    is_album_suggestion: post.is_album_suggestion,
    post_id: data.id,
  });
  // Push the new track onto the target club's cycle playlist (no-op if the club
  // isn't connected). Fire-and-forget so a slow sync doesn't block the UI.
  if (post.kind === 'track') streamingDb.sync(targetClubId).catch(() => {});
  return null;
}

// One social feed for the club. Posts flagged "album suggestion" also surface
// in the picker's backlog (/club/[id]/suggestions).
export default function ClubhouseActivity() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { posts, loading, refresh } = useFeed(id);
  const { members } = useClubData(id);
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
  const { cycle } = useCycle(id);
  const { refreshing, onRefresh } = useRefresh(refresh);
  const { focus, scrollRef, onItemLayout } = useFocusTarget();

  // Two stations on the dial: Songs (tracks + legacy album shares) and
  // Playlists (kind='playlist' link posts).
  const [tab, setTab] = useState<'songs' | 'playlists'>('songs');
  const tabPosts = useMemo(
    () => posts.filter((p) => (p.kind === 'playlist') === (tab === 'playlists')),
    [posts, tab],
  );

  // A deep link can focus a post on either tab — switch to the one holding it.
  useEffect(() => {
    if (!focus) return;
    const target = posts.find((p) => p.id === focus);
    if (target) setTab(target.kind === 'playlist' ? 'playlists' : 'songs');
  }, [focus, posts]);

  // Scope the feed to the current (open) cycle by default; earlier posts collapse
  // behind a toggle. The window matches the cycle playlist (created_at >= start).
  const [showEarlier, setShowEarlier] = useState(false);
  const { current: currentPosts, earlier: earlierPosts } = useMemo(() => {
    if (!cycle) return { current: tabPosts, earlier: [] as FeedRow[] };
    const start = new Date(cycle.created_at).getTime();
    return {
      current: tabPosts.filter((p) => new Date(p.created_at).getTime() >= start),
      earlier: tabPosts.filter((p) => new Date(p.created_at).getTime() < start),
    };
  }, [tabPosts, cycle]);

  // If a deep-link focuses a post that lives in the collapsed bucket, reveal it.
  useEffect(() => {
    if (focus && earlierPosts.some((p) => p.id === focus)) setShowEarlier(true);
  }, [focus, earlierPosts]);

  // Your other clubs — the candidates for cross-posting a song/album.
  const { rows: myClubRows } = useMyClubs();
  const otherClubs = useMemo<ClubLite[]>(
    () =>
      myClubRows
        .filter((r) => r.club.id !== id)
        .map((r) => ({ id: r.club.id, name: r.club.name, emoji: r.club.emoji })),
    [myClubRows, id],
  );

  if (!id) return <NoClubSelected what="feed" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing} scrollRef={scrollRef}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHAT YOU'RE HEARING</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>📻 Club Radio</Text>
        </View>
        <View style={styles.headerBtnRow}>
          {cycle?.spotify_playlist_url ? (
            <Pressable
              onPress={() => Linking.openURL(cycle.spotify_playlist_url!)}
              style={({ pressed }) => [
                styles.playlistBtn,
                { backgroundColor: palette.spotify },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.playlistPlay}>
                <Text style={[styles.playlistPlayIcon, { color: palette.spotify }]}>▶</Text>
              </View>
              <Text style={styles.playlistBtnText}>Playlist</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.tabRow}>
        {(
          [
            ['songs', '🎵 Songs'],
            ['playlists', '📼 Playlists'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[
              styles.tab,
              { borderColor: palette.border, backgroundColor: palette.card2 },
              tab === key && { borderColor: palette.teal, backgroundColor: palette.tealBg },
            ]}
          >
            <Text style={[styles.tabText, { color: tab === key ? palette.teal : palette.text3 }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? <Loading /> : (
      <>
      {tab === 'songs' ? (
        <ShareComposer clubId={id} onPosted={refresh} includeAlbums={false} />
      ) : (
        <PlaylistComposer clubId={id} onPosted={refresh} />
      )}

      {(() => {
        const renderPost = (post: FeedRow) => (
          <View key={post.id} onLayout={onItemLayout(post.id)}>
            <PostCard post={post} userId={userId} onChange={refresh} highlight={post.id === focus} mentionMembers={mentionMembers} shareClubs={otherClubs} />
          </View>
        );
        if (currentPosts.length === 0 && earlierPosts.length === 0) {
          return (
            <InlineNote
              text={
                tab === 'playlists'
                  ? 'No playlists yet — paste a link to one the club should hear.'
                  : "No posts yet — be the first to share what you're listening to."
              }
            />
          );
        }
        return (
          <>
            {currentPosts.length === 0 ? (
              <InlineNote text="Nothing shared this cycle yet — be the first." />
            ) : (
              currentPosts.map(renderPost)
            )}
            {earlierPosts.length > 0 ? (
              <>
                <Pressable
                  onPress={() => setShowEarlier((v) => !v)}
                  style={[styles.earlierToggle, { borderColor: palette.border }]}
                >
                  <Text style={[styles.earlierToggleText, { color: palette.text2 }]}>
                    {showEarlier
                      ? '▾ Hide earlier posts'
                      : `▸ Show ${earlierPosts.length} earlier post${earlierPosts.length === 1 ? '' : 's'}`}
                  </Text>
                </Pressable>
                {showEarlier ? earlierPosts.map(renderPost) : null}
              </>
            ) : null}
          </>
        );
      })()}
      </>
      )}
    </Screen>
  );
}

function PostCard({
  post,
  userId,
  onChange,
  highlight = false,
  mentionMembers,
  shareClubs,
}: {
  post: FeedRow;
  userId: string | null;
  onChange: () => void;
  highlight?: boolean;
  mentionMembers: MentionMember[];
  shareClubs: ClubLite[];
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const glow = useGlow(highlight);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  // Long-pressing a reaction opens a sheet listing who reacted with that emoji.
  const [reactorsFor, setReactorsFor] = useState<ReactionEmoji | null>(null);
  const sharedFrom = sharedFromOf(post);
  const [commentText, setCommentText] = useState('');
  const [commentRows, setCommentRows] = useState<
    { id: string; text: string; author_id: string; profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null }[]
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
    const text = commentText;
    await commentsDb.add(post.id, userId, text);
    setCommentText('');
    const { data } = await commentsDb.listByPost(post.id);
    setCommentRows((data ?? []) as typeof commentRows);
    onChange();
    const tagged = resolveMentions(text, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(post.club_id, tagged, {
          context: 'feed',
          post_id: post.id,
          snippet: text.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
  };

  const deletePost = async () => {
    if (await confirmAsync('Delete post', 'Remove this post?')) {
      // Pull the track from the cycle's Spotify playlist first, while the row
      // still exists for the server to resolve it. Best-effort + no-op when the
      // club isn't connected or it wasn't a synced track.
      if (post.kind === 'track') {
        await streamingDb.removePost(post.club_id, post.id).catch(() => {});
      }
      await feedDb.remove(post.id);
      onChange();
    }
  };

  const reactionCounts = post.post_reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  // Names/avatars for the long-press "who reacted" sheet, keyed by profile.
  const memberById = useMemo(
    () => new Map(mentionMembers.map((m) => [m.profile_id, m])),
    [mentionMembers],
  );
  const reactors = reactorsFor
    ? post.post_reactions
        .filter((r) => r.emoji === reactorsFor)
        .map((r) => ({ profile_id: r.profile_id, member: memberById.get(r.profile_id) ?? null }))
    : [];

  return (
    <Card style={glow ? { borderColor: palette.amber } : undefined}>
      <View style={styles.postHead}>
        <Pressable
          onPress={() => router.push(`/club/${post.club_id}/member/${post.author_id}`)}
          style={styles.postHeadAuthor}
          hitSlop={4}
        >
          <Avatar name={post.profiles?.display_name ?? null} colorIndex={post.profiles?.avatar_color ?? 0} imageUrl={post.profiles?.avatar_url} size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.postAuthor, { color: palette.text1 }]}>
              {memberName(post.profiles?.display_name, post.profiles?.email)}
            </Text>
            <Text style={[styles.postTime, { color: palette.text3 }]}>{timeAgo(post.created_at)}</Text>
          </View>
        </Pressable>
        {shareClubs.length > 0 ? (
          <Pressable onPress={() => setShowShare(true)} hitSlop={6} accessibilityLabel="Share to another club">
            <Text style={{ color: palette.text3, fontSize: 16 }}>↗</Text>
          </Pressable>
        ) : null}
        {canDelete ? (
          <Pressable onPress={deletePost}>
            <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </View>

      {sharedFrom ? (
        <Text style={[styles.sharedFrom, { color: palette.text3 }]}>
          ↑ shared from {sharedFrom.name ?? 'another club'}
        </Text>
      ) : null}

      <View style={styles.postBody}>
        {artworkOf(post) ? (
          <PreviewArt
            id={`feed:${post.id}`}
            uri={artworkOf(post)}
            previewUrl={previewOf(post)}
            title={post.title ?? undefined}
            artist={post.artist ?? undefined}
            style={styles.postArt}
          />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.postTitle, { color: palette.text1 }]}>{post.title}</Text>
          {post.artist ? <Text style={[styles.postArtist, { color: palette.text2 }]}>{post.artist}</Text> : null}
        </View>
        <ListenButton apple={linksOf(post).apple} spotify={linksOf(post).spotify} />
      </View>
      {post.note ? (
        <MentionText
          text={post.note}
          members={mentionMembers}
          style={[styles.postNote, { color: palette.text2 }]}
        />
      ) : null}
      {(() => {
        const links = linksOf(post);
        return (
          <ListenLinks
            apple={links.apple}
            spotify={links.spotify}
            other={links.other}
            style={styles.linkRow}
          />
        );
      })()}

      <View style={styles.reactionRow}>
        {REACTION_EMOJIS.map((emoji) => {
          const count = reactionCounts[emoji] ?? 0;
          const mine = myReaction === emoji;
          return (
            <Pressable
              key={emoji}
              onPress={() => react(emoji)}
              onLongPress={count > 0 ? () => setReactorsFor(emoji) : undefined}
              delayLongPress={250}
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
              <Pressable
                onPress={() => router.push(`/club/${post.club_id}/member/${c.author_id}`)}
                hitSlop={4}
              >
                <Avatar name={c.profiles?.display_name ?? null} colorIndex={c.profiles?.avatar_color ?? 0} imageUrl={c.profiles?.avatar_url} size={24} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Pressable
                  onPress={() => router.push(`/club/${post.club_id}/member/${c.author_id}`)}
                  hitSlop={4}
                >
                  <Text style={[styles.commentAuthor, { color: palette.text1 }]}>
                    {memberName(c.profiles?.display_name, c.profiles?.email)}
                  </Text>
                </Pressable>
                <MentionText
                  text={c.text}
                  members={mentionMembers}
                  style={[styles.commentText, { color: palette.text1 }]}
                />
              </View>
            </View>
          ))}
          <View style={styles.commentForm}>
            <MentionInput
              placeholder="Add a comment… (@ to tag)"
              value={commentText}
              onChangeText={setCommentText}
              members={mentionMembers}
              onSubmitEditing={addComment}
            />
            <Button title="Post" onPress={addComment} disabled={!commentText.trim()} />
          </View>
        </View>
      ) : null}

      {shareClubs.length > 0 ? (
        <ShareFeedSheet
          visible={showShare}
          onClose={() => setShowShare(false)}
          post={post}
          clubs={shareClubs}
          userId={userId}
          onShared={onChange}
        />
      ) : null}

      <BottomSheet visible={reactorsFor !== null} onClose={() => setReactorsFor(null)}>
        <Label>Reacted with {reactorsFor}</Label>
        {reactors.map(({ profile_id, member }) => (
          <View key={profile_id} style={styles.reactorRow}>
            <Avatar
              name={member?.display_name ?? null}
              colorIndex={member?.avatar_color ?? 0}
              imageUrl={member?.avatar_url ?? null}
              size={28}
            />
            <Text style={[styles.reactorName, { color: palette.text1 }]}>
              {memberName(member?.display_name, member?.email)}
            </Text>
          </View>
        ))}
      </BottomSheet>
    </Card>
  );
}

// Bottom sheet for cross-posting a feed post to your other clubs. Clubs that
// already have it are shown as "Added"; for songs, clubs where you've hit the
// per-cycle cap are shown as "Cap reached" and can't be picked.
function ShareFeedSheet({
  visible,
  onClose,
  post,
  clubs,
  userId,
  onShared,
}: {
  visible: boolean;
  onClose: () => void;
  post: FeedRow;
  clubs: ClubLite[];
  userId: string | null;
  onShared: () => void;
}) {
  const { palette } = useTheme();
  const [already, setAlready] = useState<Set<string>>(new Set());
  // clubId → remaining song slots; null = uncapped/no open cycle (always allowed).
  const [remaining, setRemaining] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const root = rootPostId(post);
  const isTrack = post.kind === 'track';

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const { data } = await feedDb.sharedClubIds(root);
      const sharedSet = new Set((data ?? []).map((r) => r.club_id));
      const remMap: Record<string, number | null> = {};
      if (isTrack) {
        const candidates = clubs.filter((c) => !sharedSet.has(c.id));
        const quotas = await Promise.all(candidates.map((c) => clubsDb.songQuota(c.id)));
        candidates.forEach((c, i) => {
          const q = quotas[i].data as unknown as SongQuota | null;
          remMap[c.id] =
            q && q.limit != null && q.has_open_cycle ? Math.max(0, q.limit - q.used) : null;
        });
      }
      if (!cancelled) {
        setAlready(sharedSet);
        setRemaining(remMap);
        setSelected(new Set());
        setError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, root, isTrack, clubs]);

  const toggle = (clubId: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(clubId)) next.delete(clubId);
      else next.add(clubId);
      return next;
    });

  const share = async () => {
    if (!userId || selected.size === 0) return;
    setBusy(true);
    setError(null);
    const failures: string[] = [];
    for (const targetId of selected) {
      const err = await sharePostTo(targetId, post, userId);
      if (err) failures.push(clubs.find((c) => c.id === targetId)?.name ?? 'a club');
    }
    setBusy(false);
    onShared();
    if (failures.length) {
      setError(`Couldn't share to ${failures.join(', ')} — song cap reached.`);
      return;
    }
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Label>Share "{post.title}" to…</Label>
      {clubs.map((c) => {
        const has = already.has(c.id);
        const rem = remaining[c.id];
        const capReached = isTrack && rem === 0;
        const disabled = has || capReached;
        const on = selected.has(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={disabled ? undefined : () => toggle(c.id)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.shareRow,
              {
                borderColor: on ? palette.teal : palette.border,
                backgroundColor: on ? palette.tealBg : palette.card2,
                opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.shareRowName, { color: palette.text1 }]}>
                {c.name}
              </Text>
              {isTrack && typeof rem === 'number' && !has ? (
                <Text style={[styles.shareRowHint, { color: capReached ? palette.coral : palette.text3 }]}>
                  {capReached ? 'No song slots left this cycle' : `${rem} song${rem === 1 ? '' : 's'} left`}
                </Text>
              ) : null}
            </View>
            <Text
              style={[
                styles.shareRowState,
                { color: has || capReached ? palette.text3 : on ? palette.teal : palette.text3 },
              ]}
            >
              {has ? '✓ Added' : capReached ? 'Capped' : on ? '✓' : '+'}
            </Text>
          </Pressable>
        );
      })}
      <Button
        title={selected.size > 0 ? `Share to ${selected.size} club${selected.size === 1 ? '' : 's'}` : 'Share'}
        onPress={share}
        loading={busy}
        disabled={selected.size === 0}
        style={{ marginTop: 8 }}
      />
      {error ? <InlineNote text={error} tone="error" /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  tabRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  tabText: { fontFamily: fonts.monoMedium, fontSize: 11, textTransform: 'uppercase' },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerBtnText: { fontFamily: fonts.sansBold, fontSize: 12 },
  headerBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  playlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 12,
  },
  playlistPlay: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistPlayIcon: { fontSize: 8, marginLeft: 1 },
  playlistBtnText: { fontFamily: fonts.sansBold, fontSize: 12, color: '#fff' },
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
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sharedFrom: { fontFamily: fonts.sans, fontSize: 11, marginTop: -2, marginBottom: 8 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  shareRowName: { fontFamily: fonts.sansBold, fontSize: 15 },
  shareRowHint: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  shareRowState: { fontFamily: fonts.monoMedium, fontSize: 13 },
  postHeadAuthor: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  postAuthor: { fontFamily: fonts.sansBold, fontSize: 13 },
  postTime: { fontFamily: fonts.mono, fontSize: 10 },
  suggBadge: {
    fontFamily: fonts.sansBold,
    fontSize: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
  },
  postBody: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  postArt: { width: 44, height: 44, borderRadius: radius.sm },
  postTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 1 },
  postArtist: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 4 },
  postNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginBottom: 6 },
  linkRow: { marginTop: 10, marginBottom: 4 },
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
  reactorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  reactorName: { fontFamily: fonts.sansMedium, fontSize: 14 },
  commentToggle: { marginLeft: 'auto', paddingVertical: 5, paddingHorizontal: 8 },
  commentToggleText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 10, gap: 10 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAuthor: { fontFamily: fonts.sansBold, fontSize: 11, marginBottom: 1 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  earlierToggle: {
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    marginVertical: 6,
  },
  earlierToggleText: { fontFamily: fonts.monoMedium, fontSize: 12 },
});
