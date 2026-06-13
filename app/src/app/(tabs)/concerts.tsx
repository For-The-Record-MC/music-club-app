import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { Avatar, Button, Card, InlineNote, Label, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useConcerts, type ConcertRow } from '@/hooks/useConcerts';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { confirmAsync } from '@/utils/confirm';
import {
  activity,
  concertComments as commentsDb,
  concerts as concertsDb,
  type ConcertComment,
  type ConcertStatus,
} from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

const pad = (n: number) => String(n).padStart(2, '0');

// Prepend a "$" when a price is entered as a bare number (e.g. "20" → "$20"),
// but leave anything that already starts with a currency/letter symbol alone.
function normalizePrice(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return /^\d/.test(v) ? `$${v}` : v;
}

// concert_date is a calendar day (YYYY-MM-DD); concert_time is an optional
// wall-clock time (HH:MM:SS). Together they render the show's date & time.
function splitDateTime(d: Date) {
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:00`,
  };
}

function concertWhen(c: ConcertRow): Date | null {
  if (!c.concert_date) return null;
  return new Date(`${c.concert_date}T${c.concert_time ?? '12:00:00'}`);
}

function formatWhen(c: ConcertRow): string {
  const when = concertWhen(c);
  if (!when) return 'Date TBA';
  return when.toLocaleString(
    undefined,
    c.concert_time
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },
  );
}

interface Draft {
  artist: string;
  when: Date | null;
  venue: string;
  price: string;
  ticketUrl: string;
  note: string;
}

const emptyDraft = (): Draft => ({ artist: '', when: null, venue: '', price: '', ticketUrl: '', note: '' });

export default function Concerts() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { myRole, members } = useClubData(id);
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  // profile_id → name/color, so concert interest (which only stores ids) can show
  // who's interested/going, not just counts.
  const memberInfo = useMemo(() => {
    const m = new Map<
      string,
      { display_name: string | null; avatar_color: number; avatar_url: string | null }
    >();
    members.forEach((mem) =>
      m.set(mem.profile_id, {
        display_name: mem.profiles?.display_name ?? null,
        avatar_color: mem.profiles?.avatar_color ?? 0,
        avatar_url: mem.profiles?.avatar_url ?? null,
      }),
    );
    return m;
  }, [members]);
  const { rows, refresh } = useConcerts(id);
  const { refreshing, onRefresh } = useRefresh(refresh);
  const { focus, scrollRef, onItemLayout } = useFocusTarget();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const { upcoming, completed } = useMemo(() => {
    const up = rows.filter((c) => !c.completed_at);
    const done = rows
      .filter((c) => c.completed_at)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    return { upcoming: up, completed: done };
  }, [rows]);

  // A linked-to concert that's already completed lives in the collapsed section —
  // open it so the scroll/highlight lands somewhere visible.
  useEffect(() => {
    if (focus && completed.some((c) => c.id === focus)) setShowCompleted(true);
  }, [focus, completed]);

  const startAdd = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
    setOpen(true);
  };

  const startEdit = (c: ConcertRow) => {
    setEditingId(c.id);
    setDraft({
      artist: c.artist,
      when: concertWhen(c),
      venue: c.venue ?? '',
      price: c.price ?? '',
      ticketUrl: c.ticket_url ?? '',
      note: c.note ?? '',
    });
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!id || !userId || !draft.artist.trim()) {
      setError('Artist name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const { date, time } = draft.when ? splitDateTime(draft.when) : { date: null, time: null };
    const fields = {
      artist: draft.artist.trim(),
      concert_date: date,
      concert_time: time,
      venue: draft.venue.trim() || null,
      price: normalizePrice(draft.price),
      ticket_url: draft.ticketUrl.trim() || null,
      note: draft.note.trim() || null,
    };

    if (editingId) {
      const { error: err } = await concertsDb.update(editingId, fields);
      setBusy(false);
      if (err) return setError(err.message);
    } else {
      const { data, error: err } = await concertsDb.create({ ...fields, club_id: id, added_by: userId });
      if (!err && data) await activity.publish(id, 'concert_added', { artist: data.artist, concert_id: data.id });
      setBusy(false);
      if (err) return setError(err.message);
    }
    setOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    refresh();
  };

  if (!id) return <NoClubSelected what="concerts" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing} scrollRef={scrollRef}>
      <View style={styles.topbar}>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>SHOWS WORTH SEEING</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎤 Concerts</Text>
        </View>
      </View>

      {!open ? (
        <Button title="+ Add a concert" onPress={startAdd} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <Label>{editingId ? 'Edit concert' : 'Add a concert'}</Label>
          <View style={{ gap: 8 }}>
            <TextField placeholder="Artist / band" value={draft.artist} onChangeText={(v) => setDraft((d) => ({ ...d, artist: v }))} />
            <DateTimeField value={draft.when} onChange={(w) => setDraft((d) => ({ ...d, when: w }))} mode="datetime" />
            <TextField placeholder="Venue & city (optional)" value={draft.venue} onChangeText={(v) => setDraft((d) => ({ ...d, venue: v }))} />
            <TextField placeholder="Ticket price (optional)" value={draft.price} onChangeText={(v) => setDraft((d) => ({ ...d, price: v }))} />
            <TextField placeholder="Ticket link (optional)" value={draft.ticketUrl} onChangeText={(v) => setDraft((d) => ({ ...d, ticketUrl: v }))} autoCapitalize="none" />
            <TextField placeholder="Notes (optional)" value={draft.note} onChangeText={(v) => setDraft((d) => ({ ...d, note: v }))} />
            <Button title={editingId ? 'Save changes' : 'Add'} onPress={save} loading={busy} />
            <Button title="Cancel" variant="ghost" onPress={() => { setOpen(false); setEditingId(null); }} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {upcoming.length === 0 && completed.length === 0 ? (
        <InlineNote text="No concerts yet — add a show and see who's in." />
      ) : null}

      {upcoming.map((c) => (
        <View key={c.id} onLayout={onItemLayout(c.id)}>
          <ConcertCard concert={c} userId={userId} isAdmin={isAdmin} memberInfo={memberInfo} onEdit={startEdit} onChange={refresh} highlight={c.id === focus} />
        </View>
      ))}

      {completed.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowCompleted((s) => !s)}
            style={[styles.completedHead, { borderColor: palette.border }]}
          >
            <Text style={[styles.completedTitle, { color: palette.text2 }]}>
              ✓ Completed shows ({completed.length})
            </Text>
            <Text style={{ color: palette.text3 }}>{showCompleted ? '▾' : '▸'}</Text>
          </Pressable>
          {showCompleted
            ? completed.map((c) => (
                <View key={c.id} onLayout={onItemLayout(c.id)}>
                  <ConcertCard concert={c} userId={userId} isAdmin={isAdmin} memberInfo={memberInfo} onEdit={startEdit} onChange={refresh} highlight={c.id === focus} />
                </View>
              ))
            : null}
        </>
      ) : null}
    </Screen>
  );
}

function Stars({
  value,
  onChange,
  size = 20,
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: number;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Text style={{ fontSize: size, color: filled ? palette.amber : palette.text3 }}>
            {filled ? '★' : '☆'}
          </Text>
        );
        return onChange ? (
          <Pressable key={n} onPress={() => onChange(value === n ? 0 : n)} hitSlop={4}>
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

// Shows who's interested/going with name + avatar, not just a count.
function InterestGroup({
  label,
  people,
  memberInfo,
  color,
}: {
  label: string;
  people: { profile_id: string; status: ConcertStatus }[];
  memberInfo: Map<string, { display_name: string | null; avatar_color: number; avatar_url: string | null }>;
  color: string;
}) {
  const { palette } = useTheme();
  if (people.length === 0) return null;
  return (
    <View style={styles.interestGroup}>
      <Text style={[styles.interestLabel, { color }]}>
        {label} ({people.length})
      </Text>
      <View style={styles.interestPeople}>
        {people.map((p) => {
          const info = memberInfo.get(p.profile_id);
          return (
            <View key={p.profile_id} style={styles.interestChip}>
              <Avatar name={info?.display_name ?? null} colorIndex={info?.avatar_color ?? 0} imageUrl={info?.avatar_url} size={18} />
              <Text style={[styles.interestName, { color: palette.text2 }]}>
                {info?.display_name ?? 'Someone'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ConcertCard({
  concert,
  userId,
  isAdmin,
  memberInfo,
  onEdit,
  onChange,
  highlight = false,
}: {
  concert: ConcertRow;
  userId: string | null;
  isAdmin: boolean;
  memberInfo: Map<string, { display_name: string | null; avatar_color: number; avatar_url: string | null }>;
  onEdit: (c: ConcertRow) => void;
  onChange: () => void;
  highlight?: boolean;
}) {
  const { palette } = useTheme();
  const glow = useGlow(highlight);
  const canManage = concert.added_by === userId || isAdmin;
  const myStatus = concert.concert_interest.find((i) => i.profile_id === userId)?.status ?? null;
  const going = concert.concert_interest.filter((i) => i.status === 'going');
  const interested = concert.concert_interest.filter((i) => i.status === 'interested');
  const commentCount = concert.concert_comments[0]?.count ?? 0;
  const isCompleted = !!concert.completed_at;

  const [showComments, setShowComments] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [ratingDraft, setRatingDraft] = useState(concert.rating ?? 0);
  const [reviewDraft, setReviewDraft] = useState(concert.review ?? '');
  const [savingReview, setSavingReview] = useState(false);

  const setStatus = async (status: ConcertStatus) => {
    if (!userId) return;
    await concertsDb.setInterest(concert.id, userId, myStatus === status ? null : status);
    onChange();
  };

  const remove = async () => {
    if (await confirmAsync('Remove concert', `Remove ${concert.artist}?`)) {
      await concertsDb.remove(concert.id);
      onChange();
    }
  };

  const saveReview = async (markComplete: boolean) => {
    setSavingReview(true);
    const { error } = await concertsDb.update(concert.id, {
      rating: ratingDraft || null,
      review: reviewDraft.trim() || null,
      completed_at: markComplete ? new Date().toISOString() : concert.completed_at,
    });
    setSavingReview(false);
    if (!error) {
      setShowReview(false);
      onChange();
    }
  };

  return (
    <Card style={glow ? { borderColor: palette.amber } : undefined}>
      <View style={styles.cHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.cArtist, { color: palette.text1 }]}>{concert.artist}</Text>
          {concert.venue ? <Text style={[styles.cVenue, { color: palette.text2 }]}>{concert.venue}</Text> : null}
          <Text style={[styles.cMeta, { color: palette.text3 }]}>
            {formatWhen(concert)}
            {concert.price ? ` · ${concert.price}` : ''}
          </Text>
          <View style={styles.cByRow}>
            <Avatar name={concert.profiles?.display_name ?? null} colorIndex={concert.profiles?.avatar_color ?? 0} imageUrl={concert.profiles?.avatar_url} size={16} />
            <Text style={[styles.cBy, { color: palette.text3 }]}>
              added by {concert.profiles?.display_name ?? 'someone'}
            </Text>
          </View>
        </View>
        {canManage ? (
          <View style={styles.manageRow}>
            <Pressable onPress={() => onEdit(concert)} hitSlop={6}>
              <Text style={{ color: palette.text3, fontSize: 15 }}>✎</Text>
            </Pressable>
            <Pressable onPress={remove} hitSlop={6}>
              <Text style={{ color: palette.text3, fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {concert.note ? <Text style={[styles.cNote, { color: palette.text2 }]}>{concert.note}</Text> : null}

      {isCompleted && (concert.rating || concert.review) ? (
        <View style={[styles.reviewBox, { backgroundColor: palette.card2, borderColor: palette.border }]}>
          {concert.rating ? <Stars value={concert.rating} size={16} /> : null}
          {concert.review ? <Text style={[styles.reviewText, { color: palette.text1 }]}>{concert.review}</Text> : null}
        </View>
      ) : null}

      <View style={styles.cFooter}>
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
            <Text style={[styles.cTicket, { color: palette.amber, backgroundColor: palette.amberBg }]}>🎟 Tickets</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.interestLists}>
        <InterestGroup label="Going" people={going} memberInfo={memberInfo} color={palette.purple} />
        <InterestGroup label="Interested" people={interested} memberInfo={memberInfo} color={palette.teal} />
        {going.length === 0 && interested.length === 0 ? (
          <Text style={[styles.cCount, { color: palette.text3 }]}>No one yet — be the first.</Text>
        ) : null}
      </View>

      <View style={[styles.cActions, { borderTopColor: palette.border }]}>
        <Pressable onPress={() => setShowComments((s) => !s)} hitSlop={6}>
          <Text style={[styles.actionLink, { color: palette.text2 }]}>
            💬 {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Comment'}
          </Text>
        </Pressable>
        {canManage ? (
          <Pressable onPress={() => setShowReview((s) => !s)} hitSlop={6}>
            <Text style={[styles.actionLink, { color: palette.purple }]}>
              {isCompleted ? '✎ Edit review' : '✓ Mark complete & review'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {showReview ? (
        <View style={[styles.reviewForm, { borderTopColor: palette.border }]}>
          <Text style={[styles.reviewLabel, { color: palette.text2 }]}>How was it?</Text>
          <Stars value={ratingDraft} onChange={setRatingDraft} />
          <TextField
            placeholder="Write a review (optional)…"
            value={reviewDraft}
            onChangeText={setReviewDraft}
            multiline
            style={{ marginTop: 10, minHeight: 56, textAlignVertical: 'top' }}
          />
          <Button
            title={isCompleted ? 'Save review' : '✓ Mark complete & save'}
            onPress={() => saveReview(!isCompleted)}
            loading={savingReview}
            style={{ marginTop: 8 }}
          />
        </View>
      ) : null}

      {showComments ? <ConcertComments concertId={concert.id} userId={userId} isAdmin={isAdmin} onChange={onChange} /> : null}
    </Card>
  );
}

interface CommentRow extends ConcertComment {
  profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null;
}

function ConcertComments({
  concertId,
  userId,
  isAdmin,
  onChange,
}: {
  concertId: string;
  userId: string | null;
  isAdmin: boolean;
  onChange: () => void;
}) {
  const { palette } = useTheme();
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await commentsDb.listByConcert(concertId);
    setRows((data ?? []) as CommentRow[]);
  }, [concertId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!userId || !text.trim()) return;
    setBusy(true);
    await commentsDb.add(concertId, userId, text);
    setBusy(false);
    setText('');
    await load();
    onChange();
  };

  const remove = async (commentId: string) => {
    await commentsDb.remove(commentId);
    await load();
    onChange();
  };

  return (
    <View style={[styles.comments, { borderTopColor: palette.border }]}>
      {rows.map((c) => (
        <View key={c.id} style={styles.commentRow}>
          <Avatar name={c.profiles?.display_name ?? null} colorIndex={c.profiles?.avatar_color ?? 0} imageUrl={c.profiles?.avatar_url} size={24} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.commentName, { color: palette.text2 }]}>
              {c.profiles?.display_name ?? '(no name)'}
            </Text>
            <Text style={[styles.commentText, { color: palette.text1 }]}>{c.text}</Text>
          </View>
          {c.author_id === userId || isAdmin ? (
            <Pressable onPress={() => remove(c.id)} hitSlop={6}>
              <Text style={{ color: palette.text3, fontSize: 14 }}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <View style={styles.commentCompose}>
        <TextField
          placeholder="Add a comment…"
          value={text}
          onChangeText={setText}
          style={{ flex: 1 }}
          onSubmitEditing={add}
        />
        <Button title="Post" onPress={add} loading={busy} disabled={!text.trim()} style={{ paddingHorizontal: 14 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  cHead: { flexDirection: 'row', alignItems: 'flex-start' },
  cArtist: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 2 },
  cVenue: { fontFamily: fonts.sans, fontSize: 12, marginBottom: 2 },
  cMeta: { fontFamily: fonts.mono, fontSize: 11 },
  cByRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  cBy: { fontFamily: fonts.mono, fontSize: 10 },
  manageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginTop: 8 },
  reviewBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 10,
    marginTop: 10,
    gap: 6,
  },
  reviewText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  cFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  pill: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  cTicket: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cCount: { fontFamily: fonts.sans, fontSize: 12, marginTop: 8 },
  interestLists: { marginTop: 10, gap: 8 },
  interestGroup: { gap: 5 },
  interestLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 },
  interestPeople: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  interestChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  interestName: { fontFamily: fonts.sans, fontSize: 12 },
  cActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionLink: { fontFamily: fonts.monoMedium, fontSize: 11 },
  reviewForm: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  reviewLabel: { fontFamily: fonts.monoMedium, fontSize: 11, marginBottom: 8 },
  comments: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  commentName: { fontFamily: fonts.monoMedium, fontSize: 10, marginBottom: 1 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentCompose: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  completedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 6,
    marginBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  completedTitle: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 0.5 },
});
