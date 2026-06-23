import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, ListenLinks, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import {
  albums as albumsDb,
  cycles as cyclesDb,
  ratings as ratingsDb,
  songNoteShares as songNoteSharesDb,
  songNotes as songNotesDb,
  type Album,
  type AlbumSummary,
  type Cycle,
  type Rating,
  type SongNote,
} from '@/utils/supabase/db';

interface RevealedRating extends Rating {
  profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null;
}

// Album detail — where the visibility ladder lives:
//  pre-submit: who has rated (checklist) + your "Rate it" CTA
//  post-submit: + the club average (numbers only)
//  revealed:   + everyone's scores, reviews, favorite/least tracks.
export default function AlbumDetail() {
  const { id, albumId } = useLocalSearchParams<{ id: string; albumId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { members } = useClubData(id);

  const [album, setAlbum] = useState<Album | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [summary, setSummary] = useState<AlbumSummary | null>(null);
  const [revealed, setRevealed] = useState<RevealedRating[]>([]);
  // Per-member shared song notes (only members with a song_note_shares row), keyed
  // by profile_id — surfaced beneath their rating card once the cycle is revealed.
  const [sharedNotes, setSharedNotes] = useState<Record<string, SongNote[]>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!albumId) return;
    const { data: a } = await albumsDb.get(albumId);
    setAlbum(a ?? null);
    if (a) {
      const [{ data: c }, { data: s }] = await Promise.all([
        cyclesDb.get(a.cycle_id),
        ratingsDb.summary(albumId),
      ]);
      setCycle(c ?? null);
      const sum = (s as unknown as AlbumSummary) ?? null;
      setSummary(sum);
      if (sum?.revealed) {
        const [{ data: r }, { data: shareRows }, { data: noteRows }] = await Promise.all([
          ratingsDb.listRevealed(albumId),
          songNoteSharesDb.listForAlbums([albumId]),
          songNotesDb.listVisible(albumId),
        ]);
        setRevealed((r ?? []) as RevealedRating[]);
        const sharers = new Set((shareRows ?? []).map((sr) => sr.profile_id));
        const grouped: Record<string, SongNote[]> = {};
        for (const n of (noteRows ?? []) as SongNote[]) {
          if (sharers.has(n.profile_id)) (grouped[n.profile_id] ??= []).push(n);
        }
        setSharedNotes(grouped);
      }
    }
  }, [albumId]);

  const toggleNotes = (profileId: string) =>
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!album) {
    return (
      <Screen>
        <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12 }}>Loading…</Text>
      </Screen>
    );
  }

  const mineSubmitted = summary?.mine_submitted ?? false;
  // Ratings freeze at reveal, not close — once revealed_at is set, no more edits.
  const isOpen = cycle?.status === 'open' && !cycle?.revealed_at;
  const submittedSet = new Set(summary?.submitted ?? []);

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>
          {cycle ? `CYCLE ${cycle.number} · ALBUM ${album.slot}` : ''}
        </Text>
      </View>

      <Card>
        <View style={styles.heroRow}>
          {album.artwork_url ? (
            <Image source={{ uri: album.artwork_url }} style={styles.art} contentFit="cover" />
          ) : (
            <View style={[styles.art, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
              <Text style={{ fontSize: 30 }}>🎵</Text>
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.albumName, { color: palette.text1 }]}>{album.title}</Text>
            <Text style={[styles.albumMeta, { color: palette.text2 }]}>
              {album.artist}
              {album.year ? ` · ${album.year}` : ''}
            </Text>
            <ListenLinks apple={album.apple_url} spotify={album.spotify_url} style={styles.listenRow} />
          </View>
          {summary?.avg_score != null ? (
            <View style={[styles.avgBadge, { backgroundColor: palette.tealBg }]}>
              <Text style={[styles.avgScore, { color: palette.teal }]}>{summary.avg_score}</Text>
              <Text style={[styles.avgLabel, { color: palette.teal }]}>CLUB AVG</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {isOpen ? (
        <Button
          title={mineSubmitted ? '✏️ Edit your rating' : '⭐ Rate this album'}
          onPress={() => router.push(`/club/${id}/rate/${albumId}`)}
          style={{ marginBottom: 12 }}
        />
      ) : null}

      <Label>
        {summary?.revealed ? 'The reveal' : `Submitted (${summary?.count ?? 0}/${members.length})`}
      </Label>

      {!summary?.revealed ? (
        <Card>
          {members.map((m) => {
            const done = submittedSet.has(m.profile_id);
            return (
              <View key={m.id} style={styles.checkRow}>
                <Avatar
                  name={m.profiles?.display_name ?? null}
                  colorIndex={m.profiles?.avatar_color ?? 0}
                  imageUrl={m.profiles?.avatar_url}
                  size={28}
                />
                <Text style={[styles.checkName, { color: palette.text1 }]}>
                  {m.profiles?.display_name ?? '(no name)'}
                </Text>
                <Text
                  style={[
                    styles.checkMark,
                    { color: done ? palette.teal : palette.text3 },
                  ]}
                >
                  {done ? '✓ rated' : '· listening'}
                </Text>
              </View>
            );
          })}
          <InlineNote
            text={
              mineSubmitted
                ? 'Scores and reviews stay sealed until the reveal at the meeting.'
                : 'Submit your rating to see the running club average.'
            }
          />
        </Card>
      ) : (
        <>
          {revealed.map((r) => (
            <Card key={r.id} style={{ marginBottom: 8 }}>
              <View style={styles.revealHead}>
                <Avatar
                  name={r.profiles?.display_name ?? null}
                  colorIndex={r.profiles?.avatar_color ?? 0}
                  imageUrl={r.profiles?.avatar_url}
                  size={32}
                />
                <Text style={[styles.revealName, { color: palette.text1 }]}>
                  {r.profiles?.display_name ?? '(no name)'}
                </Text>
                <Text style={[styles.revealScore, { color: palette.amber }]}>{r.score}/10</Text>
              </View>
              {r.review ? (
                <Text style={[styles.revealReview, { color: palette.text1 }]}>{r.review}</Text>
              ) : null}
              {r.favorite_track ? (
                <Text style={[styles.trackLine, { color: palette.teal }]}>
                  ▲ {r.favorite_track}
                  {r.favorite_reason ? (
                    <Text style={{ color: palette.text2 }}> — {r.favorite_reason}</Text>
                  ) : null}
                </Text>
              ) : null}
              {r.least_track ? (
                <Text style={[styles.trackLine, { color: palette.coral }]}>
                  ▼ {r.least_track}
                  {r.least_reason ? (
                    <Text style={{ color: palette.text2 }}> — {r.least_reason}</Text>
                  ) : null}
                </Text>
              ) : null}
              {sharedNotes[r.profile_id]?.length ? (
                <>
                  <Pressable
                    onPress={() => toggleNotes(r.profile_id)}
                    style={[styles.notesToggle, { borderTopColor: palette.border }]}
                  >
                    <Text style={[styles.notesToggleText, { color: palette.purple }]}>
                      📝 Song notes ({sharedNotes[r.profile_id].length}){' '}
                      {expandedNotes.has(r.profile_id) ? '▾' : '›'}
                    </Text>
                  </Pressable>
                  {expandedNotes.has(r.profile_id)
                    ? sharedNotes[r.profile_id].map((n) => (
                        <View key={n.id} style={styles.noteRow}>
                          <Text style={[styles.noteTrack, { color: palette.text1 }]} numberOfLines={1}>
                            {n.track_name}
                          </Text>
                          {n.rating != null ? (
                            <Text style={[styles.noteScore, { color: palette.teal }]}>{n.rating}/10</Text>
                          ) : null}
                          {n.thumb ? (
                            <Text style={{ fontSize: 12 }}>{n.thumb === 'up' ? '👍' : '👎'}</Text>
                          ) : null}
                          {n.comment ? (
                            <Text style={[styles.noteComment, { color: palette.text2 }]}>
                              {n.comment}
                            </Text>
                          ) : null}
                        </View>
                      ))
                    : null}
                </>
              ) : null}
            </Card>
          ))}
          {revealed.length === 0 ? <InlineNote text="No ratings were submitted." /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  art: { width: 72, height: 72, borderRadius: radius.md },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  albumName: { fontFamily: fonts.sansBold, fontSize: 18, marginBottom: 2 },
  albumMeta: { fontFamily: fonts.sans, fontSize: 13, marginBottom: 4 },
  listenRow: { marginTop: 6 },
  avgBadge: {
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  avgScore: { fontFamily: fonts.sansBold, fontSize: 20 },
  avgLabel: { fontFamily: fonts.monoMedium, fontSize: 8, letterSpacing: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkName: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  checkMark: { fontFamily: fonts.monoMedium, fontSize: 11 },
  revealHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  revealName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 13 },
  revealScore: { fontFamily: fonts.sansBold, fontSize: 16 },
  revealReview: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20, marginBottom: 6 },
  trackLine: { fontFamily: fonts.sansMedium, fontSize: 12, lineHeight: 18, marginTop: 2 },
  notesToggle: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  notesToggleText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', paddingVertical: 4 },
  noteTrack: { fontFamily: fonts.sansMedium, fontSize: 12, maxWidth: '60%' },
  noteScore: { fontFamily: fonts.sansBold, fontSize: 12 },
  noteComment: { flexBasis: '100%', fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
});
