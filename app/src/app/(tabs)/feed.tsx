import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, Button, Card, InlineNote, Label, ListenLinks, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useFeed, type FeedRow } from '@/hooks/useFeed';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { resolveAppleAlbum, resolveAppleTrack, searchAlbums as searchItunesAlbums, searchSongs as searchItunes } from '@/utils/itunes';
import { resolveSpotifyAlbum, resolveSpotifyTrack, searchAlbums as searchSpotifyAlbums, searchSongs as searchSpotify } from '@/utils/spotify';
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
type Kind = 'track' | 'album';

// One search row for the composer list. Search is Spotify-first (best catalog),
// falling back to iTunes; whichever source produced it, the *other* service's
// link is resolved on pick so every post opens in both.
interface SearchResult {
  key: string;
  kind: Kind;
  // For album results, trackName carries the album title.
  trackName: string;
  artistName: string;
  artworkUrl: string;
  spotifyUrl: string | null;
  spotifyUri: string | null;
  appleUrl: string | null;
}

// Artwork URL stored on a post's metadata jsonb, if any.
function artworkOf(post: FeedRow): string | null {
  const m = post.metadata as { artwork?: string } | null;
  return m?.artwork ?? null;
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

// One social feed for the club. Posts flagged "album suggestion" also surface
// in the picker's backlog (/club/[id]/suggestions).
export default function Feed() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { posts, refresh } = useFeed(id);
  const { members } = useClubData(id);
  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map((m) => ({
        profile_id: m.profile_id,
        display_name: m.profiles?.display_name ?? null,
        avatar_color: m.profiles?.avatar_color ?? 0,
        avatar_url: m.profiles?.avatar_url ?? null,
      })),
    [members],
  );
  const { cycle } = useCycle(id);
  const { refreshing, onRefresh } = useRefresh(refresh);
  const { focus, scrollRef, onItemLayout } = useFocusTarget();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<Kind>('track');
  const [suggestion, setSuggestion] = useState(false);
  const [artwork, setArtwork] = useState<string | null>(null);
  const [spotifyUri, setSpotifyUri] = useState<string | null>(null);
  const [spotifyUrl, setSpotifyUrl] = useState<string | null>(null);
  const [appleUrl, setAppleUrl] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const searchSeq = useRef(0);
  const pickSeq = useRef(0);
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

  // Search the catalog for the active kind. searchKind is passed explicitly so
  // the track/album toggle can re-run immediately without a stale `kind` closure.
  // Spotify first (best catalog/search); fall back to iTunes if it's empty —
  // e.g. app credentials unset, or something Spotify simply doesn't have.
  const runSearch = async (term: string, searchKind: Kind = kind) => {
    setSearch(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    let found: SearchResult[];
    if (searchKind === 'album') {
      const spotifyHits = await searchSpotifyAlbums(term);
      found = spotifyHits.length
        ? spotifyHits.map((a) => ({
            key: a.id,
            kind: 'album' as const,
            trackName: a.collectionName,
            artistName: a.artistName,
            artworkUrl: a.artworkUrl,
            spotifyUrl: a.spotifyUrl,
            spotifyUri: a.uri,
            appleUrl: null,
          }))
        : (await searchItunesAlbums(term)).map((a) => ({
            key: String(a.collectionId),
            kind: 'album' as const,
            trackName: a.collectionName,
            artistName: a.artistName,
            artworkUrl: a.artworkUrl,
            spotifyUrl: null,
            spotifyUri: null,
            appleUrl: a.appleUrl || null,
          }));
    } else {
      const spotifyHits = await searchSpotify(term);
      found = spotifyHits.length
        ? spotifyHits.map((s) => ({
            key: s.id,
            kind: 'track' as const,
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            spotifyUrl: s.spotifyUrl,
            spotifyUri: s.uri,
            appleUrl: null,
          }))
        : (await searchItunes(term)).map((s) => ({
            key: String(s.trackId),
            kind: 'track' as const,
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            spotifyUrl: null,
            spotifyUri: null,
            appleUrl: s.appleUrl,
          }));
    }
    if (seq === searchSeq.current) setResults(found);
  };

  // Switching the search kind clears stale results and re-runs against the new
  // catalog, so the dropdown matches what the toggle says it's searching.
  const changeKind = (k: Kind) => {
    if (k === kind) return;
    setKind(k);
    setResults([]);
    if (search.trim().length >= 3) runSearch(search, k);
  };

  const pickSong = async (s: SearchResult) => {
    const seq = ++pickSeq.current;
    setTitle(s.trackName);
    setArtist(s.artistName);
    setUrl('');
    setArtwork(s.artworkUrl || null);
    setSpotifyUri(s.spotifyUri);
    setSpotifyUrl(s.spotifyUrl);
    setAppleUrl(s.appleUrl);
    setKind(s.kind);
    // Picking an album defaults the "future album pick" flag on — that's the
    // common intent; the member can still uncheck it before posting.
    if (s.kind === 'album') setSuggestion(true);
    setResults([]);
    setSearch('');
    // Resolve the other service's link so the post opens in both. Keyless on the
    // Apple side, app-token on the Spotify side; best-effort, guarded vs a stale pick.
    if (s.spotifyUrl && !s.appleUrl) {
      const apple =
        s.kind === 'album'
          ? (await resolveAppleAlbum(s.trackName, s.artistName))?.appleUrl ?? null
          : await resolveAppleTrack(s.trackName, s.artistName);
      if (apple && seq === pickSeq.current) setAppleUrl(apple);
    } else if (s.appleUrl && !s.spotifyUrl) {
      const match =
        s.kind === 'album'
          ? await resolveSpotifyAlbum(s.trackName, s.artistName)
          : await resolveSpotifyTrack(s.trackName, s.artistName);
      if (match && seq === pickSeq.current) {
        setSpotifyUri(match.uri);
        setSpotifyUrl(match.url);
      }
    }
  };

  const resetComposer = () => {
    setTitle('');
    setArtist('');
    setUrl('');
    setNote('');
    setKind('track');
    setSuggestion(false);
    setArtwork(null);
    setSpotifyUri(null);
    setSpotifyUrl(null);
    setAppleUrl(null);
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
    // Fold a manually pasted link into the right service slot (detected from the
    // host), or treat it as a generic "other" link. Picked results already set
    // appleUrl/spotifyUrl.
    const manual = url.trim();
    let aUrl = appleUrl;
    let sUrl = spotifyUrl;
    let otherUrl: string | null = null;
    if (manual) {
      if (/spotify\.com/i.test(manual)) sUrl = sUrl ?? manual;
      else if (/apple\.com/i.test(manual)) aUrl = aUrl ?? manual;
      else otherUrl = manual;
    }
    // url+platform stay populated as a single-link fallback for older clients.
    const primaryUrl = sUrl ?? aUrl ?? otherUrl;
    const platform: Platform = sUrl ? 'spotify' : aUrl ? 'apple' : 'other';
    const meta = {
      ...(artwork ? { artwork } : {}),
      ...(spotifyUri ? { spotify_uri: spotifyUri } : {}),
      ...(sUrl ? { spotify_url: sUrl } : {}),
      ...(aUrl ? { apple_url: aUrl } : {}),
    };
    const { data, error: err } = await feedDb.create({
      club_id: id,
      author_id: userId,
      kind,
      title: title.trim(),
      artist: artist.trim(),
      url: primaryUrl,
      platform,
      note: note.trim() || null,
      is_album_suggestion: suggestion,
      metadata: Object.keys(meta).length ? meta : null,
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
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <Pressable
            onPress={() => router.push(`/club/${id}/suggestions`)}
            style={({ pressed }) => [
              styles.headerBtn,
              { backgroundColor: palette.purpleBg, borderColor: palette.purple },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.headerBtnText, { color: palette.purple }]}>💡 Backlog</Text>
          </Pressable>
          {cycle?.spotify_playlist_url ? (
            <Pressable
              onPress={() => Linking.openURL(cycle.spotify_playlist_url!)}
              style={({ pressed }) => [
                styles.headerBtn,
                { backgroundColor: palette.tealBg, borderColor: palette.teal },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.headerBtnText, { color: palette.teal }]}>▶ Playlist</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!open ? (
        <Button title="+ Share something" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <View style={styles.segRow}>
            {(['track', 'album'] as Kind[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => changeKind(k)}
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
          <View style={{ marginTop: 10 }}>
            <Label>{kind === 'album' ? 'Search an album' : 'Search a song'}</Label>
          </View>
          <TextField
            placeholder={
              kind === 'album'
                ? 'Search an album… (e.g. Rumours)'
                : 'Search a song… (e.g. Dreams Fleetwood Mac)'
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
                {spotifyUrl || appleUrl ? (
                  <Text style={[styles.pickedHint, { color: palette.text3 }]}>
                    Opens in {[spotifyUrl && 'Spotify', appleUrl && 'Apple Music'].filter(Boolean).join(' + ')}
                  </Text>
                ) : null}
              </View>
              <Text
                onPress={() => { setArtwork(null); setUrl(''); setSpotifyUri(null); setSpotifyUrl(null); setAppleUrl(null); }}
                style={[styles.clearPick, { color: palette.text3 }]}
              >
                ×
              </Text>
            </View>
          ) : null}

          <Text style={[styles.orNote, { color: palette.text3 }]}>
            or enter {kind === 'album' ? 'an album' : 'it'} manually
          </Text>

          <View style={{ gap: 8, marginTop: 8 }}>
            <TextField placeholder="Title (track / album)" value={title} onChangeText={setTitle} />
            <TextField placeholder="Artist (optional)" value={artist} onChangeText={setArtist} />
            <TextField placeholder="Paste a link… (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" />
            <TextField
              placeholder="A note — why you love it… (optional)"
              value={note}
              onChangeText={setNote}
              multiline
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
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
            <PostCard post={post} userId={userId} onChange={refresh} highlight={post.id === focus} mentionMembers={mentionMembers} />
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
  mentionMembers,
}: {
  post: FeedRow;
  userId: string | null;
  onChange: () => void;
  highlight?: boolean;
  mentionMembers: MentionMember[];
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const glow = useGlow(highlight);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentRows, setCommentRows] = useState<
    { id: string; text: string; author_id: string; profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null }[]
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
              {post.profiles?.display_name ?? '(no name)'}
            </Text>
            <Text style={[styles.postTime, { color: palette.text3 }]}>{timeAgo(post.created_at)}</Text>
          </View>
        </Pressable>
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
                    {c.profiles?.display_name ?? '(no name)'}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerBtnText: { fontFamily: fonts.sansBold, fontSize: 12 },
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
  postHeadAuthor: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
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
  pickedHint: { fontFamily: fonts.monoMedium, fontSize: 10, marginTop: 3 },
  orNote: { fontFamily: fonts.mono, fontSize: 10, textAlign: 'center', marginVertical: 8 },
  postBody: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postArt: { width: 44, height: 44, borderRadius: radius.sm },
  postTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 1 },
  postArtist: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 4 },
  postNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginBottom: 6 },
  linkRow: { marginTop: 2, marginBottom: 4 },
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
