import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import {
  albums as albumsDb,
  cycles as cyclesDb,
  preferences as preferencesDb,
  type Album,
} from '@/utils/supabase/db';

// The cycle-level "head to head": after a member has reviewed both albums, they
// pick the one they preferred and say why — plus what the other one still did
// better. Stored on cycle_preferences (album_id = the pick). Editable until the
// cycle is revealed, then read-only.
export default function HeadToHead() {
  const { id, cycleId } = useLocalSearchParams<{ id: string; cycleId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);

  const [albums, setAlbums] = useState<Album[]>([]);
  const [winner, setWinner] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [otherMerit, setOtherMerit] = useState('');
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cycleId || !userId) return;
    albumsDb.listByCycle(cycleId).then(({ data }) => setAlbums(data ?? []));
    cyclesDb
      .get(cycleId)
      .then(({ data: c }) => setLocked(!!c && (c.status !== 'open' || !!c.revealed_at)));
    preferencesDb.listByCycle(cycleId).then(({ data }) => {
      const mine = (data ?? []).find((p) => p.profile_id === userId);
      if (mine) {
        setWinner(mine.album_id);
        setReason(mine.preference_reason ?? '');
        setOtherMerit(mine.other_album_merit ?? '');
      }
    });
  }, [cycleId, userId]);

  const other = useMemo(
    () => albums.find((a) => a.id !== winner) ?? null,
    [albums, winner],
  );
  const winnerAlbum = useMemo(
    () => albums.find((a) => a.id === winner) ?? null,
    [albums, winner],
  );

  const save = async () => {
    if (!cycleId || !userId || locked) return;
    if (!winner) {
      setError('Pick the album you preferred.');
      return;
    }
    if (!reason.trim()) {
      setError('Say why it beat the other one.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await preferencesDb.setReasons(cycleId, userId, winner, {
      preference_reason: reason.trim(),
      other_album_merit: otherMerit.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(`/club/${id}/album/${winner}`);
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>HEAD TO HEAD</Text>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text1 }]}>
            Which one won you over?
          </Text>
        </View>
      </View>

      {albums.length < 2 ? (
        <InlineNote text="Both albums need to be set before you can compare them." />
      ) : (
        <>
          <Label>Your pick</Label>
          <View style={styles.pickRow}>
            {albums.map((a) => {
              const active = winner === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => !locked && setWinner(a.id)}
                  style={[
                    styles.pickCard,
                    { backgroundColor: palette.card, borderColor: palette.border },
                    active && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                  ]}
                >
                  {a.artwork_url ? (
                    <Image source={{ uri: a.artwork_url }} style={styles.pickArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.pickArt, { backgroundColor: palette.card2 }]} />
                  )}
                  <Text numberOfLines={2} style={[styles.pickTitle, { color: palette.text1 }]}>
                    {a.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.pickArtist, { color: palette.text3 }]}>
                    {a.artist}
                  </Text>
                  {active ? (
                    <Text style={[styles.pickBadge, { color: palette.teal }]}>✓ Preferred</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {winner ? (
            <>
              <Label>Why {winnerAlbum?.title ?? 'this'} over {other?.title ?? 'the other'}?</Label>
              <Card>
                <TextField
                  placeholder="What put it ahead… (required)"
                  value={reason}
                  onChangeText={setReason}
                  editable={!locked}
                  multiline
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                />
              </Card>

              <Label>What {other?.title ?? 'the other'} did better</Label>
              <Card>
                <TextField
                  placeholder="Give the runner-up its due… (optional)"
                  value={otherMerit}
                  onChangeText={setOtherMerit}
                  editable={!locked}
                  multiline
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                />
              </Card>
            </>
          ) : null}

          {locked ? (
            <InlineNote text="This cycle has been revealed — your head-to-head is final." />
          ) : (
            <Button title="Save head-to-head" onPress={save} loading={busy} />
          )}
          {error ? <InlineNote text={error} tone="error" /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 17 },
  pickRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  pickCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  pickArt: { width: '100%', aspectRatio: 1, borderRadius: radius.md },
  pickTitle: { fontFamily: fonts.sansBold, fontSize: 14, textAlign: 'center' },
  pickArtist: { fontFamily: fonts.sans, fontSize: 12, textAlign: 'center' },
  pickBadge: { fontFamily: fonts.monoMedium, fontSize: 11 },
});
