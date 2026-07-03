import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Card, InlineNote, Label, Loading, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts, radius } from '@/theme';
import { memberName } from '@/utils/memberName';
import {
  archive as archiveDb,
  auxBattle as auxBattleDb,
  clubFavorites as favoritesDb,
  cycles as cyclesDb,
  perfectPlaylist as perfectPlaylistDb,
  showdown as showdownDb,
  type Album,
  type ArchiveAlbum,
  type ClubFavoriteTrack,
  type Cycle,
  type ShowdownHistoryRow,
} from '@/utils/supabase/db';

interface ClosedCycle extends Cycle {
  albums: Album[];
}

interface PlaylistHistoryRow {
  id: string;
  theme_text: string;
  spotify_playlist_url: string | null;
  cycles: { number: number } | null;
  perfect_playlist_songs: { count: number }[];
}

interface AuxHistoryRow {
  id: string;
  theme_text: string;
  winner: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null;
  cycles: { number: number } | null;
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
  const [playlists, setPlaylists] = useState<PlaylistHistoryRow[]>([]);
  const [auxWins, setAuxWins] = useState<AuxHistoryRow[]>([]);
  const [archived, setArchived] = useState<ArchiveAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    if (!clubId) return;
    const [{ data }, { data: favs }, { data: sd }, { data: pl }, { data: ax }, { data: arch }] = await Promise.all([
      cyclesDb.listClosed(clubId),
      favoritesDb.listByClub(clubId),
      showdownDb.history(clubId),
      perfectPlaylistDb.history(clubId),
      auxBattleDb.history(clubId),
      archiveDb.list(clubId),
    ]);
    setClosed((data ?? []) as ClosedCycle[]);
    setFavorites((favs ?? []) as ClubFavoriteTrack[]);
    setShowdowns((sd as ShowdownHistoryRow[] | null) ?? []);
    setPlaylists((pl ?? []) as unknown as PlaylistHistoryRow[]);
    setAuxWins((ax ?? []) as unknown as AuxHistoryRow[]);
    setArchived((arch ?? []) as unknown as ArchiveAlbum[]);
    setLoading(false);
  }, [clubId]);

  // Drop the previous club's data the moment the selection changes — every
  // section here renders straight off these arrays, so stale rows would flash
  // while the new club's fetch is in flight.
  useEffect(() => {
    setLoading(true);
    setClosed([]);
    setFavorites([]);
    setShowdowns([]);
    setPlaylists([]);
    setAuxWins([]);
    setArchived([]);
  }, [clubId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const { refreshing, onRefresh } = useRefresh(refresh);

  if (!clubId) return <NoClubSelected what="history" />;

  // Flat, searchable index of every album the club has on record — closed-cycle
  // picks plus the Archive. Matches title or artist; cycle picks deep-link to the
  // cycle detail, Archive albums to their own page.
  const q = search.trim().toLowerCase();
  const matches = q
    ? [
        ...closed.flatMap((c) =>
          c.albums.map((a) => ({
            id: a.id,
            title: a.title,
            artist: a.artist,
            artwork_url: a.artwork_url,
            sub: `Cycle ${c.number}`,
            route: `/club/${clubId}/cycle/${c.id}` as const,
          })),
        ),
        ...archived.map((a) => ({
          id: a.id,
          title: a.title,
          artist: a.artist,
          artwork_url: a.artwork_url,
          sub: 'The Archive',
          route: `/club/${clubId}/album/${a.id}` as const,
        })),
      ].filter((a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q))
    : [];

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>EVERY CYCLE SO FAR</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>⏪ Rewind</Text>
      </View>

      <TextField
        placeholder="Search albums by title or artist…"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />

      {q ? (
        <View style={{ marginTop: 12 }}>
          <Label>
            {matches.length} result{matches.length === 1 ? '' : 's'}
          </Label>
          {matches.length === 0 ? (
            <InlineNote text="No albums match — try a different title or artist." />
          ) : (
            matches.map((a) => (
              <Pressable
                key={`${a.sub}-${a.id}`}
                onPress={() => router.push(a.route)}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
              >
                <Card style={{ marginBottom: 8 }}>
                  <View style={styles.searchRow}>
                    {a.artwork_url ? (
                      <Image source={{ uri: a.artwork_url }} style={styles.searchArt} contentFit="cover" />
                    ) : (
                      <View style={[styles.searchArt, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                        <Text style={{ fontSize: 18 }}>🎵</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.albumLine, { color: palette.text1 }]}>
                        {a.title}
                      </Text>
                      <Text numberOfLines={1} style={[styles.archiveArtist, { color: palette.text3 }]}>
                        {a.artist}
                      </Text>
                    </View>
                    <Text style={[styles.searchSub, { color: palette.text3 }]}>{a.sub}</Text>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      ) : (
        <>
      <View style={{ height: 20 }} />
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

      {playlists.length > 0 ? (
        <>
          <Label>Perfect Playlists</Label>
          <Card style={{ marginBottom: 14 }}>
            {playlists.map((p, i) => {
              const count = p.perfect_playlist_songs?.[0]?.count ?? 0;
              return (
                <Pressable
                  key={p.id}
                  onPress={p.spotify_playlist_url ? () => Linking.openURL(p.spotify_playlist_url!) : undefined}
                  disabled={!p.spotify_playlist_url}
                  style={({ pressed }) => [
                    styles.sdRow,
                    { borderBottomColor: palette.border },
                    i === playlists.length - 1 && styles.sdRowLast,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.sdTrophy}>🎶</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.sdWinner, { color: palette.text1 }]}>
                      {p.theme_text}
                    </Text>
                    <Text numberOfLines={1} style={[styles.sdBy, { color: palette.text3 }]}>
                      Cycle {p.cycles?.number ?? '?'} · {count} song{count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  {p.spotify_playlist_url ? <Text style={{ color: palette.spotify }}>▶</Text> : null}
                </Pressable>
              );
            })}
          </Card>
        </>
      ) : null}

      {auxWins.length > 0 ? (
        <>
          <Label>Aux Battle winners</Label>
          <Card style={{ marginBottom: 14 }}>
            {auxWins.map((a, i) => (
              <View
                key={a.id}
                style={[styles.sdRow, { borderBottomColor: palette.border }, i === auxWins.length - 1 && styles.sdRowLast]}
              >
                <Avatar name={a.winner?.display_name ?? null} colorIndex={a.winner?.avatar_color ?? 0} imageUrl={a.winner?.avatar_url ?? null} size={28} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.sdWinner, { color: palette.text1 }]}>
                    {memberName(a.winner?.display_name, a.winner?.email)}
                  </Text>
                  <Text numberOfLines={1} style={[styles.sdBy, { color: palette.text3 }]}>
                    Cycle {a.cycles?.number ?? '?'} · {a.theme_text}
                  </Text>
                </View>
                <Text style={styles.sdTrophy}>🏆</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Label>Past cycles</Label>
      {closed.length === 0 ? (
        loading ? (
          <Loading />
        ) : (
          <InlineNote text="No closed cycles yet — finished cycles show up here with their highlights." />
        )
      ) : (
        closed.map((c) => {
          const picker = members.find((m) => m.profile_id === c.picker_id);
          const pickerName = picker?.profiles?.display_name ?? 'someone';
          const albums = c.albums.slice().sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
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

      {archived.length > 0 ? (
        <>
          <View style={{ marginTop: 18 }}>
            <Label>The Archive · before the club</Label>
          </View>
          <View style={styles.archiveGrid}>
            {archived
              .slice()
              .sort((a, b) => a.artist.localeCompare(b.artist))
              .map((a) => {
              const claimer = a.claimer;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => router.push(`/club/${clubId}/album/${a.id}`)}
                  style={({ pressed }) => [styles.archiveCard, pressed && { opacity: 0.7 }]}
                >
                  {a.artwork_url ? (
                    <Image source={{ uri: a.artwork_url }} style={styles.archiveArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.archiveArt, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                      <Text style={{ fontSize: 22 }}>🎵</Text>
                    </View>
                  )}
                  <Text numberOfLines={1} style={[styles.archiveTitle, { color: palette.text1 }]}>
                    {a.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.archiveArtist, { color: palette.text3 }]}>
                    {a.artist}
                  </Text>
                  {claimer ? (
                    <View style={styles.archiveClaimerRow}>
                      <Avatar
                        name={claimer.display_name}
                        colorIndex={claimer.avatar_color}
                        imageUrl={claimer.avatar_url}
                        size={18}
                      />
                      <Text numberOfLines={1} style={[styles.archiveClaimer, { color: palette.teal }]}>
                        {claimer.display_name ?? 'claimed'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.claimChip, { backgroundColor: palette.tealBg }]}>
                      <Text style={[styles.claimChipText, { color: palette.teal }]}>CLAIM</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
        </>
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
  archiveGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  archiveCard: { width: '31%', minWidth: 96 },
  archiveArt: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, marginBottom: 5 },
  archiveTitle: { fontFamily: fonts.sansMedium, fontSize: 12 },
  archiveArtist: { fontFamily: fonts.sans, fontSize: 11, marginTop: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  searchArt: { width: 44, height: 44, borderRadius: radius.sm },
  searchSub: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5 },
  archiveClaimerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  archiveClaimer: { fontFamily: fonts.monoMedium, fontSize: 10, flexShrink: 1 },
  claimChip: { alignSelf: 'flex-start', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 },
  claimChipText: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1 },
});
