import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo, useRef, useState } from 'react';

import { Avatar, Button, Card, InlineNote, Label, ListenButton, ListenLinks, Loading, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { usePerfectPlaylist } from '@/hooks/usePerfectPlaylist';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { confirmAsync } from '@/utils/confirm';
import { searchSongs as searchItunes } from '@/utils/itunes';
import { memberName } from '@/utils/memberName';
import { searchSongs as searchSpotify } from '@/utils/spotify';
import { perfectPlaylist, streaming } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

export interface SongPick {
  title: string;
  artist: string;
  artworkUrl: string | null;
  spotifyUrl: string | null;
  appleUrl: string | null;
}

export default function PerfectPlaylistScreen() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle, loading: cycleLoading } = useCycle(id);
  const { members, myRole } = useClubData(id);
  const { playlist, loading, refresh } = usePerfectPlaylist(cycle?.id);
  const { refreshing, onRefresh } = useRefresh(refresh);

  const [theme, setTheme] = useState('');
  const [seed, setSeed] = useState<SongPick | null>(null);
  const [adding, setAdding] = useState<SongPick | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cycleOpen = cycle?.status === 'open';
  const isPicker = !!cycle && cycle.picker_id === userId;
  const canKickoff = (isPicker || myRole === 'owner' || myRole === 'admin') && cycleOpen;
  const pickerName = useMemo(() => {
    const m = members.find((mm) => mm.profile_id === cycle?.picker_id);
    return memberName(m?.profiles?.display_name, m?.profiles?.email);
  }, [members, cycle?.picker_id]);

  const songs = useMemo(
    () => [...(playlist?.perfect_playlist_songs ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [playlist],
  );
  const mySongs = songs.filter((s) => s.profile_id === userId).length;
  const contributors = new Set(songs.map((s) => s.profile_id)).size;

  const startPlaylist = async () => {
    if (!cycle || !theme.trim() || !seed) {
      setError('Set a theme and a seed song.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await perfectPlaylist.start(cycle.id, theme, seed);
    if (err) {
      setBusy(false);
      setError(err.message ?? 'Could not start.');
      return;
    }
    setBusy(false);
    setTheme('');
    setSeed(null);
    refresh();
    if (id) streaming.syncPerfect(id).catch(() => {});
  };

  const addSong = async () => {
    if (!playlist || !adding) return;
    setBusy(true);
    setError(null);
    const { error: err } = await perfectPlaylist.addSong(playlist.id, adding);
    if (err) {
      setBusy(false);
      setError(err.message ?? 'Could not add.');
      return;
    }
    setBusy(false);
    setAdding(null);
    refresh();
    if (id) streaming.syncPerfect(id).catch(() => {});
  };

  const removeSong = async (songId: string) => {
    if (await confirmAsync('Remove song', 'Take this song off the playlist?')) {
      await perfectPlaylist.removeSong(songId);
      refresh();
    }
  };

  if (!id) return <NoClubSelected what="playlist" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>BUILD ONE PLAYLIST, TOGETHER</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎶 The Perfect Playlist</Text>
        </View>
      </View>

      {loading || cycleLoading ? <Loading /> : (
      <>
      {!cycle ? (
        <InlineNote text="No open cycle yet — the playlist starts when a cycle opens." />
      ) : !playlist ? (
        canKickoff ? (
          <Card>
            <Label>Set the vibe</Label>
            <TextField
              placeholder="Theme — e.g. Roadtrip, Beach Day, Summer BBQ"
              value={theme}
              onChangeText={setTheme}
              maxLength={140}
            />
            <View style={{ marginTop: 12 }}>
              <Label>Seed song (counts as your 1st of 3)</Label>
            </View>
            <SongSearch picked={seed} onPick={setSeed} placeholder="Search the first song…" />
            <View style={{ gap: 8, marginTop: 14 }}>
              <Button title="Start the playlist" onPress={startPlaylist} loading={busy} disabled={!theme.trim() || !seed} />
              {error ? <InlineNote text={error} tone="error" /> : null}
            </View>
          </Card>
        ) : (
          <InlineNote text={`Not started yet — waiting on ${pickerName} to set the theme.`} />
        )
      ) : (
        <>
          <Card>
            <Text style={[styles.eyebrow, { color: palette.text3 }]}>THIS CYCLE'S VIBE</Text>
            <View style={styles.themeRow}>
              <Text style={[styles.theme, { color: palette.text1 }]}>{playlist.theme_text}</Text>
              {playlist.spotify_playlist_url ? (
                <Pressable
                  onPress={() => Linking.openURL(playlist.spotify_playlist_url!)}
                  style={({ pressed }) => [styles.playBtn, { backgroundColor: palette.spotify }, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.playCircle}>
                    <Text style={[styles.playIcon, { color: palette.spotify }]}>▶</Text>
                  </View>
                  <Text style={styles.playText}>Open</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={[styles.meta, { color: palette.text3 }]}>
              {songs.length} song{songs.length === 1 ? '' : 's'} · {contributors} contributor{contributors === 1 ? '' : 's'}
            </Text>
          </Card>

          {cycleOpen ? (
            mySongs < 3 ? (
              adding ? (
                <Card>
                  <Label>Add a song ({mySongs}/3 used)</Label>
                  <SongSearch picked={adding} onPick={setAdding} placeholder="Search a song that fits the vibe…" />
                  <View style={{ gap: 8, marginTop: 12 }}>
                    <Button title="Add to playlist" onPress={addSong} loading={busy} disabled={!adding.title} />
                    <Button title="Cancel" variant="ghost" onPress={() => { setAdding(null); setError(null); }} />
                    {error ? <InlineNote text={error} tone="error" /> : null}
                  </View>
                </Card>
              ) : (
                <Button
                  title={`+ Add your song (${mySongs}/3)`}
                  onPress={() => setAdding({ title: '', artist: '', artworkUrl: null, spotifyUrl: null, appleUrl: null })}
                  style={{ marginBottom: 14 }}
                />
              )
            ) : (
              <InlineNote text="You've added all 3 of your songs 🎉" />
            )
          ) : (
            <InlineNote text="This cycle closed — the playlist is locked in." />
          )}

          {songs.map((s) => {
            const m = s.profiles;
            const mine = s.profile_id === userId;
            return (
              <Card key={s.id}>
                <View style={styles.songRow}>
                  {s.artwork_url ? <Image source={{ uri: s.artwork_url }} style={styles.songArt} contentFit="cover" /> : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>{s.title}</Text>
                    {s.artist ? <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>{s.artist}</Text> : null}
                    <View style={styles.byRow}>
                      <Avatar name={m?.display_name ?? null} colorIndex={m?.avatar_color ?? 0} imageUrl={m?.avatar_url ?? null} size={16} />
                      <Text style={[styles.byName, { color: palette.text3 }]}>{memberName(m?.display_name, m?.email)}</Text>
                    </View>
                  </View>
                  <ListenButton apple={s.apple_url} spotify={s.spotify_url} />
                  {mine && cycleOpen ? (
                    <Pressable onPress={() => removeSong(s.id)} hitSlop={6}>
                      <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
                <ListenLinks apple={s.apple_url} spotify={s.spotify_url} other={null} style={{ marginTop: 8 }} />
              </Card>
            );
          })}
        </>
      )}
      </>
      )}
    </Screen>
  );
}

// Single song search (Spotify first, iTunes fallback) used for the seed + adds.
function SongSearch({ picked, onPick, placeholder }: { picked: SongPick | null; onPick: (s: SongPick) => void; placeholder: string }) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongPick[]>([]);
  const seq = useRef(0);

  const run = async (term: string) => {
    setQuery(term);
    const s = ++seq.current;
    if (term.trim().length < 3) {
      setResults([]);
      return;
    }
    const spotify = await searchSpotify(term);
    const mapped: SongPick[] = spotify.length
      ? spotify.map((t) => ({ title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl || null, spotifyUrl: t.spotifyUrl || null, appleUrl: null }))
      : (await searchItunes(term)).map((t) => ({ title: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl || null, spotifyUrl: null, appleUrl: t.appleUrl || null }));
    if (s === seq.current) setResults(mapped);
  };

  if (picked && picked.title) {
    return (
      <View style={[styles.pickedSong, { borderColor: palette.border }]}>
        {picked.artworkUrl ? <Image source={{ uri: picked.artworkUrl }} style={styles.resultArt} contentFit="cover" /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>{picked.title}</Text>
          <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>{picked.artist}</Text>
        </View>
        <Pressable onPress={() => onPick({ title: '', artist: '', artworkUrl: null, spotifyUrl: null, appleUrl: null })} hitSlop={8}>
          <Text style={{ color: palette.text3, fontSize: 18 }}>×</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <TextField placeholder={placeholder} value={query} onChangeText={run} autoCorrect={false} />
      {results.map((t, i) => (
        <Pressable
          key={`${t.title}-${i}`}
          onPress={() => { onPick(t); setQuery(''); setResults([]); }}
          style={({ pressed }) => [styles.resultRow, pressed && { backgroundColor: palette.card2 }]}
        >
          {t.artworkUrl ? <Image source={{ uri: t.artworkUrl }} style={styles.resultArt} contentFit="cover" /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>{t.title}</Text>
            <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>{t.artist}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  theme: { flex: 1, fontFamily: fonts.sansBold, fontSize: 22 },
  meta: { fontFamily: fonts.mono, fontSize: 11, marginTop: 6 },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingVertical: 5, paddingLeft: 5, paddingRight: 12 },
  playCircle: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 8, marginLeft: 1 },
  playText: { fontFamily: fonts.sansBold, fontSize: 12, color: '#fff' },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  songArt: { width: 48, height: 48, borderRadius: radius.sm },
  songTitle: { fontFamily: fonts.sansBold, fontSize: 14 },
  songArtist: { fontFamily: fonts.sans, fontSize: 12, marginTop: 1 },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  byName: { fontFamily: fonts.monoMedium, fontSize: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: radius.md },
  resultArt: { width: 40, height: 40, borderRadius: radius.sm },
  pickedSong: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, marginTop: 8, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
});
