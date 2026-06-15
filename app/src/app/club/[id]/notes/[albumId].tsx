import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import {
  albums as albumsDb,
  songNoteShares as sharesDb,
  songNotes as songNotesDb,
  type Album,
  type SongNote,
  type Thumb,
} from '@/utils/supabase/db';

interface Track {
  trackNumber: number;
  trackName: string;
}

interface Draft {
  id?: string;
  rating: number | null;
  thumb: Thumb | null;
  comment: string;
}

interface OthersNote extends SongNote {
  profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null;
}

function parseTracks(json: unknown): Track[] {
  if (!Array.isArray(json)) return [];
  return json.filter((t): t is Track => !!t && typeof t === 'object' && 'trackName' in t);
}

const emptyDraft = (): Draft => ({ rating: null, thumb: null, comment: '' });
const hasContent = (d: Draft) => d.rating !== null || d.thumb !== null || d.comment.trim().length > 0;

// Per-album song notes: a private, track-by-track listening journal (rating
// 1–10, thumb, comment). Editable any time. You can SHARE your notes for this
// album with the club, and toggle whether you see others' shared notes.
export default function SongNotesEditor() {
  const { id, albumId } = useLocalSearchParams<{ id: string; albumId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);

  const [album, setAlbum] = useState<Album | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [sharing, setSharing] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<OthersNote[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    if (!albumId || !userId) return;
    const { data } = await songNotesDb.mine(albumId, userId);
    const map: Record<number, Draft> = {};
    for (const n of data ?? []) {
      map[n.track_number] = {
        id: n.id,
        rating: n.rating,
        thumb: (n.thumb as Thumb | null) ?? null,
        comment: n.comment ?? '',
      };
    }
    setDrafts(map);
  }, [albumId, userId]);

  useEffect(() => {
    if (!albumId || !userId) return;
    albumsDb.get(albumId).then(({ data }) => setAlbum(data ?? null));
    loadMine();
    sharesDb
      .listForAlbums([albumId])
      .then(({ data }) => setSharing((data ?? []).some((s) => s.profile_id === userId)));
  }, [albumId, userId, loadMine]);

  const tracks = useMemo(() => parseTracks(album?.tracks), [album]);

  const loadOthers = useCallback(async () => {
    if (!albumId || !userId) return;
    const { data } = await songNotesDb.listVisible(albumId);
    setOthers(((data ?? []) as OthersNote[]).filter((n) => n.profile_id !== userId));
  }, [albumId, userId]);

  const toggleShowOthers = () => {
    const next = !showOthers;
    setShowOthers(next);
    if (next && others.length === 0) loadOthers();
  };

  const toggleSharing = async () => {
    if (!albumId || !userId) return;
    const next = !sharing;
    setSharing(next);
    const { error: err } = await sharesDb.set(albumId, userId, next);
    if (err) {
      setSharing(!next);
      setError(err.message);
    }
  };

  const setDraft = (trackNumber: number, patch: Partial<Draft>) => {
    setSaved(false);
    setDrafts((prev) => ({
      ...prev,
      [trackNumber]: { ...(prev[trackNumber] ?? emptyDraft()), ...patch },
    }));
  };

  const save = async () => {
    if (!albumId || !userId) return;
    setBusy(true);
    setError(null);

    const toUpsert = tracks
      .filter((t) => hasContent(drafts[t.trackNumber] ?? emptyDraft()))
      .map((t) => {
        const d = drafts[t.trackNumber];
        return {
          album_id: albumId,
          profile_id: userId,
          track_number: t.trackNumber,
          track_name: t.trackName,
          rating: d.rating,
          thumb: d.thumb,
          comment: d.comment.trim() || null,
        };
      });
    // Rows that previously existed but are now empty → delete.
    const toRemove = tracks
      .map((t) => drafts[t.trackNumber])
      .filter((d): d is Draft => !!d && !!d.id && !hasContent(d))
      .map((d) => d.id!);

    const [up, rm] = await Promise.all([
      toUpsert.length ? songNotesDb.upsertMany(toUpsert) : Promise.resolve({ error: null }),
      toRemove.length ? songNotesDb.removeMany(toRemove) : Promise.resolve({ error: null }),
    ]);
    setBusy(false);
    const err = up.error ?? rm.error;
    if (err) {
      setError(err.message);
      return;
    }
    await loadMine();
    setSaved(true);
  };

  const estimate = useMemo(() => {
    const scores = Object.values(drafts)
      .map((d) => d.rating)
      .filter((r): r is number => r !== null);
    if (scores.length === 0) return null;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { avg: Math.round(avg * 10) / 10, rated: scores.length };
  }, [drafts]);

  const othersByTrack = useMemo(() => {
    const map: Record<number, OthersNote[]> = {};
    for (const n of others) (map[n.track_number] ??= []).push(n);
    return map;
  }, [others]);

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>SONG NOTES</Text>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text1 }]}>
            {album?.title ?? '…'}
          </Text>
        </View>
        {album?.artwork_url ? (
          <Image source={{ uri: album.artwork_url }} style={styles.art} contentFit="cover" />
        ) : null}
      </View>

      <View style={styles.toggleRow}>
        <Toggle
          active={sharing}
          onPress={toggleSharing}
          onLabel="🔓 Sharing"
          offLabel="🔒 Private"
        />
        <Toggle
          active={showOthers}
          onPress={toggleShowOthers}
          onLabel="👀 Others' notes"
          offLabel="👀 Show others"
        />
      </View>

      {estimate ? (
        <Card style={styles.estimateCard}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.estimateLabel, { color: palette.text3 }]}>ESTIMATED ALBUM SCORE</Text>
            <Text style={[styles.estimateSub, { color: palette.text2 }]}>
              Averaged from {estimate.rated} rated track{estimate.rated === 1 ? '' : 's'}
              {tracks.length ? ` of ${tracks.length}` : ''}
            </Text>
          </View>
          <Text style={[styles.estimateScore, { color: palette.teal }]}>{estimate.avg}</Text>
          <Text style={[styles.estimateMax, { color: palette.text3 }]}>/10</Text>
        </Card>
      ) : null}

      {tracks.length === 0 ? (
        <InlineNote text="No track list on this album — nothing to note yet." />
      ) : (
        tracks.map((t) => {
          const d = drafts[t.trackNumber] ?? emptyDraft();
          const theirs = showOthers ? othersByTrack[t.trackNumber] ?? [] : [];
          return (
            <Card key={t.trackNumber} style={{ marginBottom: 10 }}>
              <View style={styles.trackHead}>
                <Text style={[styles.trackNum, { color: palette.text3 }]}>
                  {String(t.trackNumber).padStart(2, '0')}
                </Text>
                <Text numberOfLines={2} style={[styles.trackName, { color: palette.text1 }]}>
                  {t.trackName}
                </Text>
                <View style={styles.thumbs}>
                  <Pressable
                    onPress={() => setDraft(t.trackNumber, { thumb: d.thumb === 'up' ? null : 'up' })}
                    style={[
                      styles.thumb,
                      { borderColor: palette.border },
                      d.thumb === 'up' && { backgroundColor: palette.tealBg, borderColor: palette.teal },
                    ]}
                  >
                    <Text style={{ fontSize: 15, opacity: d.thumb === 'up' ? 1 : 0.5 }}>👍</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDraft(t.trackNumber, { thumb: d.thumb === 'down' ? null : 'down' })}
                    style={[
                      styles.thumb,
                      { borderColor: palette.border },
                      d.thumb === 'down' && { backgroundColor: palette.coralBg, borderColor: palette.coral },
                    ]}
                  >
                    <Text style={{ fontSize: 15, opacity: d.thumb === 'down' ? 1 : 0.5 }}>👎</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.scoreRow}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const active = d.rating === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setDraft(t.trackNumber, { rating: active ? null : n })}
                      style={[
                        styles.scoreBtn,
                        { backgroundColor: palette.card2, borderColor: palette.border },
                        active && { backgroundColor: palette.tealBg, borderColor: palette.teal },
                      ]}
                    >
                      <Text style={[styles.scoreText, { color: active ? palette.teal : palette.text2 }]}>
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextField
                placeholder="Notes on this track…"
                value={d.comment}
                onChangeText={(v) => setDraft(t.trackNumber, { comment: v })}
                multiline
                style={{ marginTop: 10, minHeight: 40, textAlignVertical: 'top' }}
              />

              {theirs.length > 0 ? (
                <View style={[styles.othersWrap, { borderTopColor: palette.border }]}>
                  {theirs.map((o) => (
                    <View key={o.id} style={styles.otherRow}>
                      <Avatar
                        name={o.profiles?.display_name ?? null}
                        colorIndex={o.profiles?.avatar_color ?? 0}
                        imageUrl={o.profiles?.avatar_url}
                        size={22}
                      />
                      <Text style={[styles.otherName, { color: palette.text2 }]}>
                        {o.profiles?.display_name ?? '(no name)'}
                      </Text>
                      {o.rating != null ? (
                        <Text style={[styles.otherScore, { color: palette.amber }]}>{o.rating}/10</Text>
                      ) : null}
                      {o.thumb ? <Text style={{ fontSize: 12 }}>{o.thumb === 'up' ? '👍' : '👎'}</Text> : null}
                      {o.comment ? (
                        <Text numberOfLines={3} style={[styles.otherComment, { color: palette.text1 }]}>
                          {o.comment}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      {showOthers && others.length === 0 ? (
        <InlineNote text="No one else has shared their notes for this album yet." />
      ) : null}

      {tracks.length > 0 ? (
        <Button title={saved ? '✓ Saved' : 'Save notes'} onPress={save} loading={busy} />
      ) : null}
      <Text style={[styles.footNote, { color: palette.text3 }]}>
        {sharing
          ? 'Your notes are visible to the club for this album.'
          : 'Private to you. Flip “Sharing” to let the club read your notes on this album.'}
      </Text>
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Screen>
  );
}

function Toggle({
  active,
  onPress,
  onLabel,
  offLabel,
}: {
  active: boolean;
  onPress: () => void;
  onLabel: string;
  offLabel: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.toggle,
        { backgroundColor: palette.card2, borderColor: palette.border },
        active && { backgroundColor: palette.tealBg, borderColor: palette.teal },
      ]}
    >
      <Text style={[styles.toggleText, { color: active ? palette.teal : palette.text2 }]}>
        {active ? onLabel : offLabel}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 17 },
  art: { width: 44, height: 44, borderRadius: radius.sm },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  toggle: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  estimateCard: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  estimateLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2, marginBottom: 3 },
  estimateSub: { fontFamily: fonts.sans, fontSize: 12 },
  estimateScore: { fontFamily: fonts.sansBold, fontSize: 30 },
  estimateMax: { fontFamily: fonts.monoMedium, fontSize: 12, marginBottom: 4 },
  trackHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  trackNum: { fontFamily: fonts.monoMedium, fontSize: 11 },
  trackName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 14 },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: {
    width: 34,
    height: 30,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  scoreBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontFamily: fonts.monoMedium, fontSize: 13 },
  othersWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 10,
    gap: 8,
  },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  otherName: { fontFamily: fonts.sansMedium, fontSize: 12 },
  otherScore: { fontFamily: fonts.sansBold, fontSize: 12 },
  otherComment: { flexBasis: '100%', fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  footNote: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 10 },
});
