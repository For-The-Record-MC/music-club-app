import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MentionInput, MentionText, resolveMentions, type MentionMember } from '@/components/Mentions';
import { Avatar, Badge, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useMeetingPosts } from '@/hooks/useMeetingPosts';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import { timeAgo } from '@/utils/activityTemplates';
import { activity, cycleGuests, rsvps as rsvpsDb, type RsvpStatus } from '@/utils/supabase/db';
import { memberName } from '@/utils/memberName';

// First ~80 chars of a comment, for the mention notification preview.
const snippetOf = (text: string) => text.trim().replace(/\s+/g, ' ').slice(0, 80);

const STATUS_LABEL: Record<RsvpStatus, string> = { yes: '✓ Going', maybe: '? Maybe', no: '✕ No' };

export default function RsvpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { members, myRole } = useClubData(id);
  const { cycle, rsvps, guests, refresh } = useCycle(id);
  const board = useMeetingPosts(cycle?.id);
  const [guestName, setGuestName] = useState('');
  const [postText, setPostText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map((m) => ({
        profile_id: m.profile_id,
        display_name: m.profiles?.display_name ?? null,
        avatar_color: m.profiles?.avatar_color ?? 0,
        avatar_url: m.profiles?.avatar_url ?? null,
      })),
    [members],
  );
  const byProfile = useMemo(
    () => new Map(rsvps.map((r) => [r.profile_id, r])),
    [rsvps],
  );

  const counts = useMemo(() => {
    const c = { yes: 0, maybe: 0, no: 0, none: 0 };
    for (const m of members) {
      const s = byProfile.get(m.profile_id)?.status as RsvpStatus | undefined;
      if (s) c[s] += 1;
      else c.none += 1;
    }
    for (const g of guests) c[g.status as RsvpStatus] += 1;
    return c;
  }, [members, byProfile, guests]);

  const setMine = async (status: RsvpStatus) => {
    if (!cycle || !userId) return;
    setError(null);
    const { error: err } = await rsvpsDb.set(cycle.id, userId, status);
    if (err) setError(err.message);
    refresh();
  };

  const addGuest = async () => {
    if (!cycle || !userId || !guestName.trim()) return;
    setError(null);
    const { error: err } = await cycleGuests.add(cycle.id, guestName, 'yes', userId);
    if (err) setError(err.message);
    setGuestName('');
    refresh();
  };

  const removeGuest = async (gid: string) => {
    const { error: err } = await cycleGuests.remove(gid);
    if (err) setError(err.message);
    refresh();
  };

  const submitPost = async () => {
    if (!postText.trim()) return;
    setError(null);
    const text = postText;
    const err = await board.add(text);
    if (err) {
      setError(err.message);
      return;
    }
    setPostText('');
    const tagged = resolveMentions(text, mentionMembers).filter((pid) => pid !== userId);
    if (tagged.length) {
      void activity
        .notifyMentions(id, tagged, { context: 'meeting', snippet: snippetOf(text) })
        .then(undefined, () => {});
    }
  };

  const myStatus = userId ? (byProfile.get(userId)?.status as RsvpStatus | undefined) : undefined;
  const statusColor = (s: RsvpStatus) =>
    s === 'yes'
      ? { color: palette.teal, bg: palette.tealBg }
      : s === 'maybe'
        ? { color: palette.amber, bg: palette.amberBg }
        : { color: palette.coral, bg: palette.coralBg };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>
            {cycle ? `CYCLE ${cycle.number}${cycle.meeting_date ? ` · ${cycle.meeting_date}` : ''}` : ''}
          </Text>
          <Text style={[styles.title, { color: palette.text1 }]}>RSVP</Text>
        </View>
      </View>

      {!cycle ? (
        <InlineNote text="No open cycle — RSVPs open once the wheel is spun." />
      ) : (
        <>
          <Label>Your RSVP</Label>
          <Card>
            <View style={styles.quickRow}>
              {(['yes', 'maybe', 'no'] as RsvpStatus[]).map((s) => {
                const active = myStatus === s;
                const c = statusColor(s);
                return (
                  <Pressable
                    key={s}
                    onPress={() => setMine(s)}
                    style={[
                      styles.quickBtn,
                      { backgroundColor: palette.card2, borderColor: palette.border },
                      active && { backgroundColor: c.bg, borderColor: c.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.quickText,
                        { color: active ? c.color : palette.text3 },
                      ]}
                    >
                      {STATUS_LABEL[s]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Label>Headcount</Label>
          <Card>
            <View style={styles.statsRow}>
              <Text style={[styles.stat, { color: palette.teal }]}>Going {counts.yes}</Text>
              <Text style={[styles.stat, { color: palette.amber }]}>Maybe {counts.maybe}</Text>
              <Text style={[styles.stat, { color: palette.coral }]}>No {counts.no}</Text>
              <Text style={[styles.stat, { color: palette.text3 }]}>Silent {counts.none}</Text>
            </View>
          </Card>

          <Label>Members</Label>
          <Card>
            {members.map((m) => {
              const s = byProfile.get(m.profile_id)?.status as RsvpStatus | undefined;
              const c = s ? statusColor(s) : null;
              return (
                <View key={m.id} style={styles.memberRow}>
                  <Avatar
                    name={m.profiles?.display_name ?? null}
                    colorIndex={m.profiles?.avatar_color ?? 0}
                    imageUrl={m.profiles?.avatar_url}
                    size={30}
                  />
                  <Text style={[styles.memberName, { color: palette.text1 }]}>
                    {memberName(m.profiles?.display_name, m.profiles?.email)}
                  </Text>
                  {s && c ? (
                    <Badge text={STATUS_LABEL[s]} color={c.color} bg={c.bg} />
                  ) : (
                    <Text style={[styles.noReply, { color: palette.text3 }]}>no reply yet</Text>
                  )}
                </View>
              );
            })}
          </Card>

          <Label>Guests</Label>
          <Card>
            {guests.map((g) => {
              const c = statusColor(g.status as RsvpStatus);
              const canRemove = g.added_by === userId || isAdmin;
              return (
                <View key={g.id} style={styles.memberRow}>
                  <Text style={{ fontSize: 18 }}>👤</Text>
                  <Text style={[styles.memberName, { color: palette.text1 }]}>{g.name}</Text>
                  <Badge text={STATUS_LABEL[g.status as RsvpStatus]} color={c.color} bg={c.bg} />
                  {canRemove ? (
                    <Pressable onPress={() => removeGuest(g.id)}>
                      <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <View style={styles.guestAdd}>
              <TextField
                placeholder="Guest name"
                value={guestName}
                onChangeText={setGuestName}
                style={{ flex: 1 }}
                onSubmitEditing={addGuest}
              />
              <Button title="+ Add" onPress={addGuest} disabled={!guestName.trim()} />
            </View>
          </Card>

          <Label>Meeting Board</Label>
          <Card>
            {board.posts.length === 0 ? (
              <InlineNote text="No notes yet — suggest a time, or say what you'll bring." />
            ) : (
              board.posts.map((p) => {
                const canRemove = p.author_id === userId || isAdmin;
                return (
                  <View key={p.id} style={styles.boardRow}>
                    <Avatar
                      name={p.profiles?.display_name ?? null}
                      colorIndex={p.profiles?.avatar_color ?? 0}
                      imageUrl={p.profiles?.avatar_url}
                      size={28}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={styles.boardMeta}>
                        <Text style={[styles.boardAuthor, { color: palette.text1 }]}>
                          {p.profiles?.display_name ?? '(no name)'}
                        </Text>
                        <Text style={[styles.boardTime, { color: palette.text3 }]}>
                          {timeAgo(p.created_at)}
                        </Text>
                      </View>
                      <MentionText
                        text={p.text}
                        members={mentionMembers}
                        style={[styles.boardText, { color: palette.text1 }]}
                      />
                    </View>
                    {canRemove ? (
                      <Pressable onPress={() => board.remove(p.id)} hitSlop={8}>
                        <Text style={{ color: palette.text3, fontSize: 16 }}>×</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })
            )}
            <View style={styles.boardForm}>
              <MentionInput
                placeholder="Suggest a time, offer to bring something… (@ to tag)"
                value={postText}
                onChangeText={setPostText}
                members={mentionMembers}
                multiline
              />
              <Button title="Post" onPress={submitPost} disabled={!postText.trim()} />
            </View>
          </Card>
          {error ? <InlineNote text={error} tone="error" /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  quickRow: { flexDirection: 'row', gap: 6 },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  quickText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { fontFamily: fonts.monoMedium, fontSize: 12 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  memberName: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  noReply: { fontFamily: fonts.mono, fontSize: 10 },
  guestAdd: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  boardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  boardMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  boardAuthor: { fontFamily: fonts.sansBold, fontSize: 12 },
  boardTime: { fontFamily: fonts.mono, fontSize: 10 },
  boardText: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginTop: 2 },
  boardForm: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' },
});
