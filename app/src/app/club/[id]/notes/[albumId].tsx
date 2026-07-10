import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { PreviewArt } from '@/components/PreviewArt';
import { VibeTagPicker } from '@/components/VibeTagPicker';
import { Avatar, Button, Card, InlineNote, Screen, Slider, TextField } from '@/components/ui';
import { CANONICAL_VIBE_TAGS } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { openLyrics } from '@/utils/genius';
import { openWhoSampled } from '@/utils/whosampled';
import { memberName } from '@/utils/memberName';
import {
  albumImpressions as impressionsDb,
  albums as albumsDb,
  songNoteReactions as noteReactionsDb,
  songNoteShares as sharesDb,
  songNotes as songNotesDb,
  vibeTags as vibeTagsDb,
  SONG_NOTE_REACTIONS,
  type Album,
  type ShareMode,
  type SongNote,
  type SongNoteReactionValue,
  type Thumb,
} from '@/utils/supabase/db';

interface Track {
  trackNumber: number;
  trackName: string;
  // Present on albums picked after the previews feature; older albums until
  // their tracks jsonb is refreshed.
  previewUrl?: string | null;
}

interface Draft {
  id?: string;
  rating: number | null;
  thumb: Thumb | null;
  comment: string;
  favoriteLyric: string;
  remindsMeOf: string;
  initialThoughts: string;
  savedToLibrary: boolean;
  vibeTags: string[];
}

interface OthersNote extends SongNote {
  profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
}

function parseTracks(json: unknown): Track[] {
  if (!Array.isArray(json)) return [];
  return json.filter((t): t is Track => !!t && typeof t === 'object' && 'trackName' in t);
}

// Map a 1–10 score to a red→orange→yellow→green color so a score reads at a
// glance. Shared by the collapsed score badge and the active score buttons.
function scoreColor(n: number): string {
  if (n <= 2) return '#e5484d'; // red
  if (n <= 4) return '#f76b15'; // orange
  if (n <= 6) return '#f5d90a'; // yellow
  if (n <= 8) return '#9bd227'; // lime
  return '#46c26a'; // green
}

const emptyDraft = (): Draft => ({
  rating: null,
  thumb: null,
  comment: '',
  favoriteLyric: '',
  remindsMeOf: '',
  initialThoughts: '',
  savedToLibrary: false,
  vibeTags: [],
});

const hasContent = (d: Draft) =>
  d.rating !== null ||
  d.thumb !== null ||
  d.comment.trim().length > 0 ||
  d.favoriteLyric.trim().length > 0 ||
  d.remindsMeOf.trim().length > 0 ||
  d.initialThoughts.trim().length > 0 ||
  d.savedToLibrary ||
  d.vibeTags.length > 0;

// Per-album song notes: a private, track-by-track listening journal. Each track
// carries a 1–10 score, thumb, vibe tags, a "saved to my library" flag, a Genius
// lyrics link, a shared general comment, and (under "More") private favorite-
// lyric / reminds-me-of / initial-thoughts boxes. Up top sits the album's
// first-listen impression: an Initial Album Review and an Initial Score that
// LOCKS the first time you set it (so initial→final drift stays honest).
//
// You can SHARE your notes for this album with the club — sharing exposes your
// general comment, favorite lyric, and vibe tags (the More boxes stay private).
export default function SongNotesEditor() {
  const { id, albumId } = useLocalSearchParams<{ id: string; albumId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);

  const [album, setAlbum] = useState<Album | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [moreOpen, setMoreOpen] = useState<Set<number>>(new Set());
  const [catalog, setCatalog] = useState<string[]>([...CANONICAL_VIBE_TAGS]);
  const [initialReview, setInitialReview] = useState('');
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [initialLocked, setInitialLocked] = useState(false);
  const [shareMode, setShareMode] = useState<ShareMode | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState<OthersNote[]>([]);
  // Reactions on others' shared notes, keyed by song_note id.
  const [noteReactions, setNoteReactions] = useState<
    Record<string, { profile_id: string; value: SongNoteReactionValue }[]>
  >({});
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string | null>(null);

  // Autosave plumbing: refs hold the freshest values so the debounced flush
  // never reads stale closures; dirtyRef tracks which tracks changed since the
  // last save.
  const draftsRef = useRef(drafts);
  const initialReviewRef = useRef(initialReview);
  const tracksRef = useRef<Track[]>([]);
  const dirtyRef = useRef<Set<number>>(new Set());
  const impDirtyRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});
  draftsRef.current = drafts;
  initialReviewRef.current = initialReview;

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
        favoriteLyric: n.favorite_lyric ?? '',
        remindsMeOf: n.reminds_me_of ?? '',
        initialThoughts: n.initial_thoughts ?? '',
        savedToLibrary: n.saved_to_library,
        vibeTags: n.vibe_tags ?? [],
      };
    }
    setDrafts(map);
  }, [albumId, userId]);

  useEffect(() => {
    if (!albumId || !userId) return;
    albumsDb.get(albumId).then(({ data }) => setAlbum(data ?? null));
    loadMine();
    impressionsDb.mine(albumId, userId).then(({ data }) => {
      if (!data) return;
      setInitialReview(data.initial_review ?? '');
      if (data.initial_score != null) {
        setInitialScore(data.initial_score);
        setInitialLocked(true);
      }
    });
    vibeTagsDb.list().then(({ data }) => {
      const merged = [...CANONICAL_VIBE_TAGS] as string[];
      for (const t of data ?? []) {
        if (!merged.some((m) => m.toLowerCase() === t.name.toLowerCase())) merged.push(t.name);
      }
      setCatalog(merged);
    });
    sharesDb.listForAlbums([albumId]).then(({ data }) => {
      const mine = (data ?? []).find((s) => s.profile_id === userId);
      setShareMode((mine?.mode as ShareMode | undefined) ?? null);
    });
  }, [albumId, userId, loadMine]);

  const tracks = useMemo(() => parseTracks(album?.tracks), [album]);
  tracksRef.current = tracks;

  // Debounced autosave: 1s after the last edit, persist the dirty tracks + the
  // album initial-review. Everything reads from refs so we never save stale
  // data, and edits made mid-save are re-queued.
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), 1000);
  }, []);

  const flush = useCallback(async () => {
    if (!albumId || !userId) return;
    if (savingRef.current) {
      scheduleSave();
      return;
    }
    const dirty = Array.from(dirtyRef.current);
    const impDirty = impDirtyRef.current;
    if (dirty.length === 0 && !impDirty) return;
    dirtyRef.current = new Set();
    impDirtyRef.current = false;
    savingRef.current = true;
    setSaveState('saving');

    const cur = draftsRef.current;
    const nameFor = (n: number) => tracksRef.current.find((t) => t.trackNumber === n)?.trackName ?? '';
    const toUpsert = dirty
      .filter((n) => hasContent(cur[n] ?? emptyDraft()))
      .map((n) => {
        const d = cur[n];
        return {
          album_id: albumId,
          profile_id: userId,
          track_number: n,
          track_name: nameFor(n),
          rating: d.rating,
          thumb: d.thumb,
          comment: d.comment.trim() || null,
          favorite_lyric: d.favoriteLyric.trim() || null,
          reminds_me_of: d.remindsMeOf.trim() || null,
          initial_thoughts: d.initialThoughts.trim() || null,
          saved_to_library: d.savedToLibrary,
          vibe_tags: d.vibeTags,
        };
      });
    const removeNums = dirty.filter((n) => cur[n]?.id && !hasContent(cur[n]!));
    const toRemove = removeNums.map((n) => cur[n]!.id!);

    const ops: PromiseLike<{ error: { message: string } | null; data?: unknown }>[] = [];
    const upIdx = toUpsert.length ? ops.push(songNotesDb.upsertMany(toUpsert)) - 1 : -1;
    if (toRemove.length) ops.push(songNotesDb.removeMany(toRemove));
    if (impDirty)
      ops.push(
        impressionsDb.upsert({
          album_id: albumId,
          profile_id: userId,
          initial_review: initialReviewRef.current.trim() || null,
        }),
      );

    const results = await Promise.all(ops);
    savingRef.current = false;
    const err = results.find((r) => r?.error)?.error;
    if (err) {
      // Re-queue everything so the next edit (or unmount) retries.
      dirty.forEach((n) => dirtyRef.current.add(n));
      if (impDirty) impDirtyRef.current = true;
      setSaveState('error');
      setError(err.message);
      return;
    }
    setError(null);

    // Reconcile server-assigned ids (new rows) and cleared ids (deleted rows)
    // WITHOUT clobbering any text the member typed during the save.
    const upRows =
      upIdx >= 0 ? ((results[upIdx]?.data as { id: string; track_number: number }[] | null) ?? []) : [];
    if (upRows.length || removeNums.length) {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of upRows) {
          if (next[row.track_number]) next[row.track_number] = { ...next[row.track_number], id: row.id };
        }
        for (const n of removeNums) {
          if (next[n]) next[n] = { ...next[n], id: undefined };
        }
        return next;
      });
    }

    if (dirtyRef.current.size || impDirtyRef.current) scheduleSave();
    else setSaveState('saved');
  }, [albumId, userId, scheduleSave]);

  flushRef.current = flush;

  // Persist any pending edits when leaving the screen.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      flushRef.current();
    },
    [],
  );

  const loadOthers = useCallback(async () => {
    if (!albumId || !userId) return;
    const [{ data }, { data: rx }] = await Promise.all([
      songNotesDb.listVisible(albumId),
      noteReactionsDb.listForAlbum(albumId),
    ]);
    setOthers(((data ?? []) as OthersNote[]).filter((n) => n.profile_id !== userId));
    const map: Record<string, { profile_id: string; value: SongNoteReactionValue }[]> = {};
    for (const r of rx ?? []) {
      (map[r.song_note_id] ??= []).push({
        profile_id: r.profile_id,
        value: r.value as SongNoteReactionValue,
      });
    }
    setNoteReactions(map);
  }, [albumId, userId]);

  const toggleShowOthers = () => {
    const next = !showOthers;
    setShowOthers(next);
    if (next && others.length === 0) loadOthers();
  };

  const changeShareMode = async (next: ShareMode | null) => {
    if (!albumId || !userId) return;
    const prev = shareMode;
    setShareMode(next); // optimistic
    const { error: err } = await sharesDb.set(albumId, userId, next);
    if (err) {
      setShareMode(prev);
      setError(err.message);
    }
  };

  const reactToNote = async (noteId: string, value: SongNoteReactionValue) => {
    if (!userId) return;
    const mine = noteReactions[noteId]?.find((r) => r.profile_id === userId);
    // Optimistic: toggle off if re-tapping the same value, else set/replace.
    setNoteReactions((prev) => {
      const rest = (prev[noteId] ?? []).filter((r) => r.profile_id !== userId);
      const next = mine?.value === value ? rest : [...rest, { profile_id: userId, value }];
      return { ...prev, [noteId]: next };
    });
    if (mine?.value === value) await noteReactionsDb.clear(noteId, userId);
    else await noteReactionsDb.set(noteId, userId, value);
  };

  const setDraft = (trackNumber: number, patch: Partial<Draft>) => {
    dirtyRef.current.add(trackNumber);
    setSaveState('pending');
    setDrafts((prev) => ({
      ...prev,
      [trackNumber]: { ...(prev[trackNumber] ?? emptyDraft()), ...patch },
    }));
    scheduleSave();
  };

  const onInitialReviewChange = (v: string) => {
    setInitialReview(v);
    impDirtyRef.current = true;
    setSaveState('pending');
    scheduleSave();
  };

  const toggleExpanded = (trackNumber: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(trackNumber)) next.delete(trackNumber);
      else next.add(trackNumber);
      return next;
    });

  const toggleMore = (trackNumber: number) =>
    setMoreOpen((prev) => {
      const next = new Set(prev);
      if (next.has(trackNumber)) next.delete(trackNumber);
      else next.add(trackNumber);
      return next;
    });

  const createTag = (name: string) => {
    if (!userId) return;
    vibeTagsDb.add(name, userId);
    setCatalog((prev) =>
      prev.some((t) => t.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name],
    );
  };

  const lockInitial = async () => {
    if (!albumId || !userId || initialScore == null || initialLocked) return;
    const ok = await confirmAsync(
      'Lock first-listen score?',
      `Set your first-listen score to ${initialScore.toFixed(1)}? This can't be changed later.`,
    );
    if (!ok) return;
    const { error: err } = await impressionsDb.upsert({
      album_id: albumId,
      profile_id: userId,
      initial_score: initialScore,
      initial_review: initialReview.trim() || null,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setInitialLocked(true);
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

      <ShareModeControl mode={shareMode} onChange={changeShareMode} />
      <View style={styles.toggleRow}>
        <Toggle
          active={showOthers}
          onPress={toggleShowOthers}
          onLabel="👀 Others' notes"
          offLabel="👀 Show others"
        />
      </View>

      <Text
        style={[
          styles.autosave,
          { color: saveState === 'error' ? palette.coral : palette.text3 },
        ]}
      >
        {saveState === 'saving'
          ? 'Saving…'
          : saveState === 'pending'
            ? '✍️ Unsaved changes — saving shortly'
            : saveState === 'error'
              ? '⚠️ Save failed — will retry'
              : saveState === 'saved'
                ? '✓ All changes saved'
                : '✓ Autosaves as you type'}
      </Text>

      {/* First-listen impression: initial review + lock-once initial score. */}
      <Card style={styles.impressionCard}>
        <Text style={[styles.sectionLabel, { color: palette.amber }]}>FIRST LISTEN</Text>
        <TextField
          placeholder="Initial album review — first impressions…"
          value={initialReview}
          onChangeText={onInitialReviewChange}
          multiline
          style={{ minHeight: 70, textAlignVertical: 'top', marginBottom: 12 }}
        />
        <Text style={[styles.fieldLabel, { color: palette.text3 }]}>
          INITIAL SCORE {initialLocked ? '🔒' : ''}
        </Text>
        <Slider
          value={initialScore}
          onChange={setInitialScore}
          disabled={initialLocked}
          accent={palette.amber}
        />
        {initialLocked ? (
          <Text style={[styles.lockNote, { color: palette.text3 }]}>
            Your first-listen score is locked.
          </Text>
        ) : (
          <Button
            title="🔒 Lock first-listen score"
            variant="ghost"
            disabled={initialScore == null}
            onPress={lockInitial}
          />
        )}
      </Card>

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
          const bodyOpen = expanded.has(t.trackNumber);
          const moreShown = moreOpen.has(t.trackNumber);
          return (
            <Card key={t.trackNumber} style={{ marginBottom: 10 }}>
              <View style={styles.trackHead}>
                {t.previewUrl ? (
                  <PreviewArt
                    id={`album:${albumId}:${t.trackNumber}`}
                    uri={album?.artwork_url}
                    previewUrl={t.previewUrl}
                    title={t.trackName}
                    artist={album?.artist ?? undefined}
                    style={styles.trackPreview}
                    glyphSize={10}
                  />
                ) : null}
                <Pressable style={{ flex: 1 }} onPress={() => toggleExpanded(t.trackNumber)}>
                  <Text numberOfLines={2} style={[styles.trackName, { color: palette.text1 }]}>
                    {String(t.trackNumber).padStart(2, '0')}. {t.trackName}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setDraft(t.trackNumber, { savedToLibrary: !d.savedToLibrary })}
                  accessibilityLabel={d.savedToLibrary ? 'Saved to your library' : 'Save to your library'}
                  style={[
                    styles.thumb,
                    { borderColor: palette.border },
                    d.savedToLibrary && { backgroundColor: palette.tealBg, borderColor: palette.teal },
                  ]}
                >
                  <Text style={{ fontSize: 15, color: d.savedToLibrary ? palette.teal : palette.text3 }}>
                    {d.savedToLibrary ? '✓' : '+'}
                  </Text>
                </Pressable>
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
                {d.rating != null ? (
                  <View style={[styles.scoreBadge, { borderColor: scoreColor(d.rating) }]}>
                    <Text style={[styles.scoreBadgeText, { color: scoreColor(d.rating) }]}>
                      {d.rating}
                    </Text>
                  </View>
                ) : null}
                <Pressable onPress={() => toggleExpanded(t.trackNumber)} hitSlop={6}>
                  <Text style={[styles.chevron, { color: palette.text3 }]}>
                    {bodyOpen ? '▴' : '▾'}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.lyricsRow}>
                <Pressable
                  onPress={() => openLyrics(album?.artist, t.trackName)}
                  style={[styles.lyricsBtn, { backgroundColor: palette.amberBg, borderColor: palette.amber }]}
                >
                  <Text style={[styles.lyricsBtnText, { color: palette.amber }]}>Lyrics ↗</Text>
                </Pressable>
                <Pressable
                  onPress={() => openWhoSampled(album?.artist, t.trackName)}
                  style={[styles.lyricsBtn, { backgroundColor: palette.purpleBg, borderColor: palette.purple }]}
                >
                  <Text style={[styles.lyricsBtnText, { color: palette.purple }]}>Samples ↗</Text>
                </Pressable>
                {/* The empty space beside the Lyrics button also toggles the card. */}
                <Pressable style={styles.lyricsFiller} onPress={() => toggleExpanded(t.trackNumber)} />
              </View>

              {bodyOpen ? (
                <View style={[styles.bodyWrap, { borderTopColor: palette.border }]}>
                  <View style={styles.scoreRow}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                      const active = d.rating === n;
                      const c = scoreColor(n);
                      return (
                        <Pressable
                          key={n}
                          onPress={() => setDraft(t.trackNumber, { rating: active ? null : n })}
                          style={[
                            styles.scoreBtn,
                            { backgroundColor: palette.card2, borderColor: palette.border },
                            active && { backgroundColor: c, borderColor: c },
                          ]}
                        >
                          <Text style={[styles.scoreText, { color: active ? '#1a1a1a' : palette.text2 }]}>
                            {n}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <VibeTagPicker
                    selected={d.vibeTags}
                    catalog={catalog}
                    onChange={(next) => setDraft(t.trackNumber, { vibeTags: next })}
                    onCreate={createTag}
                  />

                  <TextField
                    placeholder="Notes on this track…"
                    value={d.comment}
                    onChangeText={(v) => setDraft(t.trackNumber, { comment: v })}
                    multiline
                    style={{ minHeight: 90, textAlignVertical: 'top' }}
                  />

                  <View style={styles.trackActions}>
                    <Pressable onPress={() => toggleMore(t.trackNumber)}>
                      <Text style={[styles.linkText, { color: palette.text3 }]}>
                        {moreShown ? 'Less ▴' : 'More ▾'}
                      </Text>
                    </Pressable>
                  </View>

                  {moreShown ? (
                    <View style={styles.moreWrap}>
                      <TextField
                        placeholder="Favorite lyric from this track…"
                        value={d.favoriteLyric}
                        onChangeText={(v) => setDraft(t.trackNumber, { favoriteLyric: v })}
                        multiline
                        style={{ minHeight: 50, textAlignVertical: 'top' }}
                      />
                      <TextField
                        placeholder="Reminds me of… (another song, a moment, a place)"
                        value={d.remindsMeOf}
                        onChangeText={(v) => setDraft(t.trackNumber, { remindsMeOf: v })}
                        multiline
                        style={{ minHeight: 50, textAlignVertical: 'top' }}
                      />
                      <TextField
                        placeholder="Initial thoughts (private)…"
                        value={d.initialThoughts}
                        onChangeText={(v) => setDraft(t.trackNumber, { initialThoughts: v })}
                        multiline
                        style={{ minHeight: 50, textAlignVertical: 'top' }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

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
                        {memberName(o.profiles?.display_name, o.profiles?.email)}
                      </Text>
                      {o.rating != null ? (
                        <Text style={[styles.otherScore, { color: scoreColor(o.rating) }]}>
                          {o.rating}/10
                        </Text>
                      ) : null}
                      {o.thumb ? <Text style={{ fontSize: 12 }}>{o.thumb === 'up' ? '👍' : '👎'}</Text> : null}
                      {o.comment ? (
                        <ExpandableText
                          text={o.comment}
                          limit={3}
                          style={[styles.otherComment, { color: palette.text1 }]}
                        />
                      ) : null}
                      {o.favorite_lyric ? (
                        <Text style={[styles.otherLyric, { color: palette.text2 }]}>
                          “{o.favorite_lyric}”
                        </Text>
                      ) : null}
                      {o.vibe_tags && o.vibe_tags.length > 0 ? (
                        <Text style={[styles.otherVibes, { color: palette.text3 }]}>
                          {o.vibe_tags.join(' · ')}
                        </Text>
                      ) : null}
                      <NoteReactions
                        reactions={noteReactions[o.id] ?? []}
                        mine={userId}
                        onReact={(value) => reactToNote(o.id, value)}
                      />
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

      <Text style={[styles.footNote, { color: palette.text3 }]}>
        {shareMode === 'now'
          ? 'Shared now: the club can read your comments, favorite lyrics, and vibe tags for this album.'
          : shareMode === 'at_reveal'
            ? 'Shared at reveal: your comments, favorite lyrics, and vibe tags unlock for the club when this cycle is revealed.'
            : 'Private to you. Choose “At reveal” or “Now” to let the club read your comments, favorite lyrics, and vibe tags.'}
      </Text>
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Screen>
  );
}

// A shared note's general comment, clamped to `limit` lines with a "more/less"
// toggle. Measures the full line count once (first layout, unclamped) so the
// toggle only appears when the text actually overflows.
function ExpandableText({
  text,
  limit = 3,
  style,
}: {
  text: string;
  limit?: number;
  style?: StyleProp<TextStyle>;
}) {
  const { palette } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [totalLines, setTotalLines] = useState<number | null>(null);
  const truncatable = totalLines != null && totalLines > limit;
  return (
    <View style={styles.expandable}>
      <Text
        style={style}
        numberOfLines={totalLines == null ? undefined : expanded ? undefined : limit}
        onTextLayout={(e) => {
          if (totalLines == null) setTotalLines(e.nativeEvent.lines.length);
        }}
      >
        {text}
      </Text>
      {truncatable ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
          <Text style={[styles.moreLink, { color: palette.text3 }]}>{expanded ? 'less ▴' : 'more ▾'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Three-way sharing: Private (no row), At reveal, or Now. "At reveal" keeps the
// notes hidden until the cycle is revealed (enforced by the read policy).
function ShareModeControl({
  mode,
  onChange,
}: {
  mode: ShareMode | null;
  onChange: (m: ShareMode | null) => void;
}) {
  const { palette } = useTheme();
  const opts: { key: ShareMode | null; label: string }[] = [
    { key: null, label: '🔒 Private' },
    { key: 'at_reveal', label: '🕓 At reveal' },
    { key: 'now', label: '🔓 Now' },
  ];
  return (
    <View style={styles.shareModeRow}>
      {opts.map((o) => {
        const active = mode === o.key;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onChange(o.key)}
            style={[
              styles.shareSeg,
              { backgroundColor: palette.card2, borderColor: palette.border },
              active && { backgroundColor: palette.tealBg, borderColor: palette.teal },
            ]}
          >
            <Text style={[styles.shareSegText, { color: active ? palette.teal : palette.text2 }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Support / disagree / love on a shared note. Tapping your current reaction
// clears it; tapping another replaces it.
function NoteReactions({
  reactions,
  mine,
  onReact,
}: {
  reactions: { profile_id: string; value: SongNoteReactionValue }[];
  mine: string | null;
  onReact: (value: SongNoteReactionValue) => void;
}) {
  const { palette } = useTheme();
  const myValue = mine ? reactions.find((r) => r.profile_id === mine)?.value : undefined;
  return (
    <View style={styles.noteReactRow}>
      {SONG_NOTE_REACTIONS.map(({ value, emoji }) => {
        const count = reactions.filter((r) => r.value === value).length;
        const active = myValue === value;
        return (
          <Pressable
            key={value}
            onPress={() => onReact(value)}
            style={[
              styles.noteReactBtn,
              { borderColor: palette.border },
              active && { borderColor: palette.teal, backgroundColor: palette.tealBg },
            ]}
          >
            <Text style={{ fontSize: 12 }}>{emoji}</Text>
            {count > 0 ? (
              <Text style={[styles.noteReactCount, { color: palette.text2 }]}>{count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
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
  shareModeRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  shareSeg: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    alignItems: 'center',
  },
  shareSegText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  noteReactRow: { flexBasis: '100%', flexDirection: 'row', gap: 6, marginTop: 6 },
  noteReactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  noteReactCount: { fontFamily: fonts.monoMedium, fontSize: 10 },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  toggle: {
    flex: 1,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  impressionCard: { marginBottom: 10, gap: 4 },
  sectionLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2, marginBottom: 8 },
  fieldLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2, marginBottom: 6 },
  lockNote: { fontFamily: fonts.mono, fontSize: 10, marginTop: 6 },
  estimateCard: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  estimateLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2, marginBottom: 3 },
  estimateSub: { fontFamily: fonts.sans, fontSize: 12 },
  estimateScore: { fontFamily: fonts.sansBold, fontSize: 30 },
  estimateMax: { fontFamily: fonts.monoMedium, fontSize: 12, marginBottom: 4 },
  trackHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  trackPreview: { width: 30, height: 30, borderRadius: radius.sm },
  trackNum: { fontFamily: fonts.monoMedium, fontSize: 11 },
  trackName: { fontFamily: fonts.sansBold, fontSize: 14 },
  lyricsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 10 },
  lyricsFiller: { flex: 1, alignSelf: 'stretch' },
  lyricsBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  lyricsBtnText: { fontFamily: fonts.sansBold, fontSize: 13 },
  bodyWrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  scoreBadge: {
    minWidth: 30,
    height: 28,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  scoreBadgeText: { fontFamily: fonts.sansBold, fontSize: 15 },
  chevron: { fontSize: 14, paddingHorizontal: 2 },
  thumbs: { flexDirection: 'row', gap: 6 },
  thumb: {
    width: 34,
    height: 30,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: { flexDirection: 'row', gap: 4 },
  scoreBtn: {
    flex: 1,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  trackActions: { flexDirection: 'row', justifyContent: 'flex-start' },
  linkText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  moreWrap: { gap: 10 },
  othersWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 10,
    gap: 8,
  },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  otherName: { fontFamily: fonts.sansMedium, fontSize: 12 },
  otherScore: { fontFamily: fonts.sansBold, fontSize: 12 },
  otherComment: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  expandable: { flexBasis: '100%' },
  moreLink: { fontFamily: fonts.monoMedium, fontSize: 10, marginTop: 3 },
  otherLyric: { flexBasis: '100%', fontFamily: fonts.sans, fontSize: 12, fontStyle: 'italic' },
  otherVibes: { flexBasis: '100%', fontFamily: fonts.mono, fontSize: 10 },
  autosave: { fontFamily: fonts.monoMedium, fontSize: 10, textAlign: 'center', marginBottom: 12 },
  footNote: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 10 },
});
