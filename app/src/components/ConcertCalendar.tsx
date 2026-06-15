import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, BottomSheet, Label } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { ConcertRow } from '@/hooks/useConcerts';
import type { ConcertStatus } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

type MemberInfo = Map<
  string,
  { display_name: string | null; avatar_color: number; avatar_url: string | null }
>;

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Distinct profile_ids with the given status across a day's concerts (a member
// going to two shows the same day is only counted once).
function peopleWithStatus(concerts: ConcertRow[], status: ConcertStatus): string[] {
  const ids = new Set<string>();
  concerts.forEach((c) =>
    c.concert_interest.forEach((i) => {
      if (i.status === status) ids.add(i.profile_id);
    }),
  );
  return [...ids];
}

// A row of overlapping avatars with a "+N" overflow chip. Used both on the
// grid cells (going only) and inside the day-detail sheet.
function AvatarStack({
  ids,
  memberInfo,
  size = 16,
  max = 3,
}: {
  ids: string[];
  memberInfo: MemberInfo;
  size?: number;
  max?: number;
}) {
  const { palette } = useTheme();
  if (ids.length === 0) return null;
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((pid, i) => {
        const info = memberInfo.get(pid);
        return (
          <View
            key={pid}
            style={[
              styles.stackItem,
              { marginLeft: i === 0 ? 0 : -size / 3, borderColor: palette.bg },
            ]}
          >
            <Avatar
              name={info?.display_name ?? null}
              colorIndex={info?.avatar_color ?? 0}
              imageUrl={info?.avatar_url}
              size={size}
            />
          </View>
        );
      })}
      {extra > 0 ? (
        <Text style={[styles.stackMore, { color: palette.text3 }]}>+{extra}</Text>
      ) : null}
    </View>
  );
}

// Named avatar chips (avatar + display name), matching the interest lists in
// the concerts list view.
function PeopleRow({
  label,
  ids,
  memberInfo,
  color,
}: {
  label: string;
  ids: string[];
  memberInfo: MemberInfo;
  color: string;
}) {
  const { palette } = useTheme();
  if (ids.length === 0) return null;
  return (
    <View style={styles.peopleGroup}>
      <Text style={[styles.peopleLabel, { color }]}>
        {label} ({ids.length})
      </Text>
      <View style={styles.people}>
        {ids.map((pid) => {
          const info = memberInfo.get(pid);
          return (
            <View key={pid} style={styles.personChip}>
              <Avatar
                name={info?.display_name ?? null}
                colorIndex={info?.avatar_color ?? 0}
                imageUrl={info?.avatar_url}
                size={18}
              />
              <Text style={[styles.personName, { color: palette.text2 }]}>
                {info?.display_name ?? 'Someone'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function ConcertCalendar({
  concerts,
  memberInfo,
}: {
  concerts: ConcertRow[];
  memberInfo: MemberInfo;
}) {
  const { palette } = useTheme();

  // YYYY-MM-DD → concerts on that day. Null dates ("Date TBA") can't be placed.
  const byDay = useMemo(() => {
    const m = new Map<string, ConcertRow[]>();
    concerts.forEach((c) => {
      if (!c.concert_date) return;
      const list = m.get(c.concert_date);
      if (list) list.push(c);
      else m.set(c.concert_date, [c]);
    });
    return m;
  }, [concerts]);

  // Open on the soonest upcoming concert's month, else the current month.
  const [month, setMonth] = useState(() => {
    const today = new Date();
    const todayKey = dayKey(today);
    const upcoming = [...byDay.keys()].filter((k) => k >= todayKey).sort();
    const seed = upcoming[0] ?? [...byDay.keys()].sort().pop() ?? todayKey;
    const [y, mo] = seed.split('-').map(Number);
    return new Date(y, mo - 1, 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const stepMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const todayKey = dayKey(new Date());

  // Cells: leading blanks for the 1st's weekday, then each day of the month.
  const cells = useMemo(() => {
    const year = month.getFullYear();
    const mo = month.getMonth();
    const firstWeekday = new Date(year, mo, 1).getDay();
    const daysInMonth = new Date(year, mo + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(`${year}-${pad(mo + 1)}-${pad(d)}`);
    return out;
  }, [month]);

  const monthLabel = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedConcerts = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const selectedLabel = selectedDay
    ? new Date(`${selectedDay}T12:00:00`).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <View>
      <View style={styles.header}>
        <Pressable onPress={() => stepMonth(-1)} hitSlop={10} style={styles.navBtn}>
          <Text style={[styles.nav, { color: palette.text2 }]}>‹</Text>
        </Pressable>
        <Text style={[styles.monthLabel, { color: palette.text1 }]}>{monthLabel}</Text>
        <Pressable onPress={() => stepMonth(1)} hitSlop={10} style={styles.navBtn}>
          <Text style={[styles.nav, { color: palette.text2 }]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={[styles.weekday, { color: palette.text3 }]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((key, i) => {
          if (!key) return <View key={`b${i}`} style={styles.cell} />;
          const dayConcerts = byDay.get(key);
          const has = !!dayConcerts && dayConcerts.length > 0;
          const isToday = key === todayKey;
          const goingIds = has ? peopleWithStatus(dayConcerts!, 'going') : [];
          const dayNum = Number(key.split('-')[2]);
          return (
            <Pressable
              key={key}
              style={styles.cell}
              disabled={!has}
              onPress={() => setSelectedDay(key)}
            >
              <View
                style={[
                  styles.cellInner,
                  isToday && { borderColor: palette.border2, backgroundColor: palette.card2 },
                ]}
              >
                <Text
                  style={[
                    styles.dayNum,
                    { color: has ? palette.text1 : palette.text3 },
                    isToday && { color: palette.teal },
                  ]}
                >
                  {dayNum}
                </Text>
                {has ? (
                  goingIds.length > 0 ? (
                    <AvatarStack ids={goingIds} memberInfo={memberInfo} size={14} max={3} />
                  ) : (
                    <View style={[styles.dot, { backgroundColor: palette.teal }]} />
                  )
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <BottomSheet visible={!!selectedDay} onClose={() => setSelectedDay(null)}>
        <Label>{selectedLabel}</Label>
        {selectedConcerts.map((c) => {
          const going = c.concert_interest.filter((i) => i.status === 'going').map((i) => i.profile_id);
          const interested = c.concert_interest
            .filter((i) => i.status === 'interested')
            .map((i) => i.profile_id);
          return (
            <View key={c.id} style={[styles.sheetConcert, { borderColor: palette.border }]}>
              <Text style={[styles.sheetArtist, { color: palette.text1 }]}>{c.artist}</Text>
              {c.venue ? (
                <Text style={[styles.sheetVenue, { color: palette.text2 }]}>{c.venue}</Text>
              ) : null}
              <View style={styles.byRow}>
                <Avatar
                  name={c.profiles?.display_name ?? null}
                  colorIndex={c.profiles?.avatar_color ?? 0}
                  imageUrl={c.profiles?.avatar_url}
                  size={16}
                />
                <Text style={[styles.by, { color: palette.text3 }]}>
                  added by {c.profiles?.display_name ?? 'someone'}
                </Text>
              </View>
              <View style={styles.sheetLists}>
                <PeopleRow label="Going" ids={going} memberInfo={memberInfo} color={palette.purple} />
                <PeopleRow
                  label="Interested"
                  ids={interested}
                  memberInfo={memberInfo}
                  color={palette.teal}
                />
                {going.length === 0 && interested.length === 0 ? (
                  <Text style={[styles.noOne, { color: palette.text3 }]}>No RSVPs yet.</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: { paddingHorizontal: 10, paddingVertical: 2 },
  nav: { fontFamily: fonts.sans, fontSize: 26, lineHeight: 28 },
  monthLabel: { fontFamily: fonts.sansBold, fontSize: 15 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 0.82, padding: 2 },
  cellInner: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    paddingTop: 5,
    gap: 3,
  },
  dayNum: { fontFamily: fonts.mono, fontSize: 12 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackItem: { borderRadius: 999, borderWidth: 1.5 },
  stackMore: { fontFamily: fonts.monoMedium, fontSize: 8, marginLeft: 2 },
  sheetConcert: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 4,
    gap: 4,
  },
  sheetArtist: { fontFamily: fonts.sansBold, fontSize: 15 },
  sheetVenue: { fontFamily: fonts.sans, fontSize: 12 },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  by: { fontFamily: fonts.mono, fontSize: 10 },
  sheetLists: { marginTop: 8, gap: 8 },
  peopleGroup: { gap: 5 },
  peopleLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  personName: { fontFamily: fonts.sans, fontSize: 12 },
  noOne: { fontFamily: fonts.sans, fontSize: 12 },
});
