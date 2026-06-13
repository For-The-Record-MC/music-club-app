import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { connectSpotify, spotifyRedirectUri } from '@/utils/spotifyAuth';
import { streaming, type StreamingStatus } from '@/utils/supabase/db';

// Owner-only: connect the club's Spotify account so feed songs flow into a
// per-cycle playlist. Tokens live server-side; this screen only sees status.
export default function Streaming() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const { club, myRole, loading } = useClubData(id);
  const { cycle } = useCycle(id);

  const [status, setStatus] = useState<StreamingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'muted' | 'error' | 'success' } | null>(null);

  const isOwner = myRole === 'owner';

  const refreshStatus = async () => {
    if (!id) return;
    const { data } = await streaming.status(id);
    setStatus((data as unknown as StreamingStatus) ?? null);
  };
  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Owner-only — bounce everyone else.
  useEffect(() => {
    if (!loading && club && !isOwner) router.replace('/home');
  }, [loading, club, isOwner, router]);

  const connect = async () => {
    if (!id) return;
    setBusy(true);
    setNote(null);
    const res = await connectSpotify(id);
    setBusy(false);
    if (res.ok) {
      setNote({ text: `Connected as ${res.display_name ?? 'Spotify'}.`, tone: 'success' });
      refreshStatus();
    } else {
      setNote({ text: res.message ?? 'Could not connect.', tone: 'error' });
    }
  };

  const disconnect = async () => {
    if (!id) return;
    if (
      await confirmAsync(
        'Disconnect Spotify',
        'New songs stop syncing. Playlists already created stay on Spotify and their links keep working.',
      )
    ) {
      await streaming.disconnect(id);
      setNote(null);
      refreshStatus();
    }
  };

  const resync = async () => {
    if (!id) return;
    setBusy(true);
    setNote(null);
    const { data, error } = await streaming.sync(id);
    setBusy(false);
    if (error) {
      setNote({ text: error.message, tone: 'error' });
      return;
    }
    if (data?.ok) {
      setNote({
        text: data.added ? `Added ${data.added} song(s) to the playlist.` : 'Playlist is already up to date.',
        tone: 'success',
      });
    } else if (data?.reason === 'needs_reconnect') {
      setNote({ text: 'Spotify needs reconnecting.', tone: 'error' });
    } else if (data?.reason === 'no_open_cycle') {
      setNote({ text: 'No open cycle yet — songs will sync once a cycle starts.', tone: 'muted' });
    } else {
      setNote({ text: data?.message ?? 'Nothing to sync.', tone: 'muted' });
    }
    refreshStatus();
  };

  if (!club) return <Screen><Text style={{ color: palette.text3 }}>Loading…</Text></Screen>;

  const connected = status?.connected;
  const needsReconnect = status?.status === 'needs_reconnect';

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>{club.name.toUpperCase()}</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>Streaming</Text>
        </View>
      </View>

      <Card>
        <Label>Spotify</Label>
        {connected ? (
          <>
            <Text style={[styles.body, { color: palette.text1 }]}>
              Connected{status?.display_name ? ` as ${status.display_name}` : ''}.
            </Text>
            {needsReconnect ? (
              <InlineNote
                text="Spotify access expired or was revoked — reconnect to resume syncing."
                tone="error"
              />
            ) : (
              <Text style={[styles.help, { color: palette.text2 }]}>
                Each cycle gets its own public playlist. Songs added to the feed are pushed there
                automatically.
              </Text>
            )}
            {cycle?.spotify_playlist_url ? (
              <Pressable onPress={() => Linking.openURL(cycle.spotify_playlist_url!)}>
                <Text style={[styles.link, { color: palette.teal }]}>
                  ▶ Open Cycle {cycle.number}'s playlist
                </Text>
              </Pressable>
            ) : null}
            <Button title="Re-sync playlist" onPress={resync} loading={busy} style={{ marginTop: 14 }} />
            {needsReconnect ? (
              <Button title="Reconnect Spotify" onPress={connect} style={{ marginTop: 8 }} />
            ) : null}
            <Button title="Disconnect" variant="ghost" onPress={disconnect} style={{ marginTop: 8 }} />
          </>
        ) : (
          <>
            <Text style={[styles.help, { color: palette.text2 }]}>
              Connect your Spotify so each cycle's feed songs collect into a public playlist the club
              can listen to in one tap.
            </Text>
            <Button title="Connect Spotify" onPress={connect} loading={busy} style={{ marginTop: 12 }} />
          </>
        )}
        {note ? <InlineNote text={note.text} tone={note.tone} /> : null}
      </Card>

      {/* Setup helper: the exact redirect URI to register in the Spotify app. */}
      <Label>{'\n'}Setup</Label>
      <Card>
        <Text style={[styles.help, { color: palette.text2 }]}>
          If connecting fails with a redirect-URI error, add this exact value in your Spotify app's
          settings (Redirect URIs):
        </Text>
        <Text selectable style={[styles.mono, { color: palette.text1 }]}>
          {spotifyRedirectUri()}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  body: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 6 },
  help: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  link: { fontFamily: fonts.monoMedium, fontSize: 13, marginTop: 10 },
  mono: { fontFamily: fonts.mono, fontSize: 12, marginTop: 8 },
});
