import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { inviteUrl } from '@/constants';
import { fonts, radius } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import {
  cycles,
  rsvps as rsvpsDb,
  type Album,
  type Cycle,
  type RsvpStatus,
} from '@/utils/supabase/db';

interface ClosedCycle extends Cycle {
  albums: Album[];
}

// Club home: the current cycle is the centerpiece — picker, two albums,
// meeting, RSVP. No open cycle → the spin call-to-action.
export default function ClubHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const { club, members, myRole, loading: clubLoading } = useClubData(id);
  const { cycle, albums, rsvps, guests, loading: cycleLoading, refresh } = useCycle(id);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pastCycles, setPastCycles] = useState<ClosedCycle[]>([]);

  useEffect(() => {
    if (!id) return;
    cycles.listClosed(id).then(({ data }) => setPastCycles((data ?? []) as ClosedCycle[]));
  }, [id, cycle]);

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
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.replace('/')}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
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
                    <Text style={[styles.rateHint, { color: palette.purple }]}>
                      ⭐ rate & reviews ›
                    </Text>
                  </View>
                </Pressable>
              ))}
              {(isPicker || isAdmin) && albums.length < 2 ? (
                <Button title={`Choose album ${albums.length + 1}`} variant="ghost" onPress={() => router.push(`/club/${club.id}/pick-albums`)} />
              ) : null}
            </Card>
          )}

          <Label>Meeting</Label>
          <Card>
            <View style={styles.meetingRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.meetingDate, { color: palette.text1 }]}>
                  {cycle.meeting_date ?? 'No meeting set'}
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
            {isAdmin ? (
              <Button
                title={cycle.meeting_date ? 'Edit meeting' : 'Set the meeting'}
                variant="ghost"
                onPress={() => router.push(`/club/${club.id}/schedule`)}
                style={{ marginTop: 10 }}
              />
            ) : null}
          </Card>

          <Label>Your RSVP</Label>
          <Card>
            <View style={styles.quickRow}>
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
                    <Text style={[styles.quickText, { color: active ? color : palette.text3 }]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button title="Full RSVP list & guests" variant="ghost" onPress={() => router.push(`/club/${club.id}/rsvp`)} style={{ marginTop: 10 }} />
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
                      <Text numberOfLines={1} style={[styles.pastTitle, { color: palette.text1 }]}>
                        {a.title}
                      </Text>
                      <Text numberOfLines={1} style={[styles.pastArtist, { color: palette.text2 }]}>
                        {a.artist}
                      </Text>
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
  back: { fontSize: 22, paddingHorizontal: 4 },
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
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  quickText: { fontFamily: fonts.monoMedium, fontSize: 11 },
  inviteUrl: { fontFamily: fonts.mono, fontSize: 12, marginBottom: 10 },
});
