import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, InlineNote, Label, NoClubSelected, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts, radius } from '@/theme';
import {
  clubFavorites as favoritesDb,
  cycles as cyclesDb,
  showdown as showdownDb,
  type Album,
  type ClubFavoriteTrack,
  type Cycle,
  type ShowdownHistoryRow,
} from '@/utils/supabase/db';

interface ClosedCycle extends Cycle {
  albums: Album[];
}

// History tab: every closed cycle, newest first. Each card opens the cycle's
// highlights detail page.
export default function HistoryTab() {
  const { palette } = useTheme();
  const router = useRouter();
  const clubId = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const { club, members } = useClubData(clubId);
  const [closed, setClosed] = useState<ClosedCycle[]>([]);
  const [favorites, setFavorites] = useState<ClubFavoriteTrack[]>([]);
  const [showdowns, setShowdowns] = useState<ShowdownHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const [{ data }, { data: favs }, { data: sd }] = await Promise.all([
      cyclesDb.listClosed(clubId),
      favoritesDb.listByClub(clubId),
      showdownDb.history(clubId),
    ]);
    setClosed((data ?? []) as ClosedCycle[]);
    setFavorites((favs ?? []) as ClubFavoriteTrack[]);
    setShowdowns((sd as ShowdownHistoryRow[] | null) ?? []);
    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { refreshing, onRefresh } = useRefresh(refresh);

  if (!clubId) return <NoClubSelected what="history" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>EVERY CYCLE SO FAR</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>📜 History</Text>
      </View>

      <Label>All-time favorites</Label>
      <Card style={{ marginBottom: 14 }}>
        {favorites.length === 0 ? (
          <Text style={[styles.favEmpty, { color: palette.text3 }]}>
            The club's best songs collect here — 1–3 are added automatically each time a cycle
            closes.
          </Text>
        ) : (
          <>
            {favorites.slice(0, 6).map((f) => (
              <View key={f.id} style={styles.favRow}>
                <Text style={styles.favStar}>⭐</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.favTitle, { color: palette.text1 }]}>
                    {f.title}
                  </Text>
                  {f.artist ? (
                    <Text numberOfLines={1} style={[styles.favArtist, { color: palette.text2 }]}>
                      {f.artist}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {favorites.length > 6 ? (
              <Text style={[styles.favMore, { color: palette.text3 }]}>
                +{favorites.length - 6} more
              </Text>
            ) : null}
          </>
        )}
        {club?.spotify_favorites_playlist_url ? (
          <Pressable
            onPress={() => Linking.openURL(club.spotify_favorites_playlist_url!)}
            style={({ pressed }) => [styles.playlistBtn, { opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={styles.playlistPlay}>
              <Text style={styles.playlistPlayIcon}>▶</Text>
            </View>
            <Text style={styles.playlistBtnText}>All-Time Favorites playlist</Text>
          </Pressable>
        ) : favorites.length > 0 ? (
          <Text style={[styles.favEmpty, { color: palette.text3, marginTop: 10 }]}>
            Connect Spotify (club settings → streaming) to get these as a playlist.
          </Text>
        ) : null}
      </Card>

      {showdowns.length > 0 ? (
        <>
          <Label>Jukebox Showdown winners</Label>
          <Card style={{ marginBottom: 14 }}>
            {showdowns.map((s, i) => (
              <Pressable
                key={s.cycle_id}
                onPress={() => router.push(`/club/${clubId}/theme/${s.cycle_id}`)}
                style={({ pressed }) => [
                  styles.sdRow,
                  { borderBottomColor: palette.border },
                  i === showdowns.length - 1 && styles.sdRowLast,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.sdTrophy}>🏆</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.sdTheme, { color: palette.text3 }]}>
                    Cycle {s.cycle_number} · {s.theme_text}
                  </Text>
                  {s.winner_title ? (
                    <>
                      <Text numberOfLines={1} style={[styles.sdWinner, { color: palette.text1 }]}>
                        {s.winner_title}
                        {s.winner_artist ? <Text style={{ color: palette.text3 }}> · {s.winner_artist}</Text> : null}
                      </Text>
                      {s.winner_submitter ? (
                        <Text numberOfLines={1} style={[styles.sdBy, { color: palette.text3 }]}>
                          submitted by {s.winner_submitter}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={[styles.sdBy, { color: palette.text3 }]}>No entries</Text>
                  )}
                </View>
                <Text style={{ color: palette.text3 }}>›</Text>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      <Label>Past cycles</Label>
      {closed.length === 0 ? (
        <InlineNote
          text={loading ? 'Loading…' : 'No closed cycles yet — finished cycles show up here with their highlights.'}
        />
      ) : (
        closed.map((c) => {
          const picker = members.find((m) => m.profile_id === c.picker_id);
          const pickerName = picker?.profiles?.display_name ?? 'someone';
          const albums = c.albums.slice().sort((a, b) => a.slot - b.slot);
          return (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/club/${clubId}/cycle/${c.id}`)}
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <Card style={{ marginBottom: 10 }}>
                <View style={styles.head}>
                  <Text style={[styles.cycleNum, { color: palette.teal }]}>CYCLE {c.number}</Text>
                  <Text style={[styles.picker, { color: palette.text3 }]}>picked by {pickerName}</Text>
                  <Text style={{ color: palette.text3 }}>›</Text>
                </View>
                <View style={styles.artRow}>
                  {albums.map((a) =>
                    a.artwork_url ? (
                      <Image key={a.id} source={{ uri: a.artwork_url }} style={styles.art} contentFit="cover" />
                    ) : (
                      <View key={a.id} style={[styles.art, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                        <Text style={{ fontSize: 22 }}>🎵</Text>
                      </View>
                    ),
                  )}
                  <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                    {albums.map((a) => (
                      <Text key={a.id} numberOfLines={1} style={[styles.albumLine, { color: palette.text1 }]}>
                        {a.title} <Text style={{ color: palette.text3 }}>· {a.artist}</Text>
                      </Text>
                    ))}
                  </View>
                </View>
                {c.meeting_at ? (
                  <Text style={[styles.meta, { color: palette.text3 }]}>
                    {new Date(c.meeting_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { marginBottom: 18 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cycleNum: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1.5 },
  picker: { flex: 1, fontFamily: fonts.sans, fontSize: 12 },
  artRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  art: { width: 52, height: 52, borderRadius: radius.sm },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  albumLine: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 20 },
  meta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 10 },
  favEmpty: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  favRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  favStar: { fontSize: 14 },
  favTitle: { fontFamily: fonts.sansMedium, fontSize: 14 },
  favArtist: { fontFamily: fonts.sans, fontSize: 12, marginTop: 1 },
  favMore: { fontFamily: fonts.mono, fontSize: 11, marginTop: 4 },
  sdRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  sdRowLast: { borderBottomWidth: 0 },
  sdTrophy: { fontSize: 18 },
  sdTheme: { fontFamily: fonts.mono, fontSize: 11 },
  sdWinner: { fontFamily: fonts.sansMedium, fontSize: 14, marginTop: 2 },
  sdBy: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1 },
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
