import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, BottomSheet, Button, Card, InlineNote, Label, ListenLinks, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useFeed, type FeedRow } from '@/hooks/useFeed';
import { useMyClubs } from '@/hooks/useMyClubs';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { resolveAppleAlbum, resolveAppleTrack, searchAlbums as searchItunesAlbums, searchSongs as searchItunes } from '@/utils/itunes';
import { resolveSpotifyAlbum, resolveSpotifyTrack, searchAlbums as searchSpotifyAlbums, searchSongs as searchSpotify } from '@/utils/spotify';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import { memberName } from '@/utils/memberName';
import { normKey } from '@/utils/normalize';
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
  const { posts, refresh } = useFeed(id);
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

  // Scope the feed to the current (open) cycle by default; earlier posts collapse
  // behind a toggle. The window matches the cycle playlist (created_at >= start).
  const [showEarlier, setShowEarlier] = useState(false);
  const { current: currentPosts, earlier: earlierPosts } = useMemo(() => {
    if (!cycle) return { current: posts, earlier: [] as FeedRow[] };
    const start = new Date(cycle.created_at).getTime();
    return {
      current: posts.filter((p) => new Date(p.created_at).getTime() >= start),
      earlier: posts.filter((p) => new Date(p.created_at).getTime() < start),
    };
  }, [posts, cycle]);

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
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  // Other clubs' remaining song slots; null = uncapped/no open cycle.
  const [otherQuota, setOtherQuota] = useState<Record<string, number | null>>({});

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

  // While the composer is open, learn each other club's remaining song slots so
  // "Also post to" can disable clubs where you're already at the cap (tracks).
  useEffect(() => {
    if (!open || otherClubs.length === 0) return;
    let cancelled = false;
    (async () => {
      const quotas = await Promise.all(otherClubs.map((c) => clubsDb.songQuota(c.id)));
      if (cancelled) return;
      const map: Record<string, number | null> = {};
      otherClubs.forEach((c, i) => {
        const q = quotas[i].data as unknown as SongQuota | null;
        map[c.id] = q && q.limit != null && q.has_open_cycle ? Math.max(0, q.limit - q.used) : null;
      });
      setOtherQuota(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, otherClubs]);

  const toggleShareTarget = (clubId: string) =>
    setShareTargets((t) => (t.includes(clubId) ? t.filter((x) => x !== clubId) : [...t, clubId]));

  const capped = quota?.limit != null && quota.has_open_cycle;
  const remaining = capped ? Math.max(0, (quota!.limit as number) - quota!.used) : null;
  const songBlocked = kind === 'track' && remaining === 0;
  // Picked share targets that aren't capped-out for a song — what actually posts.
  const activeShareCount = shareTargets.filter((t) => !(kind === 'track' && otherQuota[t] === 0)).length;

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
    setShareTargets([]);
    setOpen(false);
  };

  const submit = async () => {
    if (!id || !userId || !title.trim()) {
      setError('A title is required.');
      return;
    }
    setBusy(true);
    setError(null);
    // Soft resubmission guard for songs: warn (don't block) if this track was
    // already shared in the feed this cycle, matched on spotify_uri or
    // normalized title|artist. Albums are uncapped and skip this.
    if (kind === 'track' && cycle) {
      const { data: thisCycle } = await feedDb.tracksThisCycle(id, cycle.created_at);
      const key = normKey(title, artist);
      const dup = (thisCycle ?? []).some((p) => {
        const uri = (p.metadata as { spotify_uri?: string } | null)?.spotify_uri ?? null;
        if (spotifyUri && uri && uri === spotifyUri) return true;
        return normKey(p.title, p.artist) === key;
      });
      if (dup) {
        const ok = await confirmAsync(
          'Already shared this cycle',
          `“${title.trim()}” has already been posted to the feed this cycle. Post it again anyway?`,
        );
        if (!ok) {
          setBusy(false);
          return;
        }
      }
    }
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
    // Fields shared by the post in this club and any "Also post to" copies.
    const basePost = {
      author_id: userId,
      kind,
      title: title.trim(),
      artist: artist.trim(),
      url: primaryUrl,
      platform,
      note: note.trim() || null,
      is_album_suggestion: suggestion,
      metadata: Object.keys(meta).length ? meta : null,
    };
    const { data, error: err } = await feedDb.create({ ...basePost, club_id: id });
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? 'Could not post.');
      return;
    }
    await activity.publish(id, 'feed_post', {
      title: data.title,
      is_album_suggestion: suggestion,
      post_id: data.id,
    });
    // Fan out to the picked clubs as copies linked to the original. Skip clubs
    // where a song would bust the cap (server enforces too); albums are uncapped.
    const targets = shareTargets.filter((t) => !(kind === 'track' && otherQuota[t] === 0));
    for (const targetId of targets) {
      const { data: copy } = await feedDb.create({ ...basePost, club_id: targetId, origin_post_id: data.id });
      if (!copy) continue;
      await activity.publish(targetId, 'feed_post', {
        title: copy.title,
        is_album_suggestion: suggestion,
        post_id: copy.id,
      });
      if (kind === 'track') streamingDb.sync(targetId).catch(() => {});
    }
    setBusy(false);
    resetComposer();
    refresh();
    loadQuota();
    // Push to this club's cycle playlist if connected. Fire-and-forget + no-ops
    // server-side when not connected / not a track.
    if (kind === 'track') streamingDb.sync(id).catch(() => {});
  };

  if (!id) return <NoClubSelected what="feed" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing} scrollRef={scrollRef}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHAT YOU'RE HEARING</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>The Feed</Text>
        </View>
        <View style={styles.headerBtnRow}>
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

      {!open ? (
        <Button title="+ Share something" onPress={() => { setShareTargets([]); setOpen(true); }} style={{ marginBottom: 14 }} />
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
            {otherClubs.length > 0 ? (
              <View style={styles.sharePickBlock}>
                <Text style={[styles.sharePickLabel, { color: palette.text3 }]}>ALSO POST TO (OPTIONAL)</Text>
                <View style={styles.shareChips}>
                  {otherClubs.map((c) => {
                    const capReached = kind === 'track' && otherQuota[c.id] === 0;
                    const on = shareTargets.includes(c.id) && !capReached;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={capReached ? undefined : () => toggleShareTarget(c.id)}
                        disabled={capReached}
                        style={[
                          styles.shareChip,
                          { borderColor: palette.border, backgroundColor: palette.card2 },
                          on && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                          capReached && { opacity: 0.5 },
                        ]}
                      >
                        <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                        <Text
                          numberOfLines={1}
                          style={[styles.shareChipText, { color: on ? palette.teal : palette.text2 }]}
                        >
                          {c.name}
                          {capReached ? ' · capped' : ''}
                        </Text>
                        {on ? <Text style={[styles.shareChipCheck, { color: palette.teal }]}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <Button
              title={activeShareCount > 0 ? `Post & share to ${activeShareCount}` : 'Post'}
              onPress={submit}
              loading={busy}
              disabled={songBlocked}
            />
            <Button title="Cancel" variant="ghost" onPress={resetComposer} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {(() => {
        const renderPost = (post: FeedRow) => (
          <View key={post.id} onLayout={onItemLayout(post.id)}>
            <PostCard post={post} userId={userId} onChange={refresh} highlight={post.id === focus} mentionMembers={mentionMembers} shareClubs={otherClubs} />
          </View>
        );
        if (currentPosts.length === 0 && earlierPosts.length === 0) {
          return <InlineNote text="No posts yet — be the first to share what you're listening to." />;
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
        {post.is_album_suggestion ? (
          <Text style={[styles.suggBadge, { color: palette.purple, backgroundColor: palette.purpleBg }]}>
            💡 suggestion
          </Text>
        ) : null}
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
  sharePickBlock: { gap: 8, marginTop: 2 },
  sharePickLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5 },
  shareChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  shareChipText: { fontFamily: fonts.sansMedium, fontSize: 12, flexShrink: 1 },
  shareChipCheck: { fontFamily: fonts.monoMedium, fontSize: 11 },
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
