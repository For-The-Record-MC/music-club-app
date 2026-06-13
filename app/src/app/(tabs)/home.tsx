import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, NoClubSelected, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { inviteUrl } from '@/constants';
import { fonts, radius } from '@/theme';
import { addToCalendar } from '@/utils/calendar';
import { confirmAsync } from '@/utils/confirm';
import {
  cycles,
  preferences as preferencesDb,
  rsvps as rsvpsDb,
  type Album,
  type Cycle,
  type RsvpStatus,
} from '@/utils/supabase/db';

interface ClosedCycle extends Cycle {
  albums: Album[];
}

// Home tab: the selected club's current cycle — picker, two albums, meeting, RSVP.
export default function HomeTab() {
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const clubId = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const { club, members, myRole, loading: clubLoading, refresh: refreshClub } = useClubData(clubId);
  const { cycle, albums, rsvps, guests, preferences, loading: cycleLoading, refresh } = useCycle(clubId);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastCycles, setPastCycles] = useState<ClosedCycle[]>([]);

  const loadPast = useCallback(() => {
    if (!clubId) return;
    cycles.listClosed(clubId).then(({ data }) => setPastCycles((data ?? []) as ClosedCycle[]));
  }, [clubId]);

  useEffect(() => {
    loadPast();
  }, [loadPast, cycle]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshClub(), refresh()]);
    loadPast();
  }, [refreshClub, refresh, loadPast]);
  const { refreshing, onRefresh } = useRefresh(refreshAll);

  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const isPicker = cycle?.picker_id === userId;
  const picker = members.find((m) => m.profile_id === cycle?.picker_id);
  const pickerName = picker?.profiles?.display_name ?? 'someone';

  const goingCount = useMemo(
    () =>
      rsvps.filter((r) => r.status === 'yes').length +
      guests.filter((g) => g.status === 'yes').length,
    [rsvps, guests],
  );
  const myStatus = rsvps.find((r) => r.profile_id === userId)?.status as RsvpStatus | undefined;

  if (!clubId) return <NoClubSelected what="cycle, albums, and meeting" />;

  if (clubLoading || cycleLoading || !club) {
    return (
      <Screen>
        <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12 }}>
          {clubLoading || cycleLoading ? 'Loading…' : 'Club not found (are you a member?).'}
        </Text>
      </Screen>
    );
  }

  const url = inviteUrl(club.invite_code);
  const shareInvite = async () => {
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      await Share.share({ message: `Join "${club.name}" on Vinyl & Vino: ${url}` });
    }
  };

  const setMyRsvp = async (status: RsvpStatus) => {
    if (!cycle || !userId) return;
    const { error: err } = await rsvpsDb.set(cycle.id, userId, status);
    if (err) setError(err.message);
    refresh();
  };

  const myPreference = preferences.find((p) => p.profile_id === userId)?.album_id;
  const setPreference = async (albumId: string) => {
    if (!cycle || !userId) return;
    const { error: err } = await preferencesDb.set(cycle.id, userId, albumId);
    if (err) setError(err.message);
    refresh();
  };

  const revealCycle = async () => {
    if (!cycle) return;
    if (
      await confirmAsync(
        'Reveal ratings',
        'Everyone will see all scores, reviews, and song picks. Do this at the meeting!',
      )
    ) {
      const { error: err } = await cycles.reveal(cycle.id);
      if (err) setError(err.message);
      refresh();
    }
  };

  const closeCycle = async () => {
    if (!cycle) return;
    if (
      await confirmAsync(
        'Close cycle',
        `Close cycle ${cycle.number}? Ratings get revealed and the wheel unlocks for the next spin.`,
      )
    ) {
      const { error: err } = await cycles.close(cycle.id);
      if (err) setError(err.message);
      refresh();
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>LISTENING CLUB</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>
            {club.emoji} {club.name}
          </Text>
        </View>
        <Pressable onPress={() => router.push(`/club/${club.id}/members`)}>
          <View style={styles.avStack}>
            {members.slice(0, 3).map((m) => (
              <Avatar
                key={m.id}
                name={m.profiles?.display_name ?? null}
                colorIndex={m.profiles?.avatar_color ?? 0}
                size={30}
              />
            ))}
          </View>
        </Pressable>
      </View>

      {!cycle ? (
        <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
          <Text style={{ fontSize: 44, marginBottom: 10 }}>🎡</Text>
          <Text style={[styles.heroTitle, { color: palette.text1 }]}>No cycle running</Text>
          <Text style={[styles.heroSub, { color: palette.text2 }]}>
            Spin the wheel to choose who picks the next two albums.
          </Text>
          {isAdmin ? (
            <Button title="Spin the wheel" onPress={() => router.push(`/club/${club.id}/wheel`)} style={{ marginTop: 14, alignSelf: 'stretch' }} />
          ) : (
            <InlineNote text="An admin spins the wheel to start the next cycle." />
          )}
        </Card>
      ) : (
        <>
          <Label>Cycle {cycle.number} · picked by {isPicker ? 'you' : pickerName}</Label>
          {albums.length === 0 ? (
            <Card>
              <Text style={[styles.heroSub, { color: palette.text2 }]}>
                {isPicker
                  ? 'Your spin! Choose the two albums for this cycle.'
                  : `${pickerName} is choosing two albums…`}
              </Text>
              {isPicker || isAdmin ? (
                <Button title="🎵 Choose albums" onPress={() => router.push(`/club/${club.id}/pick-albums`)} style={{ marginTop: 12 }} />
              ) : null}
            </Card>
          ) : (
            <Card>
              {albums.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => router.push(`/club/${club.id}/album/${a.id}`)}
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
                    <Text style={[styles.albumPickLabel, { color: palette.teal }]}>ALBUM {a.slot}</Text>
                    <Text numberOfLines={1} style={[styles.albumName, { color: palette.text1 }]}>{a.title}</Text>
                    <Text numberOfLines={1} style={[styles.albumMeta, { color: palette.text2 }]}>
                      {a.artist}
                      {a.year ? ` · ${a.year}` : ''}
                    </Text>
                    <Text style={[styles.rateHint, { color: palette.purple }]}>⭐ rate &amp; reviews ›</Text>
                  </View>
                </Pressable>
              ))}
              {(isPicker || isAdmin) && albums.length < 2 ? (
                <Button title={`Choose album ${albums.length + 1}`} variant="ghost" onPress={() => router.push(`/club/${club.id}/pick-albums`)} />
              ) : null}
            </Card>
          )}

          {albums.length === 2 ? (
            <>
              <Label>Which did you like more?</Label>
              <Card>
                <View style={styles.prefRow}>
                  {albums.map((a) => {
                    const mine = myPreference === a.id;
                    const votes = preferences.filter((p) => p.album_id === a.id).length;
                    return (
                      <Pressable
                        key={a.id}
                        onPress={() => setPreference(a.id)}
                        style={[
                          styles.prefBtn,
                          { backgroundColor: palette.card2, borderColor: palette.border },
                          mine && { backgroundColor: palette.purpleBg, borderColor: palette.purple },
                        ]}
                      >
                        <Text numberOfLines={1} style={[styles.prefTitle, { color: mine ? palette.purple : palette.text1 }]}>
                          {a.title}
                        </Text>
                        <Text style={[styles.prefMeta, { color: palette.text3 }]}>
                          {cycle.revealed_at ? `${votes} vote${votes === 1 ? '' : 's'}` : mine ? 'your pick' : 'tap to pick'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!cycle.revealed_at ? (
                  <Text style={[styles.prefNote, { color: palette.text3 }]}>
                    Votes stay sealed until the reveal.
                  </Text>
                ) : null}
              </Card>
            </>
          ) : null}

          <Label>Meeting &amp; RSVP</Label>
          <Card>
            <View style={styles.meetingRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.meetingDate, { color: palette.text1 }]}>
                  {cycle.meeting_at
                    ? new Date(cycle.meeting_at).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'No meeting set'}
                </Text>
                {cycle.meeting_time_location ? (
                  <Text style={[styles.meetingSub, { color: palette.text2 }]}>
                    {cycle.meeting_time_location}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.goingBadge, { color: palette.teal, backgroundColor: palette.tealBg }]}>
                {goingCount} going
              </Text>
            </View>

            <View style={styles.rsvpQuick}>
              {(
                [
                  ['yes', '✓ Going', palette.teal, palette.tealBg],
                  ['maybe', '? Maybe', palette.amber, palette.amberBg],
                  ['no', "✕ Can't go", palette.coral, palette.coralBg],
                ] as [RsvpStatus, string, string, string][]
              ).map(([s, label, color, bg]) => {
                const active = myStatus === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setMyRsvp(s)}
                    style={[
                      styles.quickBtn,
                      { backgroundColor: palette.card2, borderColor: palette.border },
                      active && { backgroundColor: bg, borderColor: color },
                    ]}
                  >
                    <Text style={[styles.quickText, { color: active ? color : palette.text3 }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.cardDivider, { borderTopColor: palette.border }]} />
            <View style={styles.meetingActions}>
              <Button
                title="RSVP list & guests"
                variant="ghost"
                onPress={() => router.push(`/club/${club.id}/rsvp`)}
                style={styles.actionFlex}
              />
              {cycle.meeting_at ? (
                <Button
                  title="📅 Calendar"
                  variant="ghost"
                  onPress={() =>
                    addToCalendar({
                      title: `${club.name} — Cycle ${cycle.number}`,
                      start: new Date(cycle.meeting_at!),
                      location: cycle.meeting_time_location,
                      details: albums.map((a) => `${a.title} — ${a.artist}`).join('\n'),
                    })
                  }
                  style={styles.actionFlex}
                />
              ) : null}
            </View>
            {isAdmin ? (
              <Button
                title={cycle.meeting_at ? 'Edit meeting' : 'Set the meeting'}
                variant="ghost"
                onPress={() => router.push(`/club/${club.id}/schedule`)}
                style={{ marginTop: 8 }}
              />
            ) : null}
          </Card>

          {isAdmin ? (
            <View style={{ gap: 8, marginBottom: 12 }}>
              {albums.length > 0 && !cycle.revealed_at ? (
                <Button title="🎙 Reveal ratings (at the meeting)" onPress={revealCycle} />
              ) : null}
              {cycle.revealed_at ? (
                <InlineNote text="Ratings are revealed — open an album to read everything." tone="success" />
              ) : null}
              <Button title="Close this cycle" variant="danger" onPress={closeCycle} />
            </View>
          ) : null}
        </>
      )}

      {pastCycles.length > 0 ? (
        <>
          <Label>Past cycles</Label>
          <Card>
            {pastCycles.map((pc) =>
              pc.albums
                .slice()
                .sort((a, b) => a.slot - b.slot)
                .map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/club/${club.id}/album/${a.id}`)}
                    style={({ pressed }) => [styles.pastRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[styles.pastCycleNum, { color: palette.text3 }]}>#{pc.number}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[styles.pastTitle, { color: palette.text1 }]}>{a.title}</Text>
                      <Text numberOfLines={1} style={[styles.pastArtist, { color: palette.text2 }]}>{a.artist}</Text>
                    </View>
                    <Text style={{ color: palette.text3 }}>›</Text>
                  </Pressable>
                )),
            )}
          </Card>
        </>
      ) : null}

      <Label>Invite members</Label>
      <Card>
        <Text selectable style={[styles.inviteUrl, { color: palette.teal }]}>{url}</Text>
        <Button
          title={copied ? '✓ Copied!' : Platform.OS === 'web' ? '📋 Copy invite link' : 'Share invite link'}
          variant="ghost"
          onPress={shareInvite}
        />
      </Card>

      {error ? <InlineNote text={error} tone="error" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  avStack: { flexDirection: 'row', marginLeft: 8 },
  heroTitle: { fontFamily: fonts.sansBold, fontSize: 18, marginBottom: 6 },
  heroSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  albumRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8 },
  art: { width: 64, height: 64, borderRadius: radius.md },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  albumPickLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2.5, marginBottom: 3 },
  albumName: { fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 1 },
  albumMeta: { fontFamily: fonts.sans, fontSize: 12 },
  rateHint: { fontFamily: fonts.monoMedium, fontSize: 10, marginTop: 3 },
  pastRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  pastCycleNum: { fontFamily: fonts.monoMedium, fontSize: 11, width: 28 },
  pastTitle: { fontFamily: fonts.sansMedium, fontSize: 13 },
  pastArtist: { fontFamily: fonts.sans, fontSize: 11 },
  meetingRow: { flexDirection: 'row', alignItems: 'flex-start' },
  meetingDate: { fontFamily: fonts.sansBold, fontSize: 20 },
  meetingSub: { fontFamily: fonts.sans, fontSize: 13, marginTop: 2 },
  goingBadge: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  quickRow: { flexDirection: 'row', gap: 6 },
  rsvpQuick: { flexDirection: 'row', gap: 6, marginTop: 12 },
  cardDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12 },
  meetingActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionFlex: { flex: 1 },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  quickText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  inviteUrl: { fontFamily: fonts.mono, fontSize: 12, marginBottom: 10 },
  prefRow: { flexDirection: 'row', gap: 8 },
  prefBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 3,
  },
  prefTitle: { fontFamily: fonts.sansBold, fontSize: 13, maxWidth: '100%' },
  prefMeta: { fontFamily: fonts.mono, fontSize: 10 },
  prefNote: { fontFamily: fonts.mono, fontSize: 10, marginTop: 8, textAlign: 'center' },
});
