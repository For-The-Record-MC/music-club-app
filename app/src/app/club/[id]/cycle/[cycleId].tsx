import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { memberName } from '@/utils/memberName';
import { cycles as cyclesDb, streaming, type Cycle, type CycleHighlights } from '@/utils/supabase/db';

// Ranked lists collapse to this many rows by default, with a "show more" toggle.
const COLLAPSE = 5;

// History detail: a closed cycle's highlights — album scores & winner, the
// combined-signal top songs, standout reviews, and popular feed shares.
export default function CycleHighlightsScreen() {
  const { id, cycleId } = useLocalSearchParams<{ id: string; cycleId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const { myRole } = useClubData(id);
  const [data, setData] = useState<CycleHighlights | null>(null);
  const [cycleRow, setCycleRow] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  // Long ranked lists collapse to the first 5 by default.
  const [showAllTop, setShowAllTop] = useState(false);
  const [showAllSaved, setShowAllSaved] = useState(false);

  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const refresh = useCallback(async () => {
    if (!cycleId) return;
    const [{ data: d, error: err }, { data: row }] = await Promise.all([
      cyclesDb.highlights(cycleId),
      cyclesDb.get(cycleId),
    ]);
    if (err) setError(err.message);
    else setData(d as unknown as CycleHighlights);
    setCycleRow(row ?? null);
    setLoading(false);
  }, [cycleId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { refreshing, onRefresh } = useRefresh(refresh);

  const generate = async () => {
    if (!id || !cycleId) return;
    setGenerating(true);
    setError(null);
    const { data: res } = await streaming.generateHighlights(id, cycleId);
    setGenerating(false);
    if (res?.ok) {
      await refresh();
    } else {
      setError(
        res?.reason === 'not_connected'
          ? 'Connect Spotify (club settings → streaming) to build playlists.'
          : res?.reason === 'needs_reconnect'
            ? 'Spotify needs reconnecting before playlists can be built.'
            : res?.message ?? 'Could not build the playlist.',
      );
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>CYCLE HIGHLIGHTS</Text>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text1 }]}>
            {data ? `Cycle ${data.cycle.number}` : '…'}
            {data?.cycle.picker_name ? (
              <Text style={[styles.titleSub, { color: palette.text3 }]}>
                {'  '}· picked by {data.cycle.picker_name}
              </Text>
            ) : null}
          </Text>
        </View>
      </View>

      {error ? <InlineNote text={error} tone="error" /> : null}
      {loading && !data ? <InlineNote text="Loading…" /> : null}

      {data ? (
        <>
          {/* ── Album scores & winner ────────────────────────────────── */}
          <Label>Album scores</Label>
          {data.albums.map((a) => {
            const isWinner = data.winner_album_id === a.album_id;
            return (
              <Pressable
                key={a.album_id}
                onPress={() => router.push(`/club/${id}/album/${a.album_id}`)}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              >
                <Card style={{ marginBottom: 8 }}>
                  <View style={styles.albumRow}>
                    {a.artwork_url ? (
                      <Image source={{ uri: a.artwork_url }} style={styles.art} contentFit="cover" />
                    ) : (
                      <View style={[styles.art, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                        <Text style={{ fontSize: 24 }}>🎵</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {isWinner ? (
                        <Text style={[styles.winner, { color: palette.amber }]}>👑 CLUB FAVORITE</Text>
                      ) : null}
                      <Text numberOfLines={1} style={[styles.albumName, { color: palette.text1 }]}>
                        {a.title}
                      </Text>
                      <Text numberOfLines={1} style={[styles.albumMeta, { color: palette.text2 }]}>
                        {a.artist}
                      </Text>
                      <Text style={[styles.albumStats, { color: palette.text3 }]}>
                        {a.rating_count} rating{a.rating_count === 1 ? '' : 's'}
                        {a.min_score != null && a.max_score != null
                          ? ` · ${a.min_score}–${a.max_score} spread`
                          : ''}
                        {a.favorite_votes > 0 ? ` · 👑 ${a.favorite_votes}` : ''}
                        {a.avg_replayability != null ? ` · ↻ ${a.avg_replayability}` : ''}
                      </Text>
                      {a.avg_initial != null && a.avg_score != null ? (
                        <Text style={[styles.driftLine, { color: palette.text3 }]}>
                          first listen {a.avg_initial} →{' '}
                          <Text
                            style={{
                              color:
                                a.avg_score >= a.avg_initial ? palette.teal : palette.coral,
                            }}
                          >
                            {a.avg_score} ({a.avg_score >= a.avg_initial ? '+' : ''}
                            {Math.round((a.avg_score - a.avg_initial) * 10) / 10})
                          </Text>
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.avgBadge, { backgroundColor: palette.tealBg }]}>
                      <Text style={[styles.avgScore, { color: palette.teal }]}>
                        {a.avg_score ?? '—'}
                      </Text>
                      <Text style={[styles.avgLabel, { color: palette.teal }]}>AVG</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })}

          {/* ── Cycle vibe ────────────────────────────────────────────── */}
          {data.cycle_vibe.length > 0 ? (
            <>
              <Label>Cycle vibe</Label>
              <Card>
                <View style={styles.vibeWrap}>
                  {data.cycle_vibe.map((v) => (
                    <View
                      key={v.tag}
                      style={[styles.vibeChip, { backgroundColor: palette.purpleBg }]}
                    >
                      <Text style={[styles.vibeChipText, { color: palette.purple }]}>{v.tag}</Text>
                      <Text style={[styles.vibeChipCount, { color: palette.text3 }]}>{v.count}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </>
          ) : null}

          {/* ── One-sentence takes ────────────────────────────────────── */}
          {data.takes.length > 0 ? (
            <>
              <Label>One-sentence takes</Label>
              <Card>
                {data.takes.map((tk, i) => (
                  <View
                    key={`${tk.album_id}-${tk.profile_id}`}
                    style={[
                      styles.takeRow,
                      i > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <Avatar
                      name={tk.display_name}
                      colorIndex={tk.avatar_color}
                      imageUrl={tk.avatar_url}
                      size={26}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.takeText, { color: palette.text1 }]}>“{tk.take}”</Text>
                      <Text numberOfLines={1} style={[styles.takeMeta, { color: palette.text3 }]}>
                        {memberName(tk.display_name, tk.email)} · {tk.album_title}
                      </Text>
                    </View>
                    <Text style={[styles.takeScore, { color: palette.teal }]}>{tk.score}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* ── Head to head ──────────────────────────────────────────── */}
          {data.head_to_head.length > 0 ? (
            <>
              <Label>Head to head</Label>
              {data.head_to_head.map((h) => (
                <Card key={h.profile_id} style={{ marginBottom: 8 }}>
                  <View style={styles.reviewHead}>
                    <Avatar
                      name={h.display_name}
                      colorIndex={h.avatar_color}
                      imageUrl={h.avatar_url}
                      size={26}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.reviewName, { color: palette.text1 }]}>
                        {memberName(h.display_name, h.email)}
                      </Text>
                      <Text numberOfLines={1} style={[styles.reviewAlbum, { color: palette.text3 }]}>
                        👑 preferred {h.album_title}
                      </Text>
                    </View>
                  </View>
                  {h.preference_reason ? (
                    <Text style={[styles.reviewText, { color: palette.text1 }]}>
                      {h.preference_reason}
                    </Text>
                  ) : null}
                  {h.other_album_merit ? (
                    <Text style={[styles.h2hMerit, { color: palette.text3 }]}>
                      But the other did better: {h.other_album_merit}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </>
          ) : null}

          {/* ── Best 3-song run ───────────────────────────────────────── */}
          {data.best_runs.length > 0 ? (
            <>
              <Label>Best 3-song run</Label>
              {data.best_runs.map((br) => (
                <Card key={br.album_id} style={{ marginBottom: 8 }}>
                  <Text style={[styles.runAlbum, { color: palette.text3 }]}>{br.album_title}</Text>
                  <Text style={[styles.runTracks, { color: palette.text1 }]}>
                    {br.tracks.join(' → ')}
                  </Text>
                  <Text style={[styles.runMeta, { color: palette.text3 }]}>
                    {br.picks} pick{br.picks === 1 ? '' : 's'}
                    {br.avg_rating != null ? ` · avg ${br.avg_rating}/10` : ''}
                  </Text>
                </Card>
              ))}
            </>
          ) : null}

          {/* ── Most saved ────────────────────────────────────────────── */}
          {data.most_saved.length > 0 ? (
            <>
              <Label>Most saved to libraries</Label>
              <Card>
                {(showAllSaved ? data.most_saved : data.most_saved.slice(0, COLLAPSE)).map((s, i) => (
                  <View
                    key={`${s.album_id}-${s.track_name}`}
                    style={[
                      styles.songRow,
                      i > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <Text style={[styles.rank, { color: palette.amber }]}>★</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>
                        {s.track_name}
                      </Text>
                      <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>
                        {s.album_title}
                      </Text>
                    </View>
                    <Text style={[styles.reactionCount, { color: palette.text3 }]}>
                      saved ×{s.saves}
                    </Text>
                  </View>
                ))}
              </Card>
              <ShowMoreRow
                total={data.most_saved.length}
                expanded={showAllSaved}
                onToggle={() => setShowAllSaved((v) => !v)}
              />
            </>
          ) : null}

          {/* ── Favorite lyrics ───────────────────────────────────────── */}
          {data.favorite_lyrics.length > 0 ? (
            <>
              <Label>Favorite lyrics</Label>
              <Card>
                {data.favorite_lyrics.map((fl, i) => (
                  <View
                    key={`${fl.album_id}-${i}`}
                    style={[
                      styles.lyricRow,
                      i > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}
                  >
                    <Text style={[styles.lyricText, { color: palette.text1 }]}>“{fl.lyric}”</Text>
                    <Text numberOfLines={1} style={[styles.lyricMeta, { color: palette.text3 }]}>
                      {memberName(fl.display_name, fl.email)} · {fl.context}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {/* ── Standout reviews ──────────────────────────────────────── */}
          {data.reviews.length > 0 ? (
            <>
              <Label>Standout reviews</Label>
              {data.reviews.map((rv) => (
                <Card key={`${rv.album_id}-${rv.profile_id}-${rv.kind}`} style={{ marginBottom: 8 }}>
                  <View style={styles.reviewHead}>
                    <Avatar
                      name={rv.display_name}
                      colorIndex={rv.avatar_color}
                      imageUrl={rv.avatar_url}
                      size={28}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.reviewName, { color: palette.text1 }]}>
                        {memberName(rv.display_name, rv.email)}
                      </Text>
                      <Text numberOfLines={1} style={[styles.reviewAlbum, { color: palette.text3 }]}>
                        {rv.kind === 'high' ? '▲ highest' : '▼ lowest'} · {rv.album_title}
                      </Text>
                    </View>
                    <Text
                      style={[styles.reviewScore, { color: rv.kind === 'high' ? palette.teal : palette.coral }]}
                    >
                      {rv.score}/10
                    </Text>
                  </View>
                  <Text style={[styles.reviewText, { color: palette.text1 }]}>{rv.review}</Text>
                </Card>
              ))}
            </>
          ) : null}

          {/* ── Top songs ─────────────────────────────────────────────── */}
          {data.top_songs.length > 0 ? (
            <>
              <Label>Top songs</Label>
              <Card>
                {(showAllTop ? data.top_songs : data.top_songs.slice(0, COLLAPSE)).map((s, i) => (
                  <View
                    key={`${s.source}-${s.post_id ?? s.album_id}-${s.title}-${i}`}
                    style={[styles.songRow, i > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }]}
                  >
                    <Text style={[styles.rank, { color: palette.text3 }]}>{i + 1}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>
                        {s.title}
                      </Text>
                      {s.artist ? (
                        <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>
                          {s.artist}
                        </Text>
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.songTag,
                        s.source === 'album'
                          ? { backgroundColor: palette.purpleBg }
                          : { backgroundColor: palette.tealBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.songTagText,
                          { color: s.source === 'album' ? palette.purple : palette.teal },
                        ]}
                      >
                        {s.source === 'album' ? 'ALBUM' : 'FEED'}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
              <ShowMoreRow
                total={data.top_songs.length}
                expanded={showAllTop}
                onToggle={() => setShowAllTop((v) => !v)}
              />
            </>
          ) : null}

          {/* ── Popular feed shares ───────────────────────────────────── */}
          {data.popular_shares.length > 0 ? (
            <>
              <Label>Popular from the feed</Label>
              <Card>
                {data.popular_shares.map((p, i) => (
                  <Pressable
                    key={p.post_id}
                    onPress={() => router.push({ pathname: '/clubhouse/activity', params: { focus: String(p.post_id) } })}
                    style={({ pressed }) => [
                      styles.shareRow,
                      i > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    {p.artwork_url ? (
                      <Image source={{ uri: p.artwork_url }} style={styles.shareArt} contentFit="cover" />
                    ) : (
                      <View style={[styles.shareArt, styles.artFallback, { backgroundColor: palette.tealBg }]}>
                        <Text style={{ fontSize: 18 }}>🎵</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.songTitle, { color: palette.text1 }]}>
                        {p.title}
                      </Text>
                      {p.artist ? (
                        <Text numberOfLines={1} style={[styles.songArtist, { color: palette.text2 }]}>
                          {p.artist}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.reactionCount, { color: palette.text3 }]}>♥ {p.reactions}</Text>
                  </Pressable>
                ))}
              </Card>
            </>
          ) : null}

          {/* ── Playlists ─────────────────────────────────────────────── */}
          {cycleRow?.spotify_highlights_playlist_url ? (
            <Pressable
              onPress={() => Linking.openURL(cycleRow.spotify_highlights_playlist_url!)}
              style={({ pressed }) => [styles.playlistBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={styles.playlistPlay}>
                <Text style={styles.playlistPlayIcon}>▶</Text>
              </View>
              <Text style={styles.playlistBtnText}>Cycle {data.cycle.number} Highlights</Text>
            </Pressable>
          ) : isAdmin && data.top_songs.length > 0 ? (
            <Button
              title={generating ? 'Building…' : '🎶 Generate highlights playlist'}
              onPress={generate}
              loading={generating}
              style={{ marginTop: 14 }}
            />
          ) : null}

          {data.cycle.spotify_playlist_url ? (
            <Pressable
              onPress={() => Linking.openURL(data.cycle.spotify_playlist_url!)}
              style={({ pressed }) => [styles.playlistBtn, { opacity: pressed ? 0.85 : 1, marginTop: 10 }]}
            >
              <View style={styles.playlistPlay}>
                <Text style={styles.playlistPlayIcon}>▶</Text>
              </View>
              <Text style={styles.playlistBtnText}>Cycle {data.cycle.number} Feed Playlist</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

// "Show N more / Show less" toggle under a list collapsed to COLLAPSE rows.
// Renders nothing when the list is short enough to show in full.
function ShowMoreRow({
  total,
  expanded,
  onToggle,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { palette } = useTheme();
  if (total <= COLLAPSE) return null;
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.showMore, { borderColor: palette.border }]}
    >
      <Text style={[styles.showMoreText, { color: palette.text2 }]}>
        {expanded ? '▴ Show less' : `▾ Show ${total - COLLAPSE} more`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  titleSub: { fontFamily: fonts.sans, fontSize: 12 },
  albumRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  art: { width: 60, height: 60, borderRadius: radius.md },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  winner: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5, marginBottom: 2 },
  albumName: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 1 },
  albumMeta: { fontFamily: fonts.sans, fontSize: 12 },
  albumStats: { fontFamily: fonts.mono, fontSize: 10, marginTop: 3 },
  driftLine: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  vibeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  vibeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  vibeChipText: { fontFamily: fonts.sansMedium, fontSize: 12 },
  vibeChipCount: { fontFamily: fonts.monoMedium, fontSize: 10 },
  takeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  takeText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  takeMeta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  takeScore: { fontFamily: fonts.sansBold, fontSize: 15 },
  runAlbum: { fontFamily: fonts.mono, fontSize: 10, marginBottom: 4 },
  runTracks: { fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 20 },
  runMeta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 4 },
  lyricRow: { paddingVertical: 9 },
  lyricText: { fontFamily: fonts.sans, fontSize: 13, fontStyle: 'italic', lineHeight: 19 },
  lyricMeta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 3 },
  h2hMerit: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, marginTop: 6, fontStyle: 'italic' },
  avgBadge: { alignItems: 'center', borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 7 },
  avgScore: { fontFamily: fonts.sansBold, fontSize: 19 },
  avgLabel: { fontFamily: fonts.monoMedium, fontSize: 8, letterSpacing: 1 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  rank: { fontFamily: fonts.monoMedium, fontSize: 13, width: 18, textAlign: 'center' },
  songTitle: { fontFamily: fonts.sansMedium, fontSize: 14 },
  songArtist: { fontFamily: fonts.sans, fontSize: 12, marginTop: 1 },
  songTag: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3 },
  songTagText: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  reviewName: { fontFamily: fonts.sansBold, fontSize: 13 },
  reviewAlbum: { fontFamily: fonts.mono, fontSize: 10, marginTop: 1 },
  reviewScore: { fontFamily: fonts.sansBold, fontSize: 15 },
  reviewText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  shareArt: { width: 40, height: 40, borderRadius: radius.sm },
  reactionCount: { fontFamily: fonts.monoMedium, fontSize: 11 },
  playlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#1DB954',
    borderRadius: radius.lg,
    paddingVertical: 13,
    marginTop: 14,
  },
  playlistPlay: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistPlayIcon: { color: '#1DB954', fontSize: 11, marginLeft: 1 },
  playlistBtnText: { fontFamily: fonts.sansBold, fontSize: 14, color: '#fff', letterSpacing: 0.2 },
  showMore: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  showMoreText: { fontFamily: fonts.monoMedium, fontSize: 12 },
});
