import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { cycles as cyclesDb, streaming, type Cycle, type CycleHighlights } from '@/utils/supabase/db';

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
                      </Text>
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

          {/* ── Top songs ─────────────────────────────────────────────── */}
          {data.top_songs.length > 0 ? (
            <>
              <Label>Top songs</Label>
              <Card>
                {data.top_songs.map((s, i) => (
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
                        {rv.display_name ?? '(no name)'}
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

          {/* ── Popular feed shares ───────────────────────────────────── */}
          {data.popular_shares.length > 0 ? (
            <>
              <Label>Popular from the feed</Label>
              <Card>
                {data.popular_shares.map((p, i) => (
                  <Pressable
                    key={p.post_id}
                    onPress={() => router.push({ pathname: '/feed', params: { focus: String(p.post_id) } })}
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
});
