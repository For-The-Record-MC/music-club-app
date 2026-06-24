import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { resolveAppleTrack, searchSongs as searchItunes } from '@/utils/itunes';
import { resolveSpotifyTrack, searchSongs as searchSpotify } from '@/utils/spotify';

// A song picked from the catalog, with both services' links resolved so it
// opens (and syncs to playlists) everywhere. Mirrors the feed composer's shape.
export interface PickedSong {
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  spotifyUri: string | null;
  appleUrl: string | null;
}

interface Result {
  key: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  spotifyUrl: string | null;
  spotifyUri: string | null;
  appleUrl: string | null;
}

// Self-contained song type-ahead: Spotify-first search falling back to iTunes,
// with the other service's link resolved on pick. Calls onPick with the fully
// resolved song. Used by the Jukebox Showdown submission sheet (the feed has its
// own inline composer with extra album/quota concerns).
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
  const searchSeq = useRef(0);
  const pickSeq = useRef(0);

  const runSearch = async (term: string) => {
    setQuery(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
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
        }))
      : (await searchItunes(term)).map((s) => ({
          key: String(s.trackId),
          trackName: s.trackName,
          artistName: s.artistName,
          artworkUrl: s.artworkUrl,
          spotifyUrl: null,
          spotifyUri: null,
          appleUrl: s.appleUrl,
        }));
    if (seq === searchSeq.current) setResults(found);
  };

  const pick = async (r: Result) => {
    const seq = ++pickSeq.current;
    setResults([]);
    setQuery('');
    const song: PickedSong = {
      title: r.trackName,
      artist: r.artistName,
      artworkUrl: r.artworkUrl || null,
      spotifyUrl: r.spotifyUrl,
      spotifyUri: r.spotifyUri,
      appleUrl: r.appleUrl,
    };
    onPick(song);
    // Resolve the missing service's link (best-effort, guarded against a newer pick).
    if (r.spotifyUrl && !r.appleUrl) {
      const apple = await resolveAppleTrack(r.trackName, r.artistName);
      if (apple && seq === pickSeq.current) onPick({ ...song, appleUrl: apple });
    } else if (r.appleUrl && !r.spotifyUrl) {
      const match = await resolveSpotifyTrack(r.trackName, r.artistName);
      if (match && seq === pickSeq.current) onPick({ ...song, spotifyUri: match.uri, spotifyUrl: match.url });
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
