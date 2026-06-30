import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { ThemeChooser } from '@/components/ThemeChooser';
import { useCycle } from '@/hooks/useCycle';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { getAlbumTracks, resolveAppleAlbum, searchAlbums as searchItunesAlbums } from '@/utils/itunes';
import { normKey } from '@/utils/normalize';
import { resolveSpotifyAlbum, searchAlbums as searchSpotifyAlbums } from '@/utils/spotify';
import { activity, albums as albumsDb, ratings as ratingsDb } from '@/utils/supabase/db';

// One source-agnostic album result for the picker list. Search is Spotify-first
// (best catalog), falling back to iTunes; the Apple link + the iTunes track list
// are resolved on pick (the track list drives the song-level rating/notes pickers).
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

// The picker (or an admin) sets the cycle's two albums. Spotify type-ahead is
// the primary path; iTunes resolves the Apple Music link + track list so the
// album opens in both services. Manual entry is the fallback for obscure releases.
export default function PickAlbums() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { cycle, albums, refresh } = useCycle(id);
  const { palette } = useTheme();

  // Picks freeze once anyone rates: swapping an album in place would re-point its
  // existing reviews at a different record (RLS blocks the write server-side too).
  // get_album_summary surfaces the submitted count even before the reveal.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!albums.length) {
        setLocked(false);
        return;
      }
      const summaries = await Promise.all(albums.map((a) => ratingsDb.summary(a.id)));
      const anyReviews = summaries.some((s) => ((s.data as { count?: number } | null)?.count ?? 0) > 0);
      if (!cancelled) setLocked(anyReviews);
    })();
    return () => {
      cancelled = true;
    };
  }, [albums]);

  // Announce album picks once saved (max two events per cycle — fine for the feed).
  const handleSaved = async () => {
    if (cycle && id) await activity.publish(id, 'albums_set', { cycle_number: cycle.number });
    refresh();
  };

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
          {locked ? (
            <InlineNote text="Reviews are in — album picks are locked for this cycle." />
          ) : null}
          <SlotEditor slot={1} clubId={id} cycleId={cycle.id} existing={albums.find((a) => a.slot === 1)} locked={locked} onSaved={handleSaved} />
          <SlotEditor slot={2} clubId={id} cycleId={cycle.id} existing={albums.find((a) => a.slot === 2)} locked={locked} onSaved={handleSaved} />
          {id ? <ThemeChooser clubId={id} cycleId={cycle.id} /> : null}
          <Button title="Done — back to the club" variant="ghost" onPress={() => router.replace('/home')} />
        </>
      )}
    </Screen>
  );
}

function SlotEditor({
  slot,
  clubId,
  cycleId,
  existing,
  locked,
  onSaved,
}: {
  slot: 1 | 2;
  clubId: string;
  cycleId: string;
  existing?: { title: string; artist: string; year: number | null; artwork_url: string | null };
  locked: boolean;
  onSaved: () => void;
}) {
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AlbumResult[]>([]);
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
    // Spotify first (best catalog); fall back to iTunes when it's empty.
    const spotifyHits = await searchSpotifyAlbums(term);
    const found: AlbumResult[] = spotifyHits.length
      ? spotifyHits.map((a) => ({
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

  const save = async (album: {
    title: string;
    artist: string;
    year: number | null;
    artwork_url: string | null;
    itunes_collection_id: number | null;
    apple_url: string | null;
    spotify_url: string | null;
    tracks: { trackNumber: number; trackName: string }[] | null;
  }) => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    // Soft resubmission guard: warn (don't block) if the club already did this
    // album in a previous cycle. Match on normalized title|artist.
    const { data: prior } = await albumsDb.priorPicks(clubId, cycleId);
    const key = normKey(album.title, album.artist);
    const clash = (prior ?? []).find((p) => normKey(p.title, p.artist) === key) as
      | { title: string; cycles?: { number?: number } | null }
      | undefined;
    if (clash) {
      const num = clash.cycles?.number;
      const ok = await confirmAsync(
        'Already done',
        `“${album.title}” was already a club pick${num ? ` in Cycle ${num}` : ''}. Pick it again anyway?`,
      );
      if (!ok) {
        setBusy(false);
        return;
      }
    }
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
      spotify_url: album.spotify_url,
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

  const pickResult = async (r: AlbumResult) => {
    setBusy(true);
    // Fill in whichever links/tracks the search source didn't provide, so the
    // album opens in both services and carries an iTunes track list (for the
    // song-level rating/notes pickers). All best-effort — a miss never blocks.
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

    save({
      title: r.title,
      artist: r.artist,
      year: r.year,
      artwork_url: r.artworkUrl || null,
      itunes_collection_id: collectionId,
      apple_url: appleUrl,
      spotify_url: spotifyUrl,
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
      spotify_url: null,
      tracks: null,
    });
  };

  return (
    <>
      <Label>Album {slot}</Label>
      <Card>
        {existing && (!editing || locked) ? (
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
            {locked ? null : <Button title="Change" variant="ghost" onPress={() => setEditing(true)} />}
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
                    key={r.key}
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
                        {r.title}
                      </Text>
                      <Text numberOfLines={1} style={[styles.resultArtist, { color: palette.text2 }]}>
                        {r.artist}
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
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
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
