import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useCycle } from '@/hooks/useCycle';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import { getAlbumTracks, searchAlbums, type ItunesAlbum } from '@/utils/itunes';
import { albums as albumsDb } from '@/utils/supabase/db';

// The picker (or an admin) sets the cycle's two albums. iTunes type-ahead is
// the primary path (artwork, year, track list for Phase 3 song pickers);
// manual entry is the fallback for obscure releases.
export default function PickAlbums() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { cycle, albums, refresh } = useCycle(id);
  const { palette } = useTheme();

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>
            {cycle ? `CYCLE ${cycle.number}` : ''}
          </Text>
          <Text style={[styles.title, { color: palette.text1 }]}>Pick two albums</Text>
        </View>
      </View>
      {!cycle ? (
        <InlineNote text="No open cycle — spin the wheel first." />
      ) : (
        <>
          <SlotEditor slot={1} cycleId={cycle.id} existing={albums.find((a) => a.slot === 1)} onSaved={refresh} />
          <SlotEditor slot={2} cycleId={cycle.id} existing={albums.find((a) => a.slot === 2)} onSaved={refresh} />
          <Button title="Done — back to the club" variant="ghost" onPress={() => router.replace(`/club/${id}`)} />
        </>
      )}
    </Screen>
  );
}

function SlotEditor({
  slot,
  cycleId,
  existing,
  onSaved,
}: {
  slot: 1 | 2;
  cycleId: string;
  existing?: { title: string; artist: string; year: number | null; artwork_url: string | null };
  onSaved: () => void;
}) {
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItunesAlbum[]>([]);
  const [manual, setManual] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mArtist, setMArtist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const runSearch = async (term: string) => {
    setQuery(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const found = await searchAlbums(term);
    if (seq === searchSeq.current) setResults(found);
  };

  const save = async (album: {
    title: string;
    artist: string;
    year: number | null;
    artwork_url: string | null;
    itunes_collection_id: number | null;
    apple_url: string | null;
    tracks: { trackNumber: number; trackName: string }[] | null;
  }) => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await albumsDb.upsert({
      cycle_id: cycleId,
      slot,
      set_by: userId,
      title: album.title,
      artist: album.artist,
      year: album.year,
      artwork_url: album.artwork_url,
      itunes_collection_id: album.itunes_collection_id,
      apple_url: album.apple_url,
      tracks: album.tracks,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditing(false);
    setQuery('');
    setResults([]);
    setManual(false);
    onSaved();
  };

  const pickResult = async (r: ItunesAlbum) => {
    const tracks = await getAlbumTracks(r.collectionId);
    save({
      title: r.collectionName,
      artist: r.artistName,
      year: r.year,
      artwork_url: r.artworkUrl || null,
      itunes_collection_id: r.collectionId,
      apple_url: r.appleUrl || null,
      tracks: tracks.length ? tracks : null,
    });
  };

  const saveManual = () => {
    if (!mTitle.trim()) {
      setError('Album title is required.');
      return;
    }
    save({
      title: mTitle.trim(),
      artist: mArtist.trim(),
      year: null,
      artwork_url: null,
      itunes_collection_id: null,
      apple_url: null,
      tracks: null,
    });
  };

  return (
    <>
      <Label>Album {slot}</Label>
      <Card>
        {existing && !editing ? (
          <View style={styles.existingRow}>
            {existing.artwork_url ? (
              <Image source={{ uri: existing.artwork_url }} style={styles.art} contentFit="cover" />
            ) : (
              <View style={[styles.art, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                <Text style={{ fontSize: 24 }}>🎵</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.albumTitle, { color: palette.text1 }]}>{existing.title}</Text>
              <Text style={[styles.albumArtist, { color: palette.text2 }]}>
                {existing.artist}
                {existing.year ? ` · ${existing.year}` : ''}
              </Text>
            </View>
            <Button title="Change" variant="ghost" onPress={() => setEditing(true)} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {!manual ? (
              <>
                <TextField
                  placeholder="Search albums… (e.g. Rumours)"
                  value={query}
                  onChangeText={runSearch}
                  autoCorrect={false}
                />
                {results.map((r) => (
                  <Pressable
                    key={r.collectionId}
                    onPress={() => pickResult(r)}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.resultRow,
                      { backgroundColor: pressed ? palette.card2 : 'transparent' },
                    ]}
                  >
                    <Image source={{ uri: r.artworkUrl }} style={styles.resultArt} contentFit="cover" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.resultTitle, { color: palette.text1 }]}>
                        {r.collectionName}
                      </Text>
                      <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>
                        {r.artistName}
                        {r.year ? ` · ${r.year}` : ''}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                <Button title="Can't find it? Enter manually" variant="ghost" onPress={() => setManual(true)} />
              </>
            ) : (
              <>
                <TextField placeholder="Album title" value={mTitle} onChangeText={setMTitle} />
                <TextField placeholder="Artist" value={mArtist} onChangeText={setMArtist} />
                <Button title="Save album" onPress={saveManual} loading={busy} />
                <Button title="Back to search" variant="ghost" onPress={() => setManual(false)} />
              </>
            )}
            {existing ? (
              <Button title="Cancel" variant="ghost" onPress={() => setEditing(false)} />
            ) : null}
          </View>
        )}
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  existingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 56, height: 56, borderRadius: radius.md },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  albumTitle: { fontFamily: fonts.sansBold, fontSize: 14, marginBottom: 2 },
  albumArtist: { fontFamily: fonts.sans, fontSize: 12 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 6,
    borderRadius: radius.md,
  },
  resultArt: { width: 40, height: 40, borderRadius: radius.sm },
  resultTitle: { fontFamily: fonts.sansMedium, fontSize: 13 },
  resultArtist: { fontFamily: fonts.sans, fontSize: 11 },
});
