import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';
import { searchConcerts, type ConcertEvent } from '@/utils/ticketmaster';

// Optional autofill for the concert composer: a Ticketmaster type-ahead that, on
// pick, hands back a normalized event to populate artist/date/venue/ticket link.
// Mirrors SongSearchField. Manual entry stays fully available — search just saves
// typing when the show is listed (US by default; flip to worldwide for non-US
// shows, which Ticketmaster covers less completely).
export function ConcertSearchField({
  onPick,
}: {
  onPick: (event: ConcertEvent) => void;
}) {
  const { palette } = useTheme();
  const [query, setQuery] = useState('');
  const [worldwide, setWorldwide] = useState(false);
  const [results, setResults] = useState<ConcertEvent[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  const runSearch = async (term: string, country = worldwide ? '' : 'US') => {
    setQuery(term);
    const seq = ++searchSeq.current;
    if (term.trim().length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const hits = await searchConcerts(term, country);
    if (seq === searchSeq.current) {
      setResults(hits);
      setSearching(false);
    }
  };

  const toggleWorldwide = () => {
    const next = !worldwide;
    setWorldwide(next);
    // Re-run the current query against the new market so results update in place.
    if (query.trim().length >= 3) runSearch(query, next ? '' : 'US');
  };

  const pick = (ev: ConcertEvent) => {
    searchSeq.current++; // cancel any in-flight search
    setResults([]);
    setQuery('');
    setSearching(false);
    onPick(ev);
  };

  const formatWhen = (ev: ConcertEvent) => {
    if (!ev.date) return 'Date TBA';
    const d = new Date(`${ev.date}T${ev.time ?? '12:00:00'}`);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <View>
      <View style={styles.searchRow}>
        <View style={{ flex: 1 }}>
          <TextField
            placeholder="Search live events… (e.g. Phoebe Bridgers)"
            value={query}
            onChangeText={(t) => runSearch(t)}
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
      {searching && results.length === 0 && query.trim().length >= 3 ? (
        <Text style={[styles.empty, { color: palette.text3 }]}>Searching…</Text>
      ) : null}
      {!searching && results.length === 0 && query.trim().length >= 3 ? (
        <Text style={[styles.empty, { color: palette.text3 }]}>
          No events found — try the {worldwide ? 'US' : 'worldwide'} filter or enter it manually below.
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
  empty: { fontFamily: fonts.sans, fontSize: 12, paddingVertical: 8, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4 },
  art: { width: 48, height: 36, borderRadius: radius.sm },
  title: { fontFamily: fonts.sansMedium, fontSize: 14 },
  sub: { fontFamily: fonts.sans, fontSize: 11 },
});
