import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { getAlbumTracks, resolveAppleAlbum, searchAlbums as searchItunesAlbums } from '@/utils/itunes';
import { resolveSpotifyAlbum, searchAlbums as searchSpotifyAlbums } from '@/utils/spotify';
import { archive as archiveDb, type ArchiveAlbum } from '@/utils/supabase/db';
import type { Json } from '@/utils/supabase/database.types';

// Source-agnostic album result, same shape the cycle picker uses.
interface AlbumResult {
  key: string;
  title: string;
  artist: string;
  year: number | null;
  artworkUrl: string;
  spotifyUrl: string | null;
  appleUrl: string | null;
  itunesCollectionId: number | null;
}

// Admin-only: add albums the club listened to before the app ("The Archive").
// Search is Spotify-first (best catalog), falling back to iTunes; the Apple link
// + iTunes track list are resolved on pick. Members claim & review these from
// the History tab; this screen is just the curation surface.
export default function ArchiveAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const { myRole } = useClubData(id);
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const [items, setItems] = useState<ArchiveAlbum[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AlbumResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!id) return;
    const { data } = await archiveDb.list(id);
    setItems((data ?? []) as unknown as ArchiveAlbum[]);
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);
  const { refreshing, onRefresh } = useRefresh(refresh);

  const runSearch = async (term: string) => {
    setQuery(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const spotify = await searchSpotifyAlbums(term);
    const found: AlbumResult[] = spotify.length
      ? spotify.map((a) => ({
          key: a.id,
          title: a.collectionName,
          artist: a.artistName,
          year: a.year,
          artworkUrl: a.artworkUrl,
          spotifyUrl: a.spotifyUrl,
          appleUrl: null,
          itunesCollectionId: null,
        }))
      : (await searchItunesAlbums(term)).map((a) => ({
          key: String(a.collectionId),
          title: a.collectionName,
          artist: a.artistName,
          year: a.year,
          artworkUrl: a.artworkUrl,
          spotifyUrl: null,
          appleUrl: a.appleUrl || null,
          itunesCollectionId: a.collectionId,
        }));
    if (seq === searchSeq.current) setResults(found);
  };

  const add = async (r: AlbumResult) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    // Best-effort fill of the cross-service link + iTunes track list.
    let appleUrl = r.appleUrl;
    let spotifyUrl = r.spotifyUrl;
    let collectionId = r.itunesCollectionId;
    if (!appleUrl || collectionId == null) {
      const apple = await resolveAppleAlbum(r.title, r.artist);
      appleUrl = appleUrl ?? apple?.appleUrl ?? null;
      collectionId = collectionId ?? apple?.collectionId ?? null;
    }
    if (!spotifyUrl) {
      spotifyUrl = (await resolveSpotifyAlbum(r.title, r.artist))?.url ?? null;
    }
    const tracks = collectionId != null ? await getAlbumTracks(collectionId) : [];

    const { error: err } = await archiveDb.add(id, {
      title: r.title,
      artist: r.artist,
      year: r.year,
      artworkUrl: r.artworkUrl || null,
      spotifyUrl,
      appleUrl,
      tracks: tracks.length ? (tracks as unknown as Json) : null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setQuery('');
    setResults([]);
    refresh();
  };

  const remove = async (a: ArchiveAlbum) => {
    if (await confirmAsync('Remove album', `Remove “${a.title}” from the Archive? Its reviews go too.`)) {
      await archiveDb.remove(a.id);
      refresh();
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>BEFORE THE CLUB</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>The Archive</Text>
        </View>
      </View>

      {!isAdmin ? (
        <InlineNote text="Only club admins can curate the Archive." />
      ) : (
        <>
          <Label>Add an album</Label>
          <Card style={{ marginBottom: 14 }}>
            <View style={{ gap: 10 }}>
              <TextField
                placeholder="Search albums… (e.g. In Rainbows)"
                value={query}
                onChangeText={runSearch}
                autoCorrect={false}
              />
              {results.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => add(r)}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.resultRow,
                    { backgroundColor: pressed ? palette.card2 : 'transparent' },
                  ]}
                >
                  {r.artworkUrl ? (
                    <Image source={{ uri: r.artworkUrl }} style={styles.resultArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.resultArt, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                      <Text style={{ fontSize: 18 }}>🎵</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>
                      {r.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>
                      {r.artist}
                      {r.year ? ` · ${r.year}` : ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {error ? <InlineNote text={error} tone="error" /> : null}
            </View>
          </Card>

          <Label>In the Archive ({items.length})</Label>
          {items.length === 0 ? (
            <InlineNote text="Nothing here yet — search above to add the club's pre-app albums." />
          ) : (
            items.map((a) => (
              <Card key={a.id} style={{ marginBottom: 8 }}>
                <View style={styles.itemRow}>
                  {a.artwork_url ? (
                    <Image source={{ uri: a.artwork_url }} style={styles.itemArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.itemArt, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                      <Text style={{ fontSize: 18 }}>🎵</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>
                      {a.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>
                      {a.artist}
                      {a.claimer ? ` · ${a.claimer.display_name ?? 'claimed'}` : ' · unclaimed'}
                    </Text>
                  </View>
                  <Button title="Remove" variant="ghost" onPress={() => remove(a)} />
                </View>
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  resultArt: { width: 40, height: 40, borderRadius: radius.sm },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontFamily: fonts.sansMedium, fontSize: 13 },
  resultArtist: { fontFamily: fonts.sans, fontSize: 11 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemArt: { width: 48, height: 48, borderRadius: radius.sm },
});
