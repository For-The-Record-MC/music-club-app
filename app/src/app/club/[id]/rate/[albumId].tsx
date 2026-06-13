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
  ratings as ratingsDb,
  songNotes as songNotesDb,
  type Album,
  type SongNote,
} from '@/utils/supabase/db';

interface Track {
  trackNumber: number;
  trackName: string;
}

function parseTracks(json: unknown): Track[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (t): t is Track => !!t && typeof t === 'object' && 'trackName' in t,
  );
}

// One rating per (album, member): 1–10 score, review, favorite + least
// favorite song with optional reasoning. Editable until the cycle closes.
export default function RateAlbum() {
  const { id, albumId } = useLocalSearchParams<{ id: string; albumId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);

  const [album, setAlbum] = useState<Album | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [review, setReview] = useState('');
  const [favTrack, setFavTrack] = useState('');
  const [favReason, setFavReason] = useState('');
  const [leastTrack, setLeastTrack] = useState('');
  const [leastReason, setLeastReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songNotes, setSongNotes] = useState<SongNote[]>([]);

  useEffect(() => {
    if (!albumId || !userId) return;
    albumsDb.get(albumId).then(({ data }) => setAlbum(data ?? null));
    songNotesDb.mine(albumId, userId).then(({ data }) =>
      setSongNotes(
        (data ?? []).filter((n) => n.rating !== null || n.thumb !== null || !!n.comment),
      ),
    );
    ratingsDb.mine(albumId, userId).then(({ data }) => {
      if (data) {
        setScore(data.score);
        setReview(data.review ?? '');
        setFavTrack(data.favorite_track ?? '');
        setFavReason(data.favorite_reason ?? '');
        setLeastTrack(data.least_track ?? '');
        setLeastReason(data.least_reason ?? '');
      }
    });
  }, [albumId, userId]);

  const tracks = useMemo(() => parseTracks(album?.tracks), [album]);

  const noteEstimate = useMemo(() => {
    const scores = songNotes.map((n) => n.rating).filter((r): r is number => r !== null);
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }, [songNotes]);

  const save = async () => {
    if (!albumId || !userId) return;
    if (score === null) {
      setError('Pick a score (1–10) first.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await ratingsDb.upsert({
      album_id: albumId,
      profile_id: userId,
      score,
      review: review.trim() || null,
      favorite_track: favTrack.trim() || null,
      favorite_reason: favReason.trim() || null,
      least_track: leastTrack.trim() || null,
      least_reason: leastReason.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace(`/club/${id}/album/${albumId}`);
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>RATE THIS ALBUM</Text>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text1 }]}>
            {album?.title ?? '…'}
          </Text>
        </View>
        {album?.artwork_url ? (
          <Image source={{ uri: album.artwork_url }} style={styles.art} contentFit="cover" />
        ) : null}
      </View>

      {songNotes.length > 0 ? (
        <>
          <Label>Your song notes</Label>
          <Card>
            {songNotes.map((n) => (
              <View key={n.id} style={styles.noteRow}>
                <Text style={[styles.noteTrack, { color: palette.text1 }]} numberOfLines={1}>
                  {n.track_name}
                </Text>
                {n.rating != null ? (
                  <Text style={[styles.noteScore, { color: palette.teal }]}>{n.rating}/10</Text>
                ) : null}
                {n.thumb ? <Text style={{ fontSize: 12 }}>{n.thumb === 'up' ? '👍' : '👎'}</Text> : null}
                {n.comment ? (
                  <Text style={[styles.noteComment, { color: palette.text2 }]} numberOfLines={3}>
                    {n.comment}
                  </Text>
                ) : null}
              </View>
            ))}
            {noteEstimate != null ? (
              <View style={[styles.estimateRow, { borderTopColor: palette.border }]}>
                <Text style={[styles.estimateText, { color: palette.text2 }]}>
                  Avg of your track scores
                </Text>
                <Text style={[styles.estimateScore, { color: palette.teal }]}>{noteEstimate}/10</Text>
                {score === null ? (
                  <Pressable onPress={() => setScore(Math.round(noteEstimate))}>
                    <Text style={[styles.estimateUse, { color: palette.purple }]}>use ›</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <Pressable onPress={() => router.push(`/club/${id}/notes/${albumId}`)}>
              <Text style={[styles.noteEdit, { color: palette.purple }]}>📝 Edit song notes ›</Text>
            </Pressable>
          </Card>
        </>
      ) : null}

      <Label>Your score</Label>
      <Card>
        <View style={styles.scoreRow}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const active = score === n;
            return (
              <Pressable
                key={n}
                onPress={() => setScore(n)}
                style={[
                  styles.scoreBtn,
                  { backgroundColor: palette.card2, borderColor: palette.border },
                  active && { backgroundColor: palette.tealBg, borderColor: palette.teal },
                ]}
              >
                <Text
                  style={[
                    styles.scoreText,
                    { color: active ? palette.teal : palette.text2 },
                  ]}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {score !== null ? (
          <Text style={[styles.scoreNote, { color: palette.text3 }]}>{score}/10</Text>
        ) : null}
      </Card>

      <Label>Your review</Label>
      <Card>
        <TextField
          placeholder="What did you think? Standout moments, how it hit you…"
          value={review}
          onChangeText={setReview}
          multiline
          numberOfLines={4}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />
      </Card>

      <TrackPicker
        label="Favorite song"
        tracks={tracks}
        value={favTrack}
        onChange={setFavTrack}
        reason={favReason}
        onReasonChange={setFavReason}
        reasonPlaceholder="Why this one? (optional)"
      />
      <TrackPicker
        label="Least favorite song"
        tracks={tracks}
        value={leastTrack}
        onChange={setLeastTrack}
        reason={leastReason}
        onReasonChange={setLeastReason}
        reasonPlaceholder="What didn't land? (optional)"
      />

      <Button title="Save rating" onPress={save} loading={busy} />
      <Text style={[styles.sealNote, { color: palette.text3 }]}>
        Sealed until the meeting — after you save you'll see the club average, and
        everything opens at the reveal. Editable until the cycle closes.
      </Text>
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Screen>
  );
}

function TrackPicker({
  label,
  tracks,
  value,
  onChange,
  reason,
  onReasonChange,
  reasonPlaceholder,
}: {
  label: string;
  tracks: Track[];
  value: string;
  onChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  reasonPlaceholder: string;
}) {
  const { palette } = useTheme();
  return (
    <>
      <Label>{label}</Label>
      <Card>
        {tracks.length > 0 ? (
          <View style={styles.trackWrap}>
            {tracks.map((t) => {
              const active = value === t.trackName;
              return (
                <Pressable
                  key={`${t.trackNumber}-${t.trackName}`}
                  onPress={() => onChange(active ? '' : t.trackName)}
                  style={[
                    styles.trackChip,
                    { backgroundColor: palette.card2, borderColor: palette.border },
                    active && { backgroundColor: palette.purpleBg, borderColor: palette.purple },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.trackChipText,
                      { color: active ? palette.purple : palette.text2 },
                    ]}
                  >
                    {t.trackName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextField placeholder="Song title" value={value} onChangeText={onChange} />
        )}
        {value ? (
          <TextField
            placeholder={reasonPlaceholder}
            value={reason}
            onChangeText={onReasonChange}
            multiline
            style={{ marginTop: 10 }}
          />
        ) : null}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 17 },
  art: { width: 44, height: 44, borderRadius: radius.sm },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scoreBtn: {
    width: 44,
    height: 40,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontFamily: fonts.monoMedium, fontSize: 15 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingVertical: 5 },
  noteTrack: { fontFamily: fonts.sansMedium, fontSize: 13, maxWidth: '60%' },
  noteScore: { fontFamily: fonts.sansBold, fontSize: 13 },
  noteComment: { flexBasis: '100%', fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  noteEdit: { fontFamily: fonts.monoMedium, fontSize: 11, marginTop: 8 },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  estimateText: { flex: 1, fontFamily: fonts.sans, fontSize: 12 },
  estimateScore: { fontFamily: fonts.sansBold, fontSize: 14 },
  estimateUse: { fontFamily: fonts.monoMedium, fontSize: 11 },
  scoreNote: { fontFamily: fonts.mono, fontSize: 11, marginTop: 8 },
  trackWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  trackChip: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 11,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  trackChipText: { fontFamily: fonts.sansMedium, fontSize: 12 },
  sealNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
  },
});
