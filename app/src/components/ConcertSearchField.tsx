import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, Button, Label, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { searchConcerts, US_STATES, type ConcertEvent } from '@/utils/ticketmaster';

// Date-range presets layered over the keyword search. 'any' leaves the upper
// bound open (only future events, server-side); the rest bound the window.
type DatePreset = 'any' | 'month' | '3m' | 'year';
const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'any', label: 'Any date' },
  { key: 'month', label: 'This month' },
  { key: '3m', label: 'Next 3 mo' },
  { key: 'year', label: 'This year' },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Map a preset to concrete YYYY-MM-DD bounds (today → end of the window).
function presetRange(preset: DatePreset): { startDate?: string; endDate?: string } {
  const today = new Date();
  if (preset === 'month') {
    return { startDate: isoDay(today), endDate: isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
  }
  if (preset === '3m') {
    return {
      startDate: isoDay(today),
      endDate: isoDay(new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())),
    };
  }
  if (preset === 'year') {
    return { startDate: isoDay(today), endDate: isoDay(new Date(today.getFullYear(), 11, 31)) };
  }
  return {};
}

// Optional autofill for the concert composer: a Ticketmaster type-ahead that, on
// pick, hands back a normalized event to populate artist/date/venue/ticket link.
// Mirrors SongSearchField. Manual entry stays fully available — search just saves
// typing when the show is listed (US by default; flip to worldwide for non-US
// shows, which Ticketmaster covers less completely). US searches can be narrowed
// by state and date range, and results page in via "Load more".
export function ConcertSearchField({
  onPick,
}: {
  onPick: (event: ConcertEvent) => void;
}) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [worldwide, setWorldwide] = useState(false);
  const [stateCode, setStateCode] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('any');
  const [results, setResults] = useState<ConcertEvent[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stateSheet, setStateSheet] = useState(false);
  const searchSeq = useRef(0);

  const stateName = stateCode ? US_STATES.find((s) => s.code === stateCode)?.name ?? stateCode : 'All states';

  // Run a fresh search (page 0, replacing results) with the current filters.
  const run = async (
    term: string,
    filters?: { worldwide?: boolean; stateCode?: string; datePreset?: DatePreset },
  ) => {
    const ww = filters?.worldwide ?? worldwide;
    const sc = filters?.stateCode ?? stateCode;
    const dp = filters?.datePreset ?? datePreset;
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      setSearching(false);
      setPage(0);
      setTotalPages(0);
      return;
    }
    setSearching(true);
    const res = await searchConcerts(term, {
      countryCode: ww ? '' : 'US',
      stateCode: ww ? '' : sc,
      page: 0,
      ...presetRange(dp),
    });
    if (seq === searchSeq.current) {
      setResults(res.results);
      setPage(res.page);
      setTotalPages(res.totalPages);
      setSearching(false);
    }
  };

  const onChangeText = (t: string) => {
    setQuery(t);
    run(t);
  };

  const loadMore = async () => {
    if (loadingMore || query.trim().length < 3) return;
    const seq = searchSeq.current; // don't append if a newer search started
    setLoadingMore(true);
    const res = await searchConcerts(query, {
      countryCode: worldwide ? '' : 'US',
      stateCode: worldwide ? '' : stateCode,
      page: page + 1,
      ...presetRange(datePreset),
    });
    if (seq === searchSeq.current) {
      setResults((prev) => [...prev, ...res.results]);
      setPage(res.page);
      setTotalPages(res.totalPages);
    }
    setLoadingMore(false);
  };

  const toggleWorldwide = () => {
    const next = !worldwide;
    setWorldwide(next);
    if (query.trim().length >= 3) run(query, { worldwide: next });
  };

  const pickState = (code: string) => {
    setStateCode(code);
    setStateSheet(false);
    if (query.trim().length >= 3) run(query, { stateCode: code });
  };

  const pickPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (query.trim().length >= 3) run(query, { datePreset: preset });
  };

  const pick = (ev: ConcertEvent) => {
    searchSeq.current++; // cancel any in-flight search
    setResults([]);
    setQuery('');
    setSearching(false);
    setPage(0);
    setTotalPages(0);
    onPick(ev);
  };

  const formatWhen = (ev: ConcertEvent) => {
    if (!ev.date) return 'Date TBA';
    const d = new Date(`${ev.date}T${ev.time ?? '12:00:00'}`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const valid = query.trim().length >= 3;
  const hasMore = totalPages > page + 1;

  return (
    <View>
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <TextField
            placeholder="Search live events… (e.g. Phoebe Bridgers)"
            value={query}
            onChangeText={onChangeText}
            autoCorrect={false}
          />
        </View>
        <Pressable
          onPress={toggleWorldwide}
          style={[
            styles.marketBtn,
            { borderColor: palette.border, backgroundColor: palette.card2 },
            worldwide && { borderColor: palette.teal, backgroundColor: palette.tealBg },
          ]}
        >
          <Text style={[styles.marketText, { color: worldwide ? palette.teal : palette.text3 }]}>
            {worldwide ? '🌍 World' : '🇺🇸 US'}
          </Text>
        </Pressable>
      </View>

      {/* Filters: state (US only) + date-range presets. */}
      <View style={styles.filterRow}>
        {!worldwide ? (
          <Pressable
            onPress={() => setStateSheet(true)}
            style={[
              styles.filterChip,
              { borderColor: stateCode ? palette.teal : palette.border, backgroundColor: stateCode ? palette.tealBg : palette.card2 },
            ]}
          >
            <Text style={[styles.filterChipText, { color: stateCode ? palette.teal : palette.text3 }]}>
              📍 {stateName} ▾
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetRow}
        keyboardShouldPersistTaps="handled"
      >
        {DATE_PRESETS.map((p) => {
          const active = datePreset === p.key;
          return (
            <Pressable
              key={p.key}
              onPress={() => pickPreset(p.key)}
              style={[
                styles.filterChip,
                { borderColor: active ? palette.teal : palette.border, backgroundColor: active ? palette.tealBg : palette.card2 },
              ]}
            >
              <Text style={[styles.filterChipText, { color: active ? palette.teal : palette.text3 }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {searching && results.length === 0 && valid ? (
        <Text style={[styles.empty, { color: palette.text3 }]}>Searching…</Text>
      ) : null}
      {!searching && results.length === 0 && valid ? (
        <Text style={[styles.empty, { color: palette.text3 }]}>
          No events found — try the {worldwide ? 'US' : 'worldwide'} filter, widen the date range, or enter it manually below.
        </Text>
      ) : null}
      {results.map((ev) => (
        <Pressable
          key={ev.id}
          onPress={() => pick(ev)}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? palette.card2 : 'transparent' }]}
        >
          {ev.imageUrl ? (
            <Image source={{ uri: ev.imageUrl }} style={styles.art} contentFit="cover" />
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.title, { color: palette.text1 }]}>{ev.artist}</Text>
            <Text numberOfLines={1} style={[styles.sub, { color: palette.text2 }]}>
              {formatWhen(ev)}{ev.venue ? ` · ${ev.venue}` : ''}
            </Text>
          </View>
        </Pressable>
      ))}
      {hasMore ? (
        <Button title="Load more" variant="ghost" onPress={loadMore} loading={loadingMore} style={{ marginTop: 4 }} />
      ) : null}

      <BottomSheet visible={stateSheet} onClose={() => setStateSheet(false)}>
        <Label>Filter by state</Label>
        <ScrollView style={styles.stateList} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => pickState('')} style={styles.stateRow}>
            <Text style={[styles.stateText, { color: !stateCode ? palette.teal : palette.text1 }]}>All states</Text>
          </Pressable>
          {US_STATES.map((s) => (
            <Pressable key={s.code} onPress={() => pickState(s.code)} style={styles.stateRow}>
              <Text style={[styles.stateText, { color: stateCode === s.code ? palette.teal : palette.text1 }]}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marketBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  marketText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 8, paddingRight: 4 },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  empty: { fontFamily: fonts.sans, fontSize: 12, paddingVertical: 8, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  art: { width: 48, height: 36, borderRadius: radius.sm },
  title: { fontFamily: fonts.sansMedium, fontSize: 14 },
  sub: { fontFamily: fonts.sans, fontSize: 11 },
  stateList: { maxHeight: 360, marginTop: 8 },
  stateRow: { paddingVertical: 11, paddingHorizontal: 4 },
  stateText: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
