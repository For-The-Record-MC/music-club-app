import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/ui';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { resolveAppleTrack, searchSongs as searchItunes } from '@/utils/itunes';
import { searchSongs as searchSpotify } from '@/utils/spotify';

// A song picked from the catalog, with both services' links resolved so it
// opens (and syncs to playlists) everywhere. Mirrors the feed composer's shape.
export interface PickedSong {
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  spotifyUri: string | null;
  appleUrl: string | null;
  // Spotify-sourced extras (null when the pick came from iTunes). Listening
  // Bingo uses durationMs for its listen gate and spotifyId for dedup.
  spotifyId: string | null;
  durationMs: number | null;
}

interface Result {
  key: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  spotifyUrl: string | null;
  spotifyUri: string | null;
  appleUrl: string | null;
  spotifyId: string | null;
  durationMs: number | null;
}

// Self-contained song type-ahead: Spotify-first search (best catalog/ranking)
// falling back to iTunes when Spotify is empty — which includes a budget/bench
// denial from spotify-search (it returns [], so a capped hour silently becomes
// the iTunes experience instead of a dead search box). Debounced since
// 2026-07-12: per-keystroke calls drained the shared Spotify budget
// (context/spotify-api.md). The missing service's side resolves on pick — for
// iTunes-sourced picks that's ONE Spotify search restoring url/uri/id/duration
// (Bingo's listen gate + dedup). Calls onPick with the song, then again as
// extras resolve. Used by Jukebox Showdown and Listening Bingo (the feed has
// its own inline composer with extra album/quota concerns).
export function SongSearchField({
  placeholder = 'Search a song… (e.g. Dreams Fleetwood Mac)',
  onPick,
}: {
  placeholder?: string;
  onPick: (song: PickedSong) => void;
}) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const search = useDebouncedSearch();
  const pickSeq = useRef(0);

  const runSearch = (term: string) => {
    setQuery(term);
    if (term.trim().length < 3) {
      search.cancel();
      setResults([]);
      return;
    }
    search.schedule(async (isCurrent) => {
      const spotifyHits = await searchSpotify(term);
      const found: Result[] = spotifyHits.length
        ? spotifyHits.map((s) => ({
            key: s.id,
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            spotifyUrl: s.spotifyUrl,
            spotifyUri: s.uri,
            appleUrl: null,
            spotifyId: s.id,
            durationMs: s.durationMs ?? null,
          }))
        : (await searchItunes(term)).map((s) => ({
            key: String(s.trackId),
            trackName: s.trackName,
            artistName: s.artistName,
            artworkUrl: s.artworkUrl,
            spotifyUrl: null,
            spotifyUri: null,
            appleUrl: s.appleUrl,
            spotifyId: null,
            durationMs: null,
          }));
      if (isCurrent()) setResults(found);
    });
  };

  const pick = async (r: Result) => {
    const seq = ++pickSeq.current;
    search.cancel();
    setResults([]);
    setQuery('');
    const song: PickedSong = {
      title: r.trackName,
      artist: r.artistName,
      artworkUrl: r.artworkUrl || null,
      spotifyUrl: r.spotifyUrl,
      spotifyUri: r.spotifyUri,
      appleUrl: r.appleUrl,
      spotifyId: r.spotifyId,
      durationMs: r.durationMs,
    };
    onPick(song);
    // Resolve the missing service's side (best-effort, guarded against a newer
    // pick). iTunes picks take one full Spotify hit — not just links, since
    // Bingo needs durationMs (listen gate) and spotifyId (dedup) too.
    if (r.spotifyUrl && !r.appleUrl) {
      const apple = await resolveAppleTrack(r.trackName, r.artistName);
      if (apple && seq === pickSeq.current) onPick({ ...song, appleUrl: apple });
    } else if (r.appleUrl && !r.spotifyUrl) {
      const term = `${r.trackName} ${r.artistName}`.trim();
      const match = (await searchSpotify(term))[0];
      if (match && seq === pickSeq.current) {
        onPick({
          ...song,
          spotifyUrl: match.spotifyUrl,
          spotifyUri: match.uri,
          spotifyId: match.id,
          durationMs: match.durationMs ?? null,
        });
      }
    }
  };

  return (
    <View>
      <TextField placeholder={placeholder} value={query} onChangeText={runSearch} autoCorrect={false} />
      {results.map((r) => (
        <Pressable
          key={r.key}
          onPress={() => pick(r)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? palette.card2 : 'transparent' }]}
        >
          {r.artworkUrl ? (
            <Image source={{ uri: r.artworkUrl }} style={styles.art} contentFit="cover" />
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.title, { color: palette.text1 }]}>{r.trackName}</Text>
            <Text numberOfLines={1} style={[styles.artist, { color: palette.text2 }]}>{r.artistName}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  art: { width: 40, height: 40, borderRadius: radius.sm },
  title: { fontFamily: fonts.sansMedium, fontSize: 14 },
  artist: { fontFamily: fonts.sans, fontSize: 11 },
});
