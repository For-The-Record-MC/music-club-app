import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, ListenLinks, Screen, TextField } from '@/components/ui';
import { useCycle } from '@/hooks/useCycle';
import { useRefresh } from '@/hooks/useRefresh';
import { useSuggestions } from '@/hooks/useSuggestions';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import { resolveAppleAlbum, searchAlbums as searchItunesAlbums } from '@/utils/itunes';
import { resolveSpotifyAlbum, searchAlbums as searchSpotifyAlbums } from '@/utils/spotify';
import { activity, feed } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

interface AlbumPick {
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  appleUrl: string | null;
}

// The Queue — the album-suggestion backlog. The picker draws from this when their
// spin comes up. Album suggestions live only here (not in Club Radio).
export default function Queue() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle } = useCycle(id);
  const { suggestions, refresh } = useSuggestions(id);
  const { refreshing, onRefresh } = useRefresh(refresh);

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<AlbumPick | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AlbumPick[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const pickSeq = useRef(0);

  const isPicker = cycle?.picker_id === userId;

  const runSearch = async (term: string) => {
    setQuery(term);
    const s = ++seq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const spotify = await searchSpotifyAlbums(term);
    const mapped: AlbumPick[] = spotify.length
      ? spotify.map((a) => ({ title: a.collectionName, artist: a.artistName, artworkUrl: a.artworkUrl || null, spotifyUrl: a.spotifyUrl || null, appleUrl: null }))
      : (await searchItunesAlbums(term)).map((a) => ({ title: a.collectionName, artist: a.artistName, artworkUrl: a.artworkUrl || null, spotifyUrl: null, appleUrl: a.appleUrl || null }));
    if (s === seq.current) setResults(mapped);
  };

  const pick = async (a: AlbumPick) => {
    const s = ++pickSeq.current;
    setPicked(a);
    setResults([]);
    setQuery('');
    // Resolve the other service's link so the suggestion opens in both.
    if (a.spotifyUrl && !a.appleUrl) {
      const apple = (await resolveAppleAlbum(a.title, a.artist))?.appleUrl ?? null;
      if (apple && s === pickSeq.current) setPicked((p) => (p ? { ...p, appleUrl: apple } : p));
    } else if (a.appleUrl && !a.spotifyUrl) {
      const match = await resolveSpotifyAlbum(a.title, a.artist);
      if (match && s === pickSeq.current) setPicked((p) => (p ? { ...p, spotifyUrl: match.url } : p));
    }
  };

  const reset = () => {
    setPicked(null);
    setQuery('');
    setResults([]);
    setNote('');
    setError(null);
    setOpen(false);
  };

  const submit = async () => {
    if (!id || !userId || !picked) {
      setError('Pick an album.');
      return;
    }
    setBusy(true);
    setError(null);
    const meta = {
      ...(picked.artworkUrl ? { artwork: picked.artworkUrl } : {}),
      ...(picked.spotifyUrl ? { spotify_url: picked.spotifyUrl } : {}),
      ...(picked.appleUrl ? { apple_url: picked.appleUrl } : {}),
    };
    const { data, error: err } = await feed.create({
      club_id: id,
      author_id: userId,
      kind: 'album',
      title: picked.title,
      artist: picked.artist,
      url: picked.spotifyUrl ?? picked.appleUrl ?? null,
      platform: picked.spotifyUrl ? 'spotify' : picked.appleUrl ? 'apple' : 'other',
      note: note.trim() || null,
      is_album_suggestion: true,
      metadata: Object.keys(meta).length ? meta : null,
    });
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? 'Could not add.');
      return;
    }
    await activity.publish(id, 'feed_post', { title: data.title, is_album_suggestion: true, post_id: data.id });
    setBusy(false);
    reset();
    refresh();
  };

  const remove = async (postId: string) => {
    if (await confirmAsync('Remove from queue', 'Take this album suggestion off the queue?')) {
      await feed.remove(postId);
      refresh();
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>ALBUMS UP NEXT</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>💿 The Queue</Text>
        </View>
      </View>

      {isPicker ? (
        <InlineNote text="Your spin! Draw from these when you pick this cycle's albums." tone="success" />
      ) : null}

      {!open ? (
        <Button title="+ Queue an album" onPress={() => setOpen(true)} style={{ marginVertical: 12 }} />
      ) : (
        <Card>
          <Label>Search an album</Label>
          {picked ? (
            <View style={styles.pickedRow}>
              {picked.artworkUrl ? <Image source={{ uri: picked.artworkUrl }} style={styles.art} contentFit="cover" /> : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{picked.title}</Text>
                <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text2 }]}>{picked.artist}</Text>
              </View>
              <Pressable onPress={() => setPicked(null)} hitSlop={8}>
                <Text style={{ color: palette.text3, fontSize: 18 }}>×</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <TextField placeholder="Search an album… (e.g. Rumours)" value={query} onChangeText={runSearch} autoCorrect={false} />
              {results.map((a, i) => (
                <Pressable key={`${a.title}-${i}`} onPress={() => pick(a)} style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}>
                  {a.artworkUrl ? <Image source={{ uri: a.artworkUrl }} style={styles.art} contentFit="cover" /> : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{a.title}</Text>
                    <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text2 }]}>{a.artist}</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
          <View style={{ marginTop: 10, gap: 8 }}>
            <TextField
              placeholder="Why this one? (optional)"
              value={note}
              onChangeText={setNote}
              multiline
              style={{ minHeight: 56, textAlignVertical: 'top' }}
            />
            <Button title="Add to queue" onPress={submit} loading={busy} disabled={!picked} />
            <Button title="Cancel" variant="ghost" onPress={reset} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {suggestions.length === 0 ? (
        <InlineNote text="Nothing queued yet — add an album the club should hear." />
      ) : (
        suggestions.map((s) => {
          const meta = (s.metadata ?? {}) as { artwork?: string; spotify_url?: string; apple_url?: string };
          return (
            <Card key={s.id}>
              <View style={styles.row}>
                {meta.artwork ? (
                  <Image source={{ uri: meta.artwork }} style={styles.art} contentFit="cover" />
                ) : (
                  <Avatar name={s.profiles?.display_name ?? null} colorIndex={s.profiles?.avatar_color ?? 0} imageUrl={s.profiles?.avatar_url} size={44} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.sTitle, { color: palette.text1 }]}>{s.title}</Text>
                  {s.artist ? <Text numberOfLines={1} style={[styles.sArtist, { color: palette.text2 }]}>{s.artist}</Text> : null}
                  <View style={styles.byline}>
                    <Avatar name={s.profiles?.display_name ?? null} colorIndex={s.profiles?.avatar_color ?? 0} imageUrl={s.profiles?.avatar_url} size={16} />
                    <Text numberOfLines={1} style={[styles.sMeta, { color: palette.text3 }]}>
                      {s.profiles?.display_name ?? 'Someone'} · {timeAgo(s.created_at)}
                    </Text>
                  </View>
                </View>
                {s.author_id === userId ? (
                  <Pressable onPress={() => remove(s.id)} hitSlop={6}>
                    <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
                  </Pressable>
                ) : null}
              </View>
              {s.note ? <Text style={[styles.sNote, { color: palette.text2 }]}>{s.note}</Text> : null}
              <ListenLinks apple={meta.apple_url ?? null} spotify={meta.spotify_url ?? null} other={meta.spotify_url || meta.apple_url ? null : s.url} style={{ marginTop: 8 }} />
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 44, height: 44, borderRadius: radius.sm },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, marginTop: 8, borderRadius: radius.md },
  sTitle: { fontFamily: fonts.sansBold, fontSize: 14 },
  sArtist: { fontFamily: fonts.sans, fontSize: 12 },
  sMeta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  sNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginTop: 8 },
});
