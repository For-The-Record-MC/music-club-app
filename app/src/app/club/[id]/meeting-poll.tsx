import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DateTimeField } from '@/components/DateTimeField';
import { Avatar, Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts, radius } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { memberName } from '@/utils/memberName';
import { activity, cycles as cyclesDb, meetingPoll, type MeetingTimeOption } from '@/utils/supabase/db';
import { formatSlot, timezoneLabel } from '@/utils/timezone';

// Per-cycle meeting time poll. Anyone in the club proposes candidate date/times
// and votes on the ones that work for them; the cycle admin then locks a winner
// into cycles.meeting_at. Slots render in the club's chosen timezone (set in
// club settings) with its short label.
export default function MeetingPoll() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const userId = useAuthStore((s) => s.userId);
  const { cycle, loading } = useCycle(id);
  const { club, members, myRole } = useClubData(id);
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const tz = club?.meeting_timezone ?? null;

  const [options, setOptions] = useState<MeetingTimeOption[]>([]);
  const [proposed, setProposed] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!cycle) {
      setOptions([]);
      return;
    }
    const { data } = await meetingPoll.listOptions(cycle.id);
    setOptions((data ?? []) as MeetingTimeOption[]);
  }, [cycle]);

  useEffect(() => {
    reload();
  }, [reload]);
  const { refreshing, onRefresh } = useRefresh(reload);

  // Name for whoever proposed a slot.
  const nameFor = (profileId: string) => {
    const m = members.find((mem) => mem.profile_id === profileId);
    return memberName(m?.profiles?.display_name, m?.profiles?.email);
  };

  // Sort by votes desc, then soonest first — so the frontrunner sits on top.
  const ranked = useMemo(() => {
    return [...options].sort((a, b) => {
      const diff = b.meeting_time_votes.length - a.meeting_time_votes.length;
      if (diff !== 0) return diff;
      return new Date(a.slot_at).getTime() - new Date(b.slot_at).getTime();
    });
  }, [options]);

  const leader = ranked[0]?.meeting_time_votes.length ? ranked[0] : null;

  const toggleVote = async (opt: MeetingTimeOption) => {
    if (!userId) return;
    const mine = opt.meeting_time_votes.some((v) => v.profile_id === userId);
    // Optimistic update.
    setOptions((prev) =>
      prev.map((o) =>
        o.id === opt.id
          ? {
              ...o,
              meeting_time_votes: mine
                ? o.meeting_time_votes.filter((v) => v.profile_id !== userId)
                : [...o.meeting_time_votes, { profile_id: userId }],
            }
          : o,
      ),
    );
    const { error: err } = mine
      ? await meetingPoll.unvote(opt.id, userId)
      : await meetingPoll.vote(opt.id, userId);
    if (err) {
      setError(err.message);
      reload();
    }
  };

  const addOption = async () => {
    if (!cycle || !userId || !proposed) return;
    setBusy(true);
    setError(null);
    const { error: err } = await meetingPoll.addOption(cycle.id, userId, proposed.toISOString());
    setBusy(false);
    if (err) {
      // The unique(cycle_id, slot_at) constraint surfaces as a duplicate error.
      setError(/duplicate|unique/i.test(err.message) ? 'That time is already proposed.' : err.message);
      return;
    }
    setProposed(null);
    reload();
  };

  const removeOption = async (opt: MeetingTimeOption) => {
    const ok = await confirmAsync('Remove this time?', formatSlot(opt.slot_at, tz));
    if (!ok) return;
    const { error: err } = await meetingPoll.removeOption(opt.id);
    if (err) setError(err.message);
    else reload();
  };

  // Admin locks a slot into the cycle's meeting_at, keeping any existing
  // location/link. Mirrors the schedule screen's save.
  const lockIn = async (opt: MeetingTimeOption) => {
    if (!cycle) return;
    const ok = await confirmAsync(
      'Lock this as the meeting?',
      `${formatSlot(opt.slot_at, tz)} becomes the official meeting time.`,
    );
    if (!ok) return;
    setBusy(true);
    const { error: err } = await cyclesDb.scheduleMeeting(
      cycle.id,
      opt.slot_at,
      cycle.meeting_time_location ?? null,
      cycle.meeting_url ?? null,
    );
    if (!err && id) {
      await activity.publish(id, 'meeting_scheduled', {
        cycle_number: cycle.number,
        meeting_date: new Date(opt.slot_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      });
    }
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.replace('/home');
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>{cycle ? `CYCLE ${cycle.number}` : ''}</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>When should we meet?</Text>
        </View>
      </View>

      {!cycle && !loading ? (
        <InlineNote text="No open cycle — spin the wheel first." />
      ) : (
        <>
          <Text style={[styles.intro, { color: palette.text2 }]}>
            Propose times that work for you and vote on everyone else's. Times shown in{' '}
            <Text style={{ color: palette.text1 }}>{timezoneLabel(tz)}</Text>.
            {!tz ? ' Set a club timezone in settings so everyone sees the same clock.' : ''}
          </Text>

          {cycle?.meeting_at ? (
            <InlineNote
              text={`Locked: ${formatSlot(cycle.meeting_at, tz)}. Locking a new time replaces it.`}
            />
          ) : null}

          <Card style={{ marginTop: 12 }}>
            <Label>Propose a time</Label>
            <DateTimeField value={proposed} onChange={setProposed} />
            <Button
              title="Add this time"
              onPress={addOption}
              loading={busy}
              disabled={!proposed}
              style={{ marginTop: 10 }}
            />
            {error ? <InlineNote text={error} tone="error" /> : null}
          </Card>

          <Label>{'\n'}Proposed times</Label>
          {ranked.length === 0 ? (
            <InlineNote text="No times yet — propose the first one above." />
          ) : (
            ranked.map((opt) => {
              const count = opt.meeting_time_votes.length;
              const mine = userId ? opt.meeting_time_votes.some((v) => v.profile_id === userId) : false;
              const canRemove = opt.proposed_by === userId || isAdmin;
              const isLeader = leader?.id === opt.id;
              return (
                <Card key={opt.id} style={{ ...styles.optCard, ...(isLeader ? { borderColor: palette.teal } : {}) }}>
                  <View style={styles.optRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.optWhen, { color: palette.text1 }]}>{formatSlot(opt.slot_at, tz)}</Text>
                      <View style={styles.optMeta}>
                        <Avatar
                          name={nameFor(opt.proposed_by)}
                          colorIndex={members.find((m) => m.profile_id === opt.proposed_by)?.profiles?.avatar_color ?? 0}
                          imageUrl={members.find((m) => m.profile_id === opt.proposed_by)?.profiles?.avatar_url ?? null}
                          size={16}
                        />
                        <Text style={[styles.optBy, { color: palette.text3 }]}>
                          {nameFor(opt.proposed_by)}
                          {isLeader ? ' · leading' : ''}
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => toggleVote(opt)}
                      style={[
                        styles.voteBtn,
                        { borderColor: mine ? palette.teal : palette.border, backgroundColor: mine ? palette.tealBg : palette.card2 },
                      ]}
                    >
                      <Text style={[styles.voteText, { color: mine ? palette.teal : palette.text2 }]}>
                        {mine ? '✓ ' : ''}{count} {count === 1 ? 'vote' : 'votes'}
                      </Text>
                    </Pressable>
                  </View>
                  {(isAdmin || canRemove) ? (
                    <View style={styles.optActions}>
                      {isAdmin ? (
                        <Button title="Lock as meeting" variant="ghost" onPress={() => lockIn(opt)} style={styles.optAction} />
                      ) : null}
                      {canRemove ? (
                        <Button title="Remove" variant="ghost" onPress={() => removeOption(opt)} style={styles.optAction} />
                      ) : null}
                    </View>
                  ) : null}
                </Card>
              );
            })
          )}
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
  intro: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  optCard: { marginBottom: 8 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optWhen: { fontFamily: fonts.sansBold, fontSize: 15 },
  optMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  optBy: { fontFamily: fonts.sans, fontSize: 11 },
  voteBtn: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  voteText: { fontFamily: fonts.monoMedium, fontSize: 12 },
  optActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  optAction: { flex: 1 },
});
