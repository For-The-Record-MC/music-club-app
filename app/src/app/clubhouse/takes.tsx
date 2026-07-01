import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, Button, Card, InlineNote, NoClubSelected, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useFocusTarget, useGlow } from '@/hooks/useFocusTarget';
import { useMusicalTakes, type TakeRow } from '@/hooks/useMusicalTakes';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { timeAgo } from '@/utils/activityTemplates';
import { confirmAsync } from '@/utils/confirm';
import { memberName } from '@/utils/memberName';
import { activity, musicalTakes } from '@/utils/supabase/db';
import { fonts, radius } from '@/theme';

// The 5-point agree↔disagree scale, low → high. value is what's stored (-2..2).
const SCALE = [
  { value: -2, emoji: '🚫', label: 'Hard no' },
  { value: -1, emoji: '👎', label: 'Disagree' },
  { value: 0, emoji: '😐', label: 'Neutral' },
  { value: 1, emoji: '👍', label: 'Agree' },
  { value: 2, emoji: '🙌', label: 'Hell yes' },
] as const;

export default function MusicalTakesScreen() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { takes, refresh } = useMusicalTakes(id);
  const { members } = useClubData(id);
  const { refreshing, onRefresh } = useRefresh(refresh);
  const { focus, scrollRef, onItemLayout } = useFocusTarget();

  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map((m) => ({
        profile_id: m.profile_id,
        display_name: m.profiles?.display_name ?? null,
        email: m.profiles?.email ?? null,
        avatar_color: m.profiles?.avatar_color ?? 0,
        avatar_url: m.profiles?.avatar_url ?? null,
      })),
    [members],
  );

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!id || !userId || !body.trim()) {
      setError('Say something.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await musicalTakes.create(id, userId, body);
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? 'Could not post.');
      return;
    }
    await activity.publish(id, 'musical_take', {
      take_id: data.id,
      snippet: body.trim().replace(/\s+/g, ' ').slice(0, 80),
    });
    setBusy(false);
    setBody('');
    setOpen(false);
    refresh();
  };

  if (!id) return <NoClubSelected what="takes" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing} scrollRef={scrollRef}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>SPICY OPINIONS, ON THE RECORD</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🔥 Mic Droppers</Text>
        </View>
      </View>

      {!open ? (
        <Button title="+ Drop a take" onPress={() => setOpen(true)} style={{ marginBottom: 14 }} />
      ) : (
        <Card>
          <TextField
            placeholder="Auto-Tune ruined a generation of singers…"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={280}
            style={{ minHeight: 70, textAlignVertical: 'top' }}
          />
          <Text style={[styles.counter, { color: palette.text3 }]}>{body.length}/280</Text>
          <Button title="Post take" onPress={submit} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={() => { setOpen(false); setBody(''); setError(null); }} />
          {error ? <InlineNote text={error} tone="error" /> : null}
        </Card>
      )}

      {takes.length === 0 ? (
        <InlineNote text="No takes yet — be the first to start an argument." />
      ) : (
        takes.map((take) => (
          <View key={take.id} onLayout={onItemLayout(take.id)}>
            <TakeCard
              take={take}
              userId={userId}
              onChange={refresh}
              highlight={take.id === focus}
              mentionMembers={mentionMembers}
            />
          </View>
        ))
      )}
    </Screen>
  );
}

function TakeCard({
  take,
  userId,
  onChange,
  highlight,
  mentionMembers,
}: {
  take: TakeRow;
  userId: string | null;
  onChange: () => void;
  highlight: boolean;
  mentionMembers: MentionMember[];
}) {
  const { palette } = useTheme();
  const router = useRouter();
  const glow = useGlow(highlight);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentRows, setCommentRows] = useState<
    { id: string; text: string; author_id: string; profiles: { display_name: string | null; email: string | null; avatar_color: number; avatar_url: string | null } | null }[]
  >([]);

  const canDelete = take.author_id === userId;
  const commentCount = take.musical_take_comments?.[0]?.count ?? 0;

  // Bucket the positions across the 5-point scale (index = value + 2).
  const { buckets, total, agree, disagree, neutral, myValue } = useMemo(() => {
    const b = [0, 0, 0, 0, 0];
    let mine: number | null = null;
    for (const p of take.musical_take_positions) {
      b[p.value + 2] = (b[p.value + 2] ?? 0) + 1;
      if (p.profile_id === userId) mine = p.value;
    }
    return {
      buckets: b,
      total: take.musical_take_positions.length,
      disagree: b[0] + b[1],
      neutral: b[2],
      agree: b[3] + b[4],
      myValue: mine,
    };
  }, [take.musical_take_positions, userId]);

  // Divisiveness: balanced agree-vs-disagree with little neutral = spicy.
  const divisive = total >= 3 && agree > 0 && disagree > 0
    ? 1 - Math.abs(agree - disagree) / (agree + disagree)
    : 0;
  const heat = divisive >= 0.6 ? '🌶️ Divisive' : agree > 0 || disagree > 0 || neutral > 0
    ? total >= 3 && (agree === 0 || disagree === 0)
      ? '🤝 Consensus'
      : null
    : null;

  const setPosition = async (value: number) => {
    if (!userId) return;
    if (myValue === value) await musicalTakes.clearPosition(take.id, userId);
    else await musicalTakes.setPosition(take.id, userId, value);
    onChange();
  };

  const loadComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next) {
      const { data } = await musicalTakes.listComments(take.id);
      setCommentRows((data ?? []) as typeof commentRows);
    }
  };

  const addComment = async () => {
    if (!userId || !commentText.trim()) return;
    const text = commentText;
    await musicalTakes.addComment(take.id, userId, text);
    setCommentText('');
    const { data } = await musicalTakes.listComments(take.id);
    setCommentRows((data ?? []) as typeof commentRows);
    onChange();
    const tagged = resolveMentions(text, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(take.club_id, tagged, {
          context: 'take',
          take_id: take.id,
          snippet: text.trim().replace(/\s+/g, ' ').slice(0, 80),
        })
        .then(undefined, () => {});
    }
  };

  const deleteTake = async () => {
    if (await confirmAsync('Delete take', 'Remove this take?')) {
      await musicalTakes.remove(take.id);
      onChange();
    }
  };

  // The stacked divisiveness bar — coral (disagree) → muted (neutral) → teal
  // (agree); strong picks full opacity, mild picks half.
  const segs = [
    { n: buckets[0], color: palette.coral, opacity: 1 },
    { n: buckets[1], color: palette.coral, opacity: 0.5 },
    { n: buckets[2], color: palette.text3, opacity: 0.5 },
    { n: buckets[3], color: palette.teal, opacity: 0.5 },
    { n: buckets[4], color: palette.teal, opacity: 1 },
  ];

  return (
    <Card style={glow ? { borderColor: palette.amber } : undefined}>
      <View style={styles.head}>
        <Pressable
          onPress={() => router.push(`/club/${take.club_id}/member/${take.author_id}`)}
          style={styles.headAuthor}
          hitSlop={4}
        >
          <Avatar name={take.profiles?.display_name ?? null} colorIndex={take.profiles?.avatar_color ?? 0} imageUrl={take.profiles?.avatar_url} size={28} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.author, { color: palette.text1 }]}>
              {memberName(take.profiles?.display_name, take.profiles?.email)}
            </Text>
            <Text style={[styles.time, { color: palette.text3 }]}>{timeAgo(take.created_at)}</Text>
          </View>
        </Pressable>
        {canDelete ? (
          <Pressable onPress={deleteTake} hitSlop={6}>
            <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.body, { color: palette.text1 }]}>{take.body}</Text>

      {total > 0 ? (
        <View style={styles.meterWrap}>
          <View style={[styles.meter, { backgroundColor: palette.card2 }]}>
            {segs.map((s, i) =>
              s.n > 0 ? (
                <View key={i} style={{ flex: s.n, backgroundColor: s.color, opacity: s.opacity }} />
              ) : null,
            )}
          </View>
          <View style={styles.meterLegend}>
            <Text style={[styles.legendText, { color: palette.coral }]}>👎 {disagree}</Text>
            <Text style={[styles.legendText, { color: palette.text3 }]}>😐 {neutral}</Text>
            <Text style={[styles.legendText, { color: palette.teal }]}>👍 {agree}</Text>
            {heat ? <Text style={[styles.heat, { color: palette.text2 }]}>{heat}</Text> : null}
          </View>
        </View>
      ) : (
        <Text style={[styles.noVotes, { color: palette.text3 }]}>No votes yet — weigh in.</Text>
      )}

      <View style={styles.scaleRow}>
        {SCALE.map((s) => {
          const mine = myValue === s.value;
          return (
            <Pressable
              key={s.value}
              onPress={() => setPosition(s.value)}
              style={[
                styles.scaleBtn,
                { borderColor: palette.border },
                mine && { borderColor: palette.teal, backgroundColor: palette.tealBg },
              ]}
            >
              <Text style={{ fontSize: 16 }}>{s.emoji}</Text>
              <Text style={[styles.scaleLabel, { color: mine ? palette.teal : palette.text3 }]} numberOfLines={1}>
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={loadComments} style={styles.commentToggle}>
        <Text style={[styles.commentToggleText, { color: palette.text3 }]}>
          💬 {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Comment'}
        </Text>
      </Pressable>

      {showComments ? (
        <View style={[styles.commentSection, { borderTopColor: palette.border }]}>
          {commentRows.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Pressable onPress={() => router.push(`/club/${take.club_id}/member/${c.author_id}`)} hitSlop={4}>
                <Avatar name={c.profiles?.display_name ?? null} colorIndex={c.profiles?.avatar_color ?? 0} imageUrl={c.profiles?.avatar_url} size={24} />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.commentAuthor, { color: palette.text1 }]}>
                  {memberName(c.profiles?.display_name, c.profiles?.email)}
                </Text>
                <MentionText text={c.text} members={mentionMembers} style={[styles.commentText, { color: palette.text1 }]} />
              </View>
            </View>
          ))}
          <View style={styles.commentForm}>
            <MentionInput
              placeholder="Add a comment… (@ to tag)"
              value={commentText}
              onChangeText={setCommentText}
              members={mentionMembers}
              onSubmitEditing={addComment}
            />
            <Button title="Post" onPress={addComment} disabled={!commentText.trim()} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  counter: { fontFamily: fonts.mono, fontSize: 10, textAlign: 'right', marginTop: 4, marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  headAuthor: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  author: { fontFamily: fonts.sansBold, fontSize: 13 },
  time: { fontFamily: fonts.mono, fontSize: 10 },
  body: { fontFamily: fonts.sansMedium, fontSize: 17, lineHeight: 24, marginBottom: 14 },
  meterWrap: { marginBottom: 12 },
  meter: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  meterLegend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  legendText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  heat: { fontFamily: fonts.sansBold, fontSize: 11, marginLeft: 'auto' },
  noVotes: { fontFamily: fonts.mono, fontSize: 11, marginBottom: 12 },
  scaleRow: { flexDirection: 'row', gap: 5 },
  scaleBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scaleLabel: { fontFamily: fonts.monoMedium, fontSize: 8, letterSpacing: 0.2 },
  commentToggle: { marginTop: 12, paddingVertical: 4 },
  commentToggleText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 10, gap: 10 },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentAuthor: { fontFamily: fonts.sansBold, fontSize: 11, marginBottom: 1 },
  commentText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  commentForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
