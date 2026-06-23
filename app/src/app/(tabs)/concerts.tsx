import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConcertCalendar } from '@/components/ConcertCalendar';
import { DateTimeField } from '@/components/DateTimeField';
import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, BottomSheet, Button, Card, InlineNote, Label, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useConcerts, type ConcertRow } from '@/hooks/useConcerts';
import { useMyClubs } from '@/hooks/useMyClubs';
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

// A club the current user belongs to, trimmed to what the share UI needs.
interface ClubLite {
  id: string;
  name: string;
  emoji: string;
}

// The copyable fields of a concert — engagement (interest, comments, review,
// completion) stays per-club and is deliberately left out.
type ShareFields = Pick<
  ConcertRow,
  'artist' | 'concert_date' | 'concert_time' | 'venue' | 'price' | 'ticket_url' | 'note'
>;

const shareFieldsOf = (c: ShareFields): ShareFields => ({
  artist: c.artist,
  concert_date: c.concert_date,
  concert_time: c.concert_time,
  venue: c.venue,
  price: c.price,
  ticket_url: c.ticket_url,
  note: c.note,
});

// Cross-post a concert into another club as an independent copy that points
// back to the original (originId), and announce it in that club's activity.
// If the sharer already RSVP'd on the source, carry that status onto the copy
// so they don't have to re-tap "Going"/"Interested" in the other club.
async function postConcertCopy(
  targetClubId: string,
  originId: string,
  fields: ShareFields,
  userId: string,
  interestStatus: ConcertStatus | null = null,
) {
  const { data, error } = await concertsDb.create({
    ...fields,
    club_id: targetClubId,
    added_by: userId,
    origin_concert_id: originId,
  });
  if (error || !data) return error;
  if (interestStatus) await concertsDb.setInterest(data.id, userId, interestStatus);
  await activity.publish(targetClubId, 'concert_added', { artist: data.artist, concert_id: data.id });
  return null;
}

// The original this concert traces back to (itself, if it's not a copy).
const rootConcertId = (c: ConcertRow) => c.origin_concert_id ?? c.id;

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
  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map((mem) => ({
        profile_id: mem.profile_id,
        display_name: mem.profiles?.display_name ?? null,
        avatar_color: mem.profiles?.avatar_color ?? 0,
        avatar_url: mem.profiles?.avatar_url ?? null,
      })),
    [members],
  );
  const { rows, refresh } = useConcerts(id);
  const { refreshing, onRefresh } = useRefresh(refresh);
  const { focus, scrollRef, onItemLayout } = useFocusTarget();

  // Your other clubs — the candidates for cross-posting a concert.
  const { rows: myClubRows } = useMyClubs();
  const otherClubs = useMemo<ClubLite[]>(
    () =>
      myClubRows
        .filter((r) => r.club.id !== id)
        .map((r) => ({ id: r.club.id, name: r.club.name, emoji: r.club.emoji })),
    [myClubRows, id],
  );

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [view, setView] = useState<'list' | 'calendar'>('list');

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
    setShareTargets([]);
    setError(null);
    setOpen(true);
  };

  const toggleShareTarget = (clubId: string) =>
    setShareTargets((t) => (t.includes(clubId) ? t.filter((x) => x !== clubId) : [...t, clubId]));

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
      if (err || !data) {
        setBusy(false);
        return setError(err?.message ?? 'Could not add the concert.');
      }
      await activity.publish(id, 'concert_added', { artist: data.artist, concert_id: data.id });
      // Fan the new concert out to any clubs picked in "Also post to".
      for (const targetId of shareTargets) {
        await postConcertCopy(targetId, data.id, fields, userId);
      }
      setBusy(false);
    }
    setOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setShareTargets([]);
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

      <View style={[styles.segment, { borderColor: palette.border, backgroundColor: palette.surface }]}>
        {(['list', 'calendar'] as const).map((v) => {
          const on = v === view;
          return (
            <Pressable key={v} onPress={() => setView(v)} style={styles.segBtn}>
              <View style={[styles.segInner, on && { backgroundColor: palette.tealBg, borderColor: palette.teal }]}>
                <Text style={[styles.segText, { color: on ? palette.teal : palette.text2 }]}>
                  {v === 'list' ? 'List' : 'Calendar'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {view === 'calendar' ? (
        <ConcertCalendar concerts={rows} memberInfo={memberInfo} />
      ) : (
        <>
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
            {!editingId && otherClubs.length > 0 ? (
              <View style={styles.sharePickBlock}>
                <Text style={[styles.sharePickLabel, { color: palette.text3 }]}>
                  ALSO POST TO (OPTIONAL)
                </Text>
                <View style={styles.shareChips}>
                  {otherClubs.map((c) => {
                    const on = shareTargets.includes(c.id);
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => toggleShareTarget(c.id)}
                        style={[
                          styles.shareChip,
                          { borderColor: palette.border, backgroundColor: palette.card2 },
                          on && { borderColor: palette.teal, backgroundColor: palette.tealBg },
                        ]}
                      >
                        <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                        <Text
                          numberOfLines={1}
                          style={[styles.shareChipText, { color: on ? palette.teal : palette.text2 }]}
                        >
                          {c.name}
                        </Text>
                        {on ? <Text style={[styles.shareChipCheck, { color: palette.teal }]}>✓</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <Button
              title={editingId ? 'Save changes' : shareTargets.length > 0 ? `Add & share to ${shareTargets.length}` : 'Add'}
              onPress={save}
              loading={busy}
            />
            <Button title="Cancel" variant="ghost" onPress={() => { setOpen(false); setEditingId(null); setShareTargets([]); }} />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </View>
        </Card>
      )}

      {upcoming.length === 0 && completed.length === 0 ? (
        <InlineNote text="No concerts yet — add a show and see who's in." />
      ) : null}

      {upcoming.map((c) => (
        <View key={c.id} onLayout={onItemLayout(c.id)}>
          <ConcertCard concert={c} userId={userId} isAdmin={isAdmin} memberInfo={memberInfo} mentionMembers={mentionMembers} shareClubs={otherClubs} onEdit={startEdit} onChange={refresh} highlight={c.id === focus} />
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
                  <ConcertCard concert={c} userId={userId} isAdmin={isAdmin} memberInfo={memberInfo} mentionMembers={mentionMembers} shareClubs={otherClubs} onEdit={startEdit} onChange={refresh} highlight={c.id === focus} />
                </View>
              ))
            : null}
        </>
      ) : null}
        </>
      )}
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
  mentionMembers,
  shareClubs,
  onEdit,
  onChange,
  highlight = false,
}: {
  concert: ConcertRow;
  userId: string | null;
  isAdmin: boolean;
  memberInfo: Map<string, { display_name: string | null; avatar_color: number; avatar_url: string | null }>;
  mentionMembers: MentionMember[];
  shareClubs: ClubLite[];
  onEdit: (c: ConcertRow) => void;
  onChange: () => void;
  highlight?: boolean;
}) {
  const { palette } = useTheme();
  const glow = useGlow(highlight);
  const [showShare, setShowShare] = useState(false);
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
    // Propagates to every club this concert is shared to (that you manage).
    const { error } = await concertsDb.setReview(
      concert.id,
      ratingDraft || null,
      reviewDraft.trim() || null,
      markComplete,
    );
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
        <View style={styles.actionGroup}>
          <Pressable
            onPress={() => setShowComments((s) => !s)}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: palette.border, backgroundColor: palette.card2, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.actionBtnText, { color: palette.text2 }]}>
              💬 {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Comment'}
            </Text>
          </Pressable>
          {shareClubs.length > 0 ? (
            <Pressable
              onPress={() => setShowShare(true)}
              style={({ pressed }) => [
                styles.actionBtn,
                { borderColor: palette.border, backgroundColor: palette.card2, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.actionBtnText, { color: palette.teal }]}>↗ Share</Text>
            </Pressable>
          ) : null}
        </View>
        {canManage ? (
          <Pressable
            onPress={() => setShowReview((s) => !s)}
            style={({ pressed }) => [
              styles.actionBtn,
              { borderColor: palette.border, backgroundColor: palette.card2, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.actionBtnText, { color: palette.purple }]}>
              {isCompleted ? '✎ Edit review' : '✓ Review'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {shareClubs.length > 0 ? (
        <ShareConcertSheet
          visible={showShare}
          onClose={() => setShowShare(false)}
          concert={concert}
          clubs={shareClubs}
          userId={userId}
          onShared={onChange}
        />
      ) : null}

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
          <Text style={[styles.reviewSharedHint, { color: palette.text3 }]}>
            Your review applies to this concert in every club it's shared to.
          </Text>
        </View>
      ) : null}

      {showComments ? (
        <ConcertComments
          concertId={concert.id}
          clubId={concert.club_id}
          userId={userId}
          isAdmin={isAdmin}
          mentionMembers={mentionMembers}
          onChange={onChange}
        />
      ) : null}
    </Card>
  );
}

interface CommentRow extends ConcertComment {
  profiles: { display_name: string | null; avatar_color: number; avatar_url: string | null } | null;
}

function ConcertComments({
  concertId,
  clubId,
  userId,
  isAdmin,
  mentionMembers,
  onChange,
}: {
  concertId: string;
  clubId: string;
  userId: string | null;
  isAdmin: boolean;
  mentionMembers: MentionMember[];
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
    const body = text;
    setBusy(true);
    await commentsDb.add(concertId, userId, body);
    setBusy(false);
    setText('');
    await load();
    onChange();
    const tagged = resolveMentions(body, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(clubId, tagged, {
          context: 'concert',
          concert_id: concertId,
          snippet: body.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
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
            <MentionText
              text={c.text}
              members={mentionMembers}
              style={[styles.commentText, { color: palette.text1 }]}
            />
          </View>
          {c.author_id === userId || isAdmin ? (
            <Pressable onPress={() => remove(c.id)} hitSlop={6}>
              <Text style={{ color: palette.text3, fontSize: 14 }}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <View style={styles.commentCompose}>
        <MentionInput
          placeholder="Add a comment… (@ to tag)"
          value={text}
          onChangeText={setText}
          members={mentionMembers}
          onSubmitEditing={add}
        />
        <Button title="Post" onPress={add} loading={busy} disabled={!text.trim()} style={{ paddingHorizontal: 14 }} />
      </View>
    </View>
  );
}

// Bottom sheet for cross-posting an existing concert to your other clubs.
// Clubs that already have the show (the original + prior shares) are shown as
// "Added" and can't be picked again.
function ShareConcertSheet({
  visible,
  onClose,
  concert,
  clubs,
  userId,
  onShared,
}: {
  visible: boolean;
  onClose: () => void;
  concert: ConcertRow;
  clubs: ClubLite[];
  userId: string | null;
  onShared: () => void;
}) {
  const { palette } = useTheme();
  const [already, setAlready] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const root = rootConcertId(concert);

  useEffect(() => {
    if (!visible) return;
    concertsDb.sharedClubIds(root).then(({ data }) => {
      setAlready(new Set((data ?? []).map((r) => r.club_id)));
      setSelected(new Set());
    });
  }, [visible, root]);

  const toggle = (clubId: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(clubId)) next.delete(clubId);
      else next.add(clubId);
      return next;
    });

  const share = async () => {
    if (!userId || selected.size === 0) return;
    setBusy(true);
    const fields = shareFieldsOf(concert);
    // Mirror the sharer's own RSVP from the source concert onto each copy.
    const myStatus = concert.concert_interest.find((i) => i.profile_id === userId)?.status ?? null;
    for (const targetId of selected) {
      await postConcertCopy(targetId, root, fields, userId, myStatus);
    }
    setBusy(false);
    onShared();
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Label>Share "{concert.artist}" to…</Label>
      {clubs.map((c) => {
        const has = already.has(c.id);
        const on = selected.has(c.id);
        return (
          <Pressable
            key={c.id}
            onPress={has ? undefined : () => toggle(c.id)}
            disabled={has}
            style={({ pressed }) => [
              styles.shareRow,
              {
                borderColor: on ? palette.teal : palette.border,
                backgroundColor: on ? palette.tealBg : palette.card2,
                opacity: has ? 0.55 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
            <Text numberOfLines={1} style={[styles.shareRowName, { color: palette.text1 }]}>
              {c.name}
            </Text>
            <Text style={[styles.shareRowState, { color: has ? palette.text3 : on ? palette.teal : palette.text3 }]}>
              {has ? '✓ Added' : on ? '✓' : '+'}
            </Text>
          </Pressable>
        );
      })}
      <Button
        title={selected.size > 0 ? `Share to ${selected.size} club${selected.size === 1 ? '' : 's'}` : 'Share'}
        onPress={share}
        loading={busy}
        disabled={selected.size === 0}
        style={{ marginTop: 8 }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: 14,
  },
  segBtn: { flex: 1 },
  segInner: {
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  segText: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.3 },
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
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionGroup: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  actionBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  actionBtnText: { fontFamily: fonts.sansMedium, fontSize: 12 },
  sharePickBlock: { gap: 8, marginTop: 2 },
  sharePickLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 1.5 },
  shareChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  shareChipText: { fontFamily: fonts.sansMedium, fontSize: 12, flexShrink: 1 },
  shareChipCheck: { fontFamily: fonts.monoMedium, fontSize: 11 },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  shareRowName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 15 },
  shareRowState: { fontFamily: fonts.monoMedium, fontSize: 13 },
  reviewForm: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  reviewLabel: { fontFamily: fonts.monoMedium, fontSize: 11, marginBottom: 8 },
  reviewSharedHint: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 },
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
  completedTitle: { fontFamily: fonts.sansMedium, fontSize: 12, letterSpacing: 0.5 },
});
