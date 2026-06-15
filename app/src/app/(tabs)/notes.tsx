import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, InlineNote, Label, NoClubSelected, Screen } from '@/components/ui';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts, radius } from '@/theme';
import {
  albums as albumsDb,
  cycles as cyclesDb,
  songNotes as songNotesDb,
  type Album,
  type Cycle,
} from '@/utils/supabase/db';

interface CycleWithAlbums extends Cycle {
  albums: Album[];
}

function parseTrackCount(json: unknown): number {
  return Array.isArray(json) ? json.length : 0;
}

// Song Notes tab: a personal, per-track listening journal. Cycle pills filter
// which cycle's albums you're looking at (defaults to the current open cycle);
// tapping an album opens its note editor.
export default function NotesTab() {
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const clubId = useCurrentClubStore((s) => s.clubId) ?? undefined;

  const [cycles, setCycles] = useState<CycleWithAlbums[]>([]);
  const [noted, setNoted] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId || !userId) return;
    const [{ data: open }, { data: closed }] = await Promise.all([
      cyclesDb.current(clubId),
      cyclesDb.listClosed(clubId),
    ]);
    const list: CycleWithAlbums[] = [];
    if (open) {
      const { data: a } = await albumsDb.listByCycle(open.id);
      list.push({ ...open, albums: a ?? [] });
    }
    for (const c of (closed ?? []) as CycleWithAlbums[]) {
      list.push({ ...c, albums: (c.albums ?? []).slice().sort((x, y) => x.slot - y.slot) });
    }
    setCycles(list);
    // Keep the current pick only if it belongs to THIS club's cycles; otherwise
    // fall back to the first (so switching clubs doesn't strand a stale id and
    // render an empty tab).
    setSelected((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list[0]?.id ?? null)));

    const albumIds = list.flatMap((c) => c.albums.map((a) => a.id));
    if (albumIds.length) {
      const { data: notes } = await songNotesDb.mineForAlbums(albumIds, userId);
      const counts: Record<string, number> = {};
      for (const n of notes ?? []) counts[n.album_id] = (counts[n.album_id] ?? 0) + 1;
      setNoted(counts);
    } else {
      setNoted({});
    }
    setLoading(false);
  }, [clubId, userId]);

  // Clear the previous club's data the moment the club changes, so the tab shows
  // a loading state rather than flashing the old club's albums while load() runs.
  useEffect(() => {
    setLoading(true);
    setCycles([]);
    setNoted({});
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  const { refreshing, onRefresh } = useRefresh(load);
  const current = useMemo(() => cycles.find((c) => c.id === selected) ?? null, [cycles, selected]);

  if (!clubId) return <NoClubSelected what="song notes" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHILE YOU LISTEN</Text>
        <Text style={[styles.title, { color: palette.text1 }]}>Song notes</Text>
        <Text style={[styles.sub, { color: palette.text2 }]}>
          Jot a rating, a thumb, and a thought on each track. Private to you until you share.
        </Text>
      </View>

      {cycles.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillRow}
        >
          {cycles.map((c, i) => {
            const active = c.id === selected;
            const label = c.status === 'open' && i === 0 ? 'Current' : `Cycle ${c.number}`;
            return (
              <Pressable
                key={c.id}
                onPress={() => setSelected(c.id)}
                style={[
                  styles.pill,
                  { backgroundColor: palette.card2, borderColor: palette.border },
                  active && { backgroundColor: palette.tealBg, borderColor: palette.teal },
                ]}
              >
                <Text
                  style={[styles.pillText, { color: active ? palette.teal : palette.text2 }]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12 }}>Loading…</Text>
      ) : !current || current.albums.length === 0 ? (
        <Card style={{ alignItems: 'center', paddingVertical: 30 }}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>📝</Text>
          <Text style={[styles.emptyTitle, { color: palette.text1 }]}>No albums to note yet</Text>
          <Text style={[styles.emptySub, { color: palette.text2 }]}>
            Once a cycle's albums are picked, they'll show up here for track-by-track notes.
          </Text>
        </Card>
      ) : (
        <>
          <Label>{current.status === 'open' ? 'Now listening' : `Cycle ${current.number}`}</Label>
          {current.albums.map((a) => {
            const total = parseTrackCount(a.tracks);
            const done = noted[a.id] ?? 0;
            return (
              <Card key={a.id} style={{ marginBottom: 10 }}>
                <Pressable
                  onPress={() => router.push(`/club/${clubId}/notes/${a.id}`)}
                  style={({ pressed }) => [styles.albumRow, pressed && { opacity: 0.7 }]}
                >
                  {a.artwork_url ? (
                    <Image source={{ uri: a.artwork_url }} style={styles.art} contentFit="cover" />
                  ) : (
                    <View style={[styles.art, styles.artFallback, { backgroundColor: palette.purpleBg }]}>
                      <Text style={{ fontSize: 26 }}>🎵</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.albumName, { color: palette.text1 }]}>
                      {a.title}
                    </Text>
                    <Text numberOfLines={1} style={[styles.albumMeta, { color: palette.text2 }]}>
                      {a.artist}
                      {a.year ? ` · ${a.year}` : ''}
                    </Text>
                    <Text style={[styles.notedHint, { color: done > 0 ? palette.teal : palette.purple }]}>
                      {done > 0
                        ? `📝 ${done}${total ? `/${total}` : ''} track${done === 1 ? '' : 's'} noted ›`
                        : '📝 add song notes ›'}
                    </Text>
                  </View>
                </Pressable>
              </Card>
            );
          })}
          <InlineNote text="Your notes ride along to the rating screen so your first impressions are handy when you score the album." />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 22, marginBottom: 4 },
  sub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  pillRow: { gap: 8, paddingBottom: 14 },
  pill: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 6 },
  emptySub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  albumRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  art: { width: 60, height: 60, borderRadius: radius.md },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  albumName: { fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 1 },
  albumMeta: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 3 },
  notedHint: { fontFamily: fonts.monoMedium, fontSize: 10 },
});
