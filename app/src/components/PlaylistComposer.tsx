import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MentionInput, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Button, Card, InlineNote, Label, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { activity, feed as feedDb } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

// Best-effort playlist name + cover from the platform's public oEmbed endpoint
// (keyless; Spotify's definitely exists, Apple's is tried and tolerated if it
// doesn't). Any failure just means the member names the playlist themselves.
async function fetchPlaylistMeta(link: string): Promise<{ title: string | null; artwork: string | null }> {
  const endpoints = /open\.spotify\.com/i.test(link)
    ? [`https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`]
    : /music\.apple\.com/i.test(link)
      ? [`https://music.apple.com/api/oembed?url=${encodeURIComponent(link)}`]
      : [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) continue;
      const j = (await res.json()) as { title?: string; thumbnail_url?: string };
      return { title: j.title ?? null, artwork: j.thumbnail_url ?? null };
    } catch {
      // fall through — manual name entry still works
    }
  }
  return { title: null, artwork: null };
}

// Playlist sharing: paste a playlist link, add a comment if you like, done.
// Posts a kind='playlist' feed row — Club Radio's Playlists tab lists those;
// they never count against the song quota or sync to the cycle playlist.
//
// Split in two: PlaylistForm is just the fields + submit (embedded by both the
// Playlists tab and Home's ShareComposer as its third kind); PlaylistComposer
// wraps it behind the tab's "+ Share a playlist" button. State resets by
// unmount — parents close the form on post/cancel.
export function PlaylistForm({
  clubId,
  onPosted,
  onCancel,
}: {
  clubId: string;
  onPosted?: () => void;
  onCancel: () => void;
}) {
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);

  // Member list for @-mentions in the comment field.
  const { members } = useClubData(clubId);
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

  const [link, setLink] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [artwork, setArtwork] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metaSeq = useRef(0);
  // Tracks whether `name` came from oEmbed, so a new link can overwrite an
  // auto-filled name but never one the member typed.
  const autoNamed = useRef(false);

  const onLinkChange = (t: string) => {
    setLink(t);
    setArtwork(null);
    const trimmed = t.trim();
    const seq = ++metaSeq.current;
    if (!/^https?:\/\//i.test(trimmed)) return;
    fetchPlaylistMeta(trimmed).then((m) => {
      if (seq !== metaSeq.current) return;
      if (m.title && (autoNamed.current || !name.trim())) {
        setName(m.title);
        autoNamed.current = true;
      }
      if (m.artwork) setArtwork(m.artwork);
    });
  };

  const submit = async () => {
    const url = link.trim();
    if (!clubId || !userId) return;
    if (!/^https?:\/\//i.test(url)) {
      setError('Paste a playlist link (it should start with http).');
      return;
    }
    setBusy(true);
    setError(null);
    const platform = /spotify\.com/i.test(url) ? 'spotify' : /music\.apple\.com/i.test(url) ? 'apple' : 'other';
    const title =
      name.trim() ||
      (platform === 'spotify' ? 'Spotify playlist' : platform === 'apple' ? 'Apple Music playlist' : 'Shared playlist');
    const { data, error: err } = await feedDb.create({
      club_id: clubId,
      author_id: userId,
      kind: 'playlist',
      title,
      artist: '',
      url,
      platform,
      note: note.trim() || null,
      is_album_suggestion: false,
      metadata: artwork ? { artwork } : null,
    });
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? 'Could not post.');
      return;
    }
    await activity.publish(clubId, 'feed_post', {
      title: data.title,
      is_album_suggestion: false,
      post_id: data.id,
    });
    // Anyone @-mentioned in the comment gets the targeted mention notification;
    // its deep link opens this post (the Playlists tab picks it up by kind).
    const tagged = resolveMentions(note, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(clubId, tagged, {
          context: 'feed',
          post_id: data.id,
          snippet: note.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
    onPosted?.();
  };

  return (
    <View>
      <Text style={[styles.hint, { color: palette.text3 }]}>
        Paste a link from Spotify, Apple Music, or anywhere else.
      </Text>
      <View style={{ gap: 8 }}>
        <TextField
          placeholder="Paste a playlist link…"
          value={link}
          onChangeText={onLinkChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {artwork || name ? (
          <View style={styles.previewRow}>
            {artwork ? <Image source={{ uri: artwork }} style={styles.previewArt} contentFit="cover" /> : null}
            <Text numberOfLines={2} style={[styles.previewName, { color: palette.text1 }]}>
              {name || 'Playlist'}
            </Text>
          </View>
        ) : null}
        <TextField placeholder="Playlist name (optional)" value={name} onChangeText={(t) => { setName(t); autoNamed.current = false; }} />
        <MentionInput
          placeholder="A comment — what's on it, when to play it… (@ to tag)"
          value={note}
          onChangeText={setNote}
          members={mentionMembers}
          multiline
          style={{ minHeight: 60, textAlignVertical: 'top' }}
        />
        <Button title="Share playlist" onPress={submit} loading={busy} disabled={!link.trim()} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </View>
    </View>
  );
}

// The Playlists tab's "+ Share a playlist" button wrapping the form in a card.
export function PlaylistComposer({ clubId, onPosted }: { clubId: string; onPosted?: () => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return <Button title="+ Share a playlist" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />;
  }

  return (
    <Card>
      <Label>Share a playlist</Label>
      <PlaylistForm
        clubId={clubId}
        onPosted={() => {
          setOpen(false);
          onPosted?.();
        }}
        onCancel={() => setOpen(false)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  previewArt: { width: 44, height: 44, borderRadius: radius.sm },
  previewName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 14 },
});
