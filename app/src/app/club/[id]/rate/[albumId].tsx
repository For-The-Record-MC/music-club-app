import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { VibeTagPicker } from '@/components/VibeTagPicker';
import { Button, Card, InlineNote, Label, Screen, Slider, TextField } from '@/components/ui';
import { CANONICAL_VIBE_TAGS } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import {
  albumImpressions as impressionsDb,
  albums as albumsDb,
  cycles as cyclesDb,
  ratings as ratingsDb,
  songNotes as songNotesDb,
  vibeTags as vibeTagsDb,
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

// One rating per (album, member). Decimal slider score, a REQUIRED one-sentence
// take, an optional long review, a best-3-song-run, and an optional "extras"
// section (favorite/least track, favorite lyric, best moment, replayability,
// album vibe). The member's first-listen initial score is read from
// album_impressions and snapshotted onto the rating so initial→final drift
// survives into the recap. Editable until the cycle closes.
export default function RateAlbum() {
  const { id, albumId } = useLocalSearchParams<{ id: string; albumId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);

  const [album, setAlbum] = useState<Album | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [oneSentenceTake, setOneSentenceTake] = useState('');
  const [review, setReview] = useState('');
  const [favTrack, setFavTrack] = useState('');
  const [favReason, setFavReason] = useState('');
  const [leastTrack, setLeastTrack] = useState('');
  const [leastReason, setLeastReason] = useState('');
  const [bestRunStart, setBestRunStart] = useState<number | null>(null);
  const [bestRunRating, setBestRunRating] = useState<number | null>(null);
  const [replayability, setReplayability] = useState<number | null>(null);
  const [favoriteLyric, setFavoriteLyric] = useState('');
  const [bestMoment, setBestMoment] = useState('');
  const [albumVibeTags, setAlbumVibeTags] = useState<string[]>([]);
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [catalog, setCatalog] = useState<string[]>([...CANONICAL_VIBE_TAGS]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songNotes, setSongNotes] = useState<SongNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  // Ratings freeze at reveal — once the cycle is revealed/closed, this screen is read-only.
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!albumId || !userId) return;
    albumsDb.get(albumId).then(({ data }) => {
      setAlbum(data ?? null);
      if (data) {
        cyclesDb
          .get(data.cycle_id)
          .then(({ data: c }) => setLocked(!!c && (c.status !== 'open' || !!c.revealed_at)));
      }
    });
    songNotesDb.mine(albumId, userId).then(({ data }) =>
      setSongNotes(
        (data ?? []).filter(
          (n) => n.rating !== null || n.thumb !== null || !!n.comment || (n.vibe_tags?.length ?? 0) > 0,
        ),
      ),
    );
    impressionsDb
      .mine(albumId, userId)
      .then(({ data }) => setInitialScore((prev) => prev ?? data?.initial_score ?? null));
    vibeTagsDb.list().then(({ data }) => {
      const merged = [...CANONICAL_VIBE_TAGS] as string[];
      for (const t of data ?? []) {
        if (!merged.some((m) => m.toLowerCase() === t.name.toLowerCase())) merged.push(t.name);
      }
      setCatalog(merged);
    });
    ratingsDb.mine(albumId, userId).then(({ data }) => {
      if (data) {
        setScore(data.score);
        setOneSentenceTake(data.one_sentence_take ?? '');
        setReview(data.review ?? '');
        setFavTrack(data.favorite_track ?? '');
        setFavReason(data.favorite_reason ?? '');
        setLeastTrack(data.least_track ?? '');
        setLeastReason(data.least_reason ?? '');
        setBestRunStart(data.best_run_start);
        setBestRunRating(data.best_run_rating);
        setReplayability(data.replayability);
        setFavoriteLyric(data.favorite_lyric ?? '');
        setBestMoment(data.best_moment ?? '');
        setAlbumVibeTags(data.album_vibe_tags ?? []);
        if (data.initial_score != null) setInitialScore(data.initial_score);
      }
    });
  }, [albumId, userId]);

  const tracks = useMemo(() => parseTracks(album?.tracks), [album]);

  const noteEstimate = useMemo(() => {
    const scores = songNotes.map((n) => n.rating).filter((r): r is number => r !== null);
    if (scores.length === 0) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }, [songNotes]);

  // Pre-fill the album vibe from the member's per-song vibe tags: the most-used
  // tags across their song notes, best first. Only suggested until they've saved
  // a rating with their own album vibe (handled in the load above).
  const suggestedVibes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of songNotes) for (const t of n.vibe_tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  }, [songNotes]);

  // Tracks that can START a 3-song run (need two consecutive tracks after them).
  const trackNums = useMemo(() => new Set(tracks.map((t) => t.trackNumber)), [tracks]);
  const runStarts = useMemo(
    () => tracks.filter((t) => trackNums.has(t.trackNumber + 1) && trackNums.has(t.trackNumber + 2)),
    [tracks, trackNums],
  );
  const runTracks = useMemo(
    () =>
      bestRunStart == null
        ? []
        : tracks.filter(
            (t) => t.trackNumber >= bestRunStart && t.trackNumber <= bestRunStart + 2,
          ),
    [tracks, bestRunStart],
  );

  const applySuggestedVibes = () => setAlbumVibeTags(suggestedVibes);

  const createTag = (name: string) => {
    if (!userId) return;
    vibeTagsDb.add(name, userId);
    setCatalog((prev) =>
      prev.some((t) => t.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name],
    );
  };

  const save = async () => {
    if (!albumId || !userId || locked) return;
    if (score === null) {
      setError('Pick a score first.');
      return;
    }
    if (!oneSentenceTake.trim()) {
      setError('Add a one-sentence take to submit your review.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await ratingsDb.upsert({
      album_id: albumId,
      profile_id: userId,
      score,
      one_sentence_take: oneSentenceTake.trim(),
      review: review.trim() || null,
      favorite_track: favTrack.trim() || null,
      favorite_reason: favReason.trim() || null,
      least_track: leastTrack.trim() || null,
      least_reason: leastReason.trim() || null,
      best_run_start: bestRunStart,
      best_run_rating: bestRunRating,
      replayability,
      favorite_lyric: favoriteLyric.trim() || null,
      best_moment: bestMoment.trim() || null,
      album_vibe_tags: albumVibeTags,
      // Snapshot the first-listen score so drift survives into the recap.
      initial_score: initialScore,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    // If the member has now reviewed BOTH albums in the cycle, send them to the
    // head-to-head compare step; otherwise straight to the album page.
    if (album) {
      const { data: cycleAlbums } = await albumsDb.listByCycle(album.cycle_id);
      const other = (cycleAlbums ?? []).find((a) => a.id !== albumId);
      if (other) {
        const { data: otherRating } = await ratingsDb.mine(other.id, userId);
        if (otherRating) {
          router.replace(`/club/${id}/compare/${album.cycle_id}`);
          return;
        }
      }
    }
    router.replace(`/club/${id}/album/${albumId}`);
  };

  if (locked) {
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
        <Card>
          <Text style={[styles.lockedTitle, { color: palette.text1 }]}>🔒 Ratings are locked</Text>
          <Text style={[styles.lockedBody, { color: palette.text2 }]}>
            This cycle's ratings have been revealed — scores and reviews are final. Open the
            album to read everyone's ratings.
          </Text>
          <Button
            title="View the reveal"
            onPress={() => router.replace(`/club/${id}/album/${albumId}`)}
            style={{ marginTop: 14 }}
          />
        </Card>
      </Screen>
    );
  }

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
            {(notesOpen ? songNotes : songNotes.slice(0, 3)).map((n) => (
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
            {songNotes.length > 3 ? (
              <Pressable onPress={() => setNotesOpen((o) => !o)}>
                <Text style={[styles.notesToggle, { color: palette.purple }]}>
                  {notesOpen ? 'Show less ▴' : `Show all ${songNotes.length} ▾`}
                </Text>
              </Pressable>
            ) : null}
            {noteEstimate != null ? (
              <View style={[styles.estimateRow, { borderTopColor: palette.border }]}>
                <Text style={[styles.estimateText, { color: palette.text2 }]}>
                  Avg of your track scores
                </Text>
                <Text style={[styles.estimateScore, { color: palette.teal }]}>{noteEstimate}/10</Text>
                {score === null ? (
                  <Pressable onPress={() => setScore(noteEstimate)}>
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

      <Text style={[styles.sectionHead, { color: palette.text1, borderTopColor: palette.border }]}>
        Core Review
      </Text>

      <Label>One-sentence take *</Label>
      <Card>
        <TextField
          placeholder="Sum it up in a sentence (required)…"
          value={oneSentenceTake}
          onChangeText={setOneSentenceTake}
          maxLength={280}
        />
      </Card>

      <Label>Your score</Label>
      <Card>
        <Slider value={score} onChange={setScore} />
        {initialScore != null ? (
          <Text style={[styles.initialBadge, { color: palette.amber }]}>
            First listen: {initialScore.toFixed(1)}
            {score != null ? (
              <Text style={{ color: palette.text3 }}>
                {'  '}
                ({score >= initialScore ? '+' : ''}
                {(score - initialScore).toFixed(1)} drift)
              </Text>
            ) : null}
          </Text>
        ) : null}
      </Card>

      <Label>Your commentary</Label>
      <Card>
        <TextField
          placeholder="What did you think? Standout moments, how it hit you… (optional)"
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

      <Text style={[styles.sectionHead, { color: palette.text1, borderTopColor: palette.border }]}>
        Extras
      </Text>
      <Text style={[styles.sectionSub, { color: palette.text3 }]}>
        All optional — add as much or as little as you like.
      </Text>

      {runStarts.length > 0 ? (
        <>
          <Label>Best 3-song run</Label>
          <Card>
            <View style={styles.trackWrap}>
              {runStarts.map((t) => {
                const active = bestRunStart === t.trackNumber;
                return (
                  <Pressable
                    key={t.trackNumber}
                    onPress={() => setBestRunStart(active ? null : t.trackNumber)}
                    style={[
                      styles.trackChip,
                      { backgroundColor: palette.card2, borderColor: palette.border },
                      active && { backgroundColor: palette.purpleBg, borderColor: palette.purple },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.trackChipText, { color: active ? palette.purple : palette.text2 }]}
                    >
                      {t.trackName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {runTracks.length === 3 ? (
              <>
                <Text style={[styles.runPreview, { color: palette.text2 }]}>
                  {runTracks.map((t) => t.trackName).join(' → ')}
                </Text>
                <Text style={[styles.fieldLabel, { color: palette.text3 }]}>RUN RATING</Text>
                <Slider value={bestRunRating} onChange={setBestRunRating} accent={palette.purple} />
              </>
            ) : (
              <Text style={[styles.hint, { color: palette.text3 }]}>
                Pick the first track of your favorite three-in-a-row.
              </Text>
            )}
          </Card>
        </>
      ) : null}

      <Label>Favorite lyric</Label>
      <Card>
        <TextField
          placeholder="The line that stuck with you… (optional)"
          value={favoriteLyric}
          onChangeText={setFavoriteLyric}
          multiline
          style={{ minHeight: 50, textAlignVertical: 'top' }}
        />
      </Card>

      <Label>Best moment</Label>
      <Card>
        <TextField
          placeholder="A drop, a key change, a lyric at 2:40… (optional)"
          value={bestMoment}
          onChangeText={setBestMoment}
          multiline
          style={{ minHeight: 50, textAlignVertical: 'top' }}
        />
      </Card>

      <Label>Replayability</Label>
      <Card>
        <Slider value={replayability} onChange={setReplayability} accent={palette.amber} />
        <Text style={[styles.hint, { color: palette.text3 }]}>
          Would you come back to this? (optional)
        </Text>
      </Card>

      <View style={styles.vibeHeader}>
        <Label>Overall album vibe</Label>
        {suggestedVibes.length > 0 ? (
          <Pressable onPress={applySuggestedVibes}>
            <Text style={[styles.suggestLink, { color: palette.purple }]}>use song vibes ›</Text>
          </Pressable>
        ) : null}
      </View>
      <Card>
        <VibeTagPicker
          selected={albumVibeTags}
          catalog={catalog}
          onChange={setAlbumVibeTags}
          onCreate={createTag}
        />
      </Card>

      <Button title="Save rating" onPress={save} loading={busy} />
      <Text style={[styles.sealNote, { color: palette.text3 }]}>
        Sealed until the meeting — after you save you'll see the club average, and
        everything opens at the reveal. Editable until ratings are revealed.
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
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 17 },
  art: { width: 44, height: 44, borderRadius: radius.sm },
  sectionHead: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    marginTop: 8,
    marginBottom: 12,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sectionSub: { fontFamily: fonts.sans, fontSize: 12, marginTop: -6, marginBottom: 12 },
  initialBadge: { fontFamily: fonts.monoMedium, fontSize: 11, marginTop: 10 },
  fieldLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2, marginTop: 12, marginBottom: 6 },
  runPreview: { fontFamily: fonts.sansMedium, fontSize: 13, marginTop: 12 },
  hint: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 15, marginTop: 8 },
  vibeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestLink: { fontFamily: fonts.monoMedium, fontSize: 11, marginBottom: 10 },
  notesToggle: { fontFamily: fonts.monoMedium, fontSize: 11, marginTop: 6 },
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
  lockedTitle: { fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 6 },
  lockedBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
});
