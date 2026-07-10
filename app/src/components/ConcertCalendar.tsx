import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, BottomSheet, Label } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import type { ConcertRow } from '@/hooks/useConcerts';
import { concerts as concertsDb, type ConcertStatus } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

type MemberInfo = Map<
  string,
  { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null }
>;

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Sentinel "day" for the date-TBA sheet — never collides with a YYYY-MM-DD key.
const TBA = 'tba';

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
// grid cells and inside the day-detail sheet.
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

// The concert-day badge: cross-fades between the day's "faces" — the artist
// photo(s) from Ticketmaster, the poster's avatar, and the going/interested
// stack. A single face just renders static.
function RotatingBadge({ faces, intervalMs = 2600 }: { faces: ReactNode[]; intervalMs?: number }) {
  const [idx, setIdx] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (faces.length < 2) return;
    const timer = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setIdx((i) => i + 1);
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [faces.length, intervalMs, opacity]);

  if (faces.length === 0) return null;
  return <Animated.View style={{ opacity, alignItems: 'center' }}>{faces[idx % faces.length]}</Animated.View>;
}

// One concert's entry in the day-detail sheet: artist photo, venue/time/price,
// RSVP pills (tap to toggle your status right from the calendar), tickets
// link, and who's in.
function SheetConcert({
  concert,
  memberInfo,
  userId,
  onChange,
}: {
  concert: ConcertRow;
  memberInfo: MemberInfo;
  userId: string | null;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const going = concert.concert_interest.filter((i) => i.status === 'going').map((i) => i.profile_id);
  const interested = concert.concert_interest
    .filter((i) => i.status === 'interested')
    .map((i) => i.profile_id);
  const myStatus = concert.concert_interest.find((i) => i.profile_id === userId)?.status ?? null;

  const when = concert.concert_time
    ? new Date(`${concert.concert_date ?? '2000-01-01'}T${concert.concert_time}`).toLocaleTimeString(
        undefined,
        { hour: 'numeric', minute: '2-digit' },
      )
    : null;

  const setStatus = async (status: ConcertStatus) => {
    if (!userId) return;
    await concertsDb.setInterest(concert.id, userId, myStatus === status ? null : status);
    onChange();
  };

  return (
    <View style={[styles.sheetConcert, { borderColor: palette.border }]}>
      <View style={styles.sheetHead}>
        {concert.image_url ? (
          <Image source={{ uri: concert.image_url }} style={styles.sheetArt} contentFit="cover" />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sheetArtist, { color: palette.text1 }]}>{concert.artist}</Text>
          {concert.venue ? (
            <Text style={[styles.sheetVenue, { color: palette.text2 }]}>{concert.venue}</Text>
          ) : null}
          <Text style={[styles.sheetMeta, { color: palette.text3 }]}>
            {[when, concert.price].filter(Boolean).join(' · ') || ' '}
          </Text>
          <View style={styles.byRow}>
            <Avatar
              name={concert.profiles?.display_name ?? null}
              colorIndex={concert.profiles?.avatar_color ?? 0}
              imageUrl={concert.profiles?.avatar_url}
              size={16}
            />
            <Text style={[styles.by, { color: palette.text3 }]}>
              added by {concert.profiles?.display_name ?? 'someone'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.sheetActions}>
        <Pressable
          onPress={() => setStatus('interested')}
          style={[
            styles.pill,
            { borderColor: palette.border, backgroundColor: palette.card2 },
            myStatus === 'interested' && { borderColor: palette.teal, backgroundColor: palette.tealBg },
          ]}
        >
          <Text style={[styles.pillText, { color: myStatus === 'interested' ? palette.teal : palette.text3 }]}>
            {myStatus === 'interested' ? '✓ Interested' : 'Interested'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setStatus('going')}
          style={[
            styles.pill,
            { borderColor: palette.border, backgroundColor: palette.card2 },
            myStatus === 'going' && { borderColor: palette.purple, backgroundColor: palette.purpleBg },
          ]}
        >
          <Text style={[styles.pillText, { color: myStatus === 'going' ? palette.purple : palette.text3 }]}>
            {myStatus === 'going' ? '✓ Going' : 'Going'}
          </Text>
        </Pressable>
        {concert.ticket_url ? (
          <Pressable onPress={() => Linking.openURL(concert.ticket_url!)} style={{ marginLeft: 'auto' }}>
            <Text style={[styles.ticket, { color: palette.amber, backgroundColor: palette.amberBg }]}>
              🎟 Tickets
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sheetLists}>
        <PeopleRow label="Going" ids={going} memberInfo={memberInfo} color={palette.purple} />
        <PeopleRow label="Interested" ids={interested} memberInfo={memberInfo} color={palette.teal} />
        {going.length === 0 && interested.length === 0 ? (
          <Text style={[styles.noOne, { color: palette.text3 }]}>No RSVPs yet — be the first.</Text>
        ) : null}
      </View>
    </View>
  );
}

export function ConcertCalendar({
  concerts,
  memberInfo,
  userId,
  onChange,
}: {
  concerts: ConcertRow[];
  memberInfo: MemberInfo;
  userId: string | null;
  onChange: () => void;
}) {
  const { palette } = useTheme();

  // YYYY-MM-DD → concerts on that day. Null dates collect under the TBA strip.
  const { byDay, tbaConcerts } = useMemo(() => {
    const m = new Map<string, ConcertRow[]>();
    const tba: ConcertRow[] = [];
    concerts.forEach((c) => {
      if (!c.concert_date) {
        tba.push(c);
        return;
      }
      const list = m.get(c.concert_date);
      if (list) list.push(c);
      else m.set(c.concert_date, [c]);
    });
    return { byDay: m, tbaConcerts: tba };
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

  const now = new Date();
  const isCurrentMonth =
    month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const monthLabel = month.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  // "3 shows this month · 2 you're going to" — for the strip under the grid.
  const monthPrefix = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
  const monthSummary = useMemo(() => {
    let shows = 0;
    let mine = 0;
    byDay.forEach((list, key) => {
      if (!key.startsWith(monthPrefix)) return;
      shows += list.length;
      mine += list.filter((c) =>
        c.concert_interest.some((i) => i.profile_id === userId && i.status === 'going'),
      ).length;
    });
    return { shows, mine };
  }, [byDay, monthPrefix, userId]);

  const selectedConcerts =
    selectedDay === TBA ? tbaConcerts : selectedDay ? byDay.get(selectedDay) ?? [] : [];
  const selectedLabel =
    selectedDay === TBA
      ? 'Date TBA'
      : selectedDay
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
        <View style={styles.monthLabelWrap}>
          <Text style={[styles.monthLabel, { color: isCurrentMonth ? palette.teal : palette.text1 }]}>
            {monthLabel}
          </Text>
          {isCurrentMonth ? (
            <Text style={[styles.thisMonthTag, { color: palette.teal }]}>● this month</Text>
          ) : null}
        </View>
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
          const isPastDay = key < todayKey;
          const dayNum = Number(key.split('-')[2]);

          // My status across the day's shows: going (purple ring) beats
          // interested (teal ring).
          const myStatuses = has
            ? dayConcerts!.flatMap((c) =>
                c.concert_interest.filter((x) => x.profile_id === userId).map((x) => x.status),
              )
            : [];
          const myRing = myStatuses.includes('going')
            ? palette.purple
            : myStatuses.includes('interested')
              ? palette.teal
              : null;

          // The rotating faces: artist photos → poster avatar → who's in.
          const faces: ReactNode[] = [];
          if (has) {
            const seen = new Set<string>();
            dayConcerts!.forEach((c) => {
              if (c.image_url && !seen.has(c.image_url)) {
                seen.add(c.image_url);
                faces.push(
                  <Image
                    key={`art-${c.id}`}
                    source={{ uri: c.image_url }}
                    style={styles.faceImage}
                    contentFit="cover"
                  />,
                );
              }
            });
            const poster = dayConcerts![0];
            faces.push(
              <Avatar
                key="poster"
                name={poster.profiles?.display_name ?? null}
                colorIndex={poster.profiles?.avatar_color ?? 0}
                imageUrl={poster.profiles?.avatar_url}
                size={34}
              />,
            );
            const inIds = peopleWithStatus(dayConcerts!, 'going');
            const people = inIds.length ? inIds : peopleWithStatus(dayConcerts!, 'interested');
            if (people.length) {
              faces.push(
                <AvatarStack key="people" ids={people} memberInfo={memberInfo} size={20} max={3} />,
              );
            }
          }

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
                  myRing ? { borderColor: myRing, borderWidth: 1 } : null,
                  isPastDay && styles.pastCell,
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
                {has ? <RotatingBadge faces={faces} /> : null}
                {has && dayConcerts!.length > 1 ? (
                  <Text style={[styles.multiBadge, { color: palette.amber, backgroundColor: palette.amberBg }]}>
                    ×{dayConcerts!.length}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {monthSummary.shows > 0 ? (
        <Text style={[styles.summary, { color: palette.text3 }]}>
          {monthSummary.shows} show{monthSummary.shows === 1 ? '' : 's'} this month
          {monthSummary.mine > 0
            ? ` · ${monthSummary.mine} you're going to`
            : ''}
        </Text>
      ) : (
        <Text style={[styles.summary, { color: palette.text3 }]}>No shows this month.</Text>
      )}

      {tbaConcerts.length > 0 ? (
        <Pressable
          onPress={() => setSelectedDay(TBA)}
          style={[styles.tbaStrip, { borderColor: palette.border, backgroundColor: palette.card2 }]}
        >
          <Text style={[styles.tbaText, { color: palette.text2 }]} numberOfLines={2}>
            📅 Date TBA: {tbaConcerts.map((c) => c.artist).join(', ')}
          </Text>
          <Text style={{ color: palette.text3 }}>›</Text>
        </Pressable>
      ) : null}

      <BottomSheet visible={!!selectedDay} onClose={() => setSelectedDay(null)}>
        <Label>{selectedLabel}</Label>
        {selectedConcerts.map((c) => (
          <SheetConcert key={c.id} concert={c} memberInfo={memberInfo} userId={userId} onChange={onChange} />
        ))}
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
  monthLabelWrap: { alignItems: 'center' },
  monthLabel: { fontFamily: fonts.sansBold, fontSize: 15 },
  thisMonthTag: { fontFamily: fonts.monoMedium, fontSize: 8, letterSpacing: 0.5, marginTop: 1 },
  pastCell: { opacity: 0.4 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.monoMedium,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 0.56, padding: 2 },
  cellInner: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    paddingTop: 7,
    gap: 5,
  },
  dayNum: { fontFamily: fonts.mono, fontSize: 14 },
  faceImage: { width: 34, height: 34, borderRadius: 17 },
  multiBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    fontFamily: fonts.monoMedium,
    fontSize: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  summary: {
    fontFamily: fonts.mono,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
  },
  tbaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  tbaText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackItem: { borderRadius: 999, borderWidth: 1.5 },
  stackMore: { fontFamily: fonts.monoMedium, fontSize: 8, marginLeft: 2 },
  sheetConcert: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 4,
    gap: 10,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetArt: { width: 52, height: 52, borderRadius: radius.md, marginTop: 2 },
  sheetArtist: { fontFamily: fonts.sansBold, fontSize: 15 },
  sheetVenue: { fontFamily: fonts.sans, fontSize: 12, marginTop: 1 },
  sheetMeta: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
  byRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  by: { fontFamily: fonts.mono, fontSize: 10 },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  ticket: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
  sheetLists: { gap: 8 },
  peopleGroup: { gap: 5 },
  peopleLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  personName: { fontFamily: fonts.sans, fontSize: 12 },
  noOne: { fontFamily: fonts.sans, fontSize: 12 },
});
