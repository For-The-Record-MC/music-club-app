import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { ClubSwitcher } from '@/components/ClubSwitcher';
import { ShareComposer } from '@/components/ShareComposer';
import { StudioHighlights } from '@/components/StudioHighlights';
import { Avatar, Button, Card, InlineNote, Label, Loading, Screen } from '@/components/ui';
import { useActivity } from '@/hooks/useActivity';
import { useClubData } from '@/hooks/useClubData';
import { useCycle } from '@/hooks/useCycle';
import { useMyClubs } from '@/hooks/useMyClubs';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useClubSwitcherStore } from '@/stores/clubSwitcherStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { inviteUrl } from '@/constants';
import { fonts, radius } from '@/theme';
import { addToCalendar } from '@/utils/calendar';
import { confirmAsync } from '@/utils/confirm';
import {
  cycles,
  preferences as preferencesDb,
  rsvps as rsvpsDb,
  streaming,
  type RsvpStatus,
} from '@/utils/supabase/db';

// Home tab: the selected club's current cycle — picker, two albums, meeting, RSVP.
export default function HomeTab() {
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const profile = useAuthStore((s) => s.profile);
  const clubId = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const setClub = useCurrentClubStore((s) => s.setClub);
  const { club, members, myRole, loading: clubLoading, refresh: refreshClub } = useClubData(clubId);
  const { cycle, albums, rsvps, guests, preferences, loading: cycleLoading, refresh } = useCycle(clubId);
  const { unread } = useActivity(clubId);
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pastCycleCount, setPastCycleCount] = useState(0);

  const loadPast = useCallback(() => {
    if (!clubId) return;
    cycles.listClosed(clubId).then(({ data }) => setPastCycleCount((data ?? []).length));
  }, [clubId]);

  useEffect(() => {
    loadPast();
  }, [loadPast, cycle]);

  // Self-heal a stale club selection (signed into a different account, removed
  // from the club, or the club was deleted): if the selected club isn't among
  // this user's memberships, deselect it so the no-club states below render
  // instead of the "Club not found" dead end.
  const { rows: myClubs, loading: myClubsLoading } = useMyClubs();
  useEffect(() => {
    if (clubId && !myClubsLoading && !myClubs.some((r) => r.club.id === clubId)) {
      setClub(null);
    }
  }, [clubId, myClubsLoading, myClubs, setClub]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshClub(), refresh()]);
    loadPast();
  }, [refreshClub, refresh, loadPast]);
  const { refreshing, onRefresh } = useRefresh(refreshAll);

  // First-ever club view on this device: show the "how it works" tour once, so
  // new members get oriented without anyone pointing them to the menu.
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);
  const seenHowItWorks = useOnboardingStore((s) => s.seenHowItWorks);
  const markSeenHowItWorks = useOnboardingStore((s) => s.markSeen);
  useEffect(() => {
    if (clubId && onboardingHydrated && !seenHowItWorks && profile?.display_name) {
      markSeenHowItWorks();
      router.push('/how-it-works');
    }
  }, [clubId, onboardingHydrated, seenHowItWorks, profile?.display_name, markSeenHowItWorks, router]);

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

  // First sign-in: get a display name before showing the club UI.
  if (profile && !profile.display_name) {
    return <Redirect href="/profile-setup" />;
  }

  if (!clubId) {
    // Two very different people land here: a brand-new user with no clubs at
    // all (full welcome — what is this app, how do I start?) and a member who
    // just hasn't selected a club on this device (terse picker prompt).
    const isNewUser = !myClubsLoading && myClubs.length === 0;
    return (
      <Screen>
        <View style={styles.topbar}>
          <ClubSwitcher />
        </View>
        {myClubsLoading ? (
          <Loading />
        ) : isNewUser ? (
          <>
            <View style={[styles.welcomeHero, { backgroundColor: palette.tealBg, borderColor: palette.teal }]}>
              <Text style={{ fontSize: 44, marginBottom: 10 }}>🍷</Text>
              <Text style={[styles.heroTitle, { color: palette.text1 }]}>Welcome to the club</Text>
              <Text style={[styles.heroSub, { color: palette.text2 }]}>
                This is your listening club&apos;s clubhouse: pick albums together, spend the week
                listening, rate them in secret, then meet up and reveal what everyone really
                thought.
              </Text>
            </View>

            <Label>Start a club</Label>
            <Card>
              <Text style={[styles.welcomeBody, { color: palette.text2 }]}>
                You name it, friends join with your invite link, and you spin the wheel to kick
                off the first cycle. Takes about a minute.
              </Text>
              <Button
                title="Create a club"
                onPress={() => router.push('/create-club')}
                style={{ marginTop: 12 }}
              />
            </Card>

            <Label>Join a club</Label>
            <Card>
              <Text style={[styles.welcomeBody, { color: palette.text2 }]}>
                Got an invite from a friend? Tap their link — or enter the invite code here.
              </Text>
              <Button
                title="Enter an invite code"
                variant="ghost"
                onPress={() => router.push('/join')}
                style={{ marginTop: 12 }}
              />
            </Card>

            <Button
              title="❓ Curious how a cycle works? Take the tour"
              variant="ghost"
              onPress={() => router.push('/how-it-works')}
              style={{ marginTop: 4 }}
            />
          </>
        ) : (
          <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
            <Text style={{ fontSize: 44, marginBottom: 10 }}>🎵</Text>
            <Text style={[styles.heroTitle, { color: palette.text1 }]}>No club selected</Text>
            <Text style={[styles.heroSub, { color: palette.text2 }]}>
              Pick one of your clubs from the switcher up top — or start a new one.
            </Text>
            <Button
              title="Choose a club"
              onPress={() => useClubSwitcherStore.getState().setOpen(true)}
              style={{ marginTop: 14, alignSelf: 'stretch' }}
            />
            <Button
              title="Create a club"
              variant="ghost"
              onPress={() => router.push('/create-club')}
              style={{ marginTop: 8, alignSelf: 'stretch' }}
            />
          </Card>
        )}
      </Screen>
    );
  }

  if (clubLoading || cycleLoading || !club) {
    return (
      <Screen>
        <View style={styles.topbar}>
          <ClubSwitcher />
        </View>
        {clubLoading || cycleLoading ? (
          <Loading />
        ) : (
          <Text style={{ color: palette.text3, fontFamily: fonts.mono, fontSize: 12 }}>
            Club not found (are you a member?).
          </Text>
        )}
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
      await Share.share({ message: `Join "${club.name}" on For The Record MC: ${url}` });
    }
  };
  const shareCode = async () => {
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(club.invite_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } else {
      await Share.share({
        message: `Join "${club.name}" on For The Record MC with invite code: ${club.invite_code}`,
      });
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
        `Close cycle ${cycle.number}? Ratings get revealed, the highlights playlist is built, and the wheel unlocks for the next spin.`,
      )
    ) {
      const cycleId = cycle.id;
      const cycleNumber = cycle.number;
      const { error: err } = await cycles.close(cycleId);
      if (err) {
        setError(err.message);
        return;
      }
      // Build the cycle-highlights + all-time-favorites playlists. Fire-and-forget
      // — no-ops quietly if the club hasn't connected Spotify; the History page
      // surfaces the result regardless.
      streaming.generateHighlights(club.id, cycleId).then(({ data }) => {
        if (data?.ok && (data.added ?? 0) > 0) {
          setNotice(
            `🎶 Cycle ${cycleNumber} highlights playlist created${
              data.favorites_added ? ` · ${data.favorites_added} added to all-time favorites` : ''
            }.`,
          );
        }
      });
      refresh();
    }
  };

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <ClubSwitcher />
        <Pressable
          onPress={() => router.push(`/club/${club.id}/activity`)}
          hitSlop={8}
          style={styles.bell}
        >
          <Text style={{ fontSize: 22 }}>🔔</Text>
          {unread > 0 ? (
            <View style={[styles.bellBadge, { backgroundColor: palette.amber }]}>
              <Text style={styles.bellBadgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable onPress={() => router.push(`/club/${club.id}/members`)}>
          <View style={styles.avStack}>
            {members.slice(0, 3).map((m) => (
              <Avatar
                key={m.id}
                name={m.profiles?.display_name ?? null}
                colorIndex={m.profiles?.avatar_color ?? 0}
                imageUrl={m.profiles?.avatar_url}
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
              {albums.map((a) => {
                const mine = myPreference === a.id;
                const votes = preferences.filter((p) => p.album_id === a.id).length;
                return (
                  <View key={a.id} style={styles.albumRow}>
                    <Pressable
                      onPress={() => router.push(`/club/${club.id}/album/${a.id}`)}
                      style={({ pressed }) => [styles.albumMain, pressed && { opacity: 0.7 }]}
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
                    {albums.length === 2 ? (
                      <Pressable
                        onPress={() => setPreference(a.id)}
                        hitSlop={8}
                        accessibilityLabel={`Mark ${a.title} as your favorite`}
                        style={[
                          styles.crownBtn,
                          { backgroundColor: palette.card2, borderColor: palette.border },
                          mine && { backgroundColor: palette.amberBg, borderColor: palette.amber },
                        ]}
                      >
                        <Text style={{ fontSize: 17, opacity: mine ? 1 : 0.3 }}>👑</Text>
                        {cycle.revealed_at ? (
                          <Text style={[styles.crownVotes, { color: mine ? palette.amber : palette.text3 }]}>
                            {votes}
                          </Text>
                        ) : null}
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
              {(isPicker || isAdmin) && albums.length < 2 ? (
                <Button title={`Choose album ${albums.length + 1}`} variant="ghost" onPress={() => router.push(`/club/${club.id}/pick-albums`)} />
              ) : null}
              {(isPicker || isAdmin) && albums.length === 2 && !cycle.revealed_at ? (
                <Button title="✏️ Edit albums" variant="ghost" onPress={() => router.push(`/club/${club.id}/pick-albums`)} />
              ) : null}
              {cycle.spotify_playlist_url ? (
                <Pressable
                  onPress={() => Linking.openURL(cycle.spotify_playlist_url!)}
                  style={({ pressed }) => [styles.playlistBtn, { opacity: pressed ? 0.85 : 1 }]}
                >
                  <View style={styles.playlistPlay}>
                    <Text style={styles.playlistPlayIcon}>▶</Text>
                  </View>
                  <Text style={styles.playlistBtnText}>Current Cycle Playlist</Text>
                </Pressable>
              ) : null}
            </Card>
          )}

          <StudioHighlights clubId={club.id} cycleId={cycle.id}>
            <ShareComposer clubId={club.id} includePlaylists />
          </StudioHighlights>

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

            {cycle.meeting_url ? (
              <Button
                title="🎥 Join call"
                onPress={() => Linking.openURL(cycle.meeting_url!)}
                style={{ marginTop: 12 }}
              />
            ) : null}

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
                      details: [
                        ...albums.map((a) => `${a.title} — ${a.artist}`),
                        cycle.meeting_url ? `\nVideo call: ${cycle.meeting_url}` : '',
                      ]
                        .filter(Boolean)
                        .join('\n'),
                    })
                  }
                  style={styles.actionFlex}
                />
              ) : null}
            </View>
            <Button
              title={cycle.meeting_at ? '🗳 Vote on a new time' : '🗳 Vote on a time'}
              variant="ghost"
              onPress={() => router.push(`/club/${club.id}/meeting-poll`)}
              style={{ marginTop: 8 }}
            />
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

      {pastCycleCount > 0 ? (
        <Pressable onPress={() => router.push('/history')}>
          <Card style={styles.historyLink}>
            <Text style={[styles.historyLinkText, { color: palette.text1 }]}>
              📜 {pastCycleCount} past cycle{pastCycleCount === 1 ? '' : 's'} — see history
            </Text>
            <Text style={{ color: palette.text3 }}>›</Text>
          </Card>
        </Pressable>
      ) : null}

      <Label>Invite members</Label>
      <Card>
        <Button
          title={copied ? '✓ Copied!' : Platform.OS === 'web' ? '📋 Copy invite link' : 'Share invite link'}
          variant="ghost"
          onPress={shareInvite}
        />
        <Button
          title={codeCopied ? '✓ Copied!' : Platform.OS === 'web' ? '📋 Copy invite code' : 'Share invite code'}
          variant="ghost"
          onPress={shareCode}
        />
      </Card>

      {notice ? <InlineNote text={notice} tone="success" /> : null}
      {error ? <InlineNote text={error} tone="error" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  bell: { position: 'relative' },
  bellBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { fontFamily: fonts.monoMedium, fontSize: 9, color: '#000' },
  avStack: { flexDirection: 'row', marginLeft: 8 },
  heroTitle: { fontFamily: fonts.sansBold, fontSize: 18, marginBottom: 6 },
  heroSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  welcomeHero: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 22,
  },
  welcomeBody: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  albumRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  playlistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: '#1DB954', // Spotify brand green — works on both themes
    borderRadius: radius.lg,
    paddingVertical: 13,
    marginTop: 14,
  },
  playlistPlay: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistPlayIcon: { color: '#1DB954', fontSize: 11, marginLeft: 1 },
  playlistBtnText: { fontFamily: fonts.sansBold, fontSize: 14, color: '#fff', letterSpacing: 0.2 },
  historyLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyLinkText: { fontFamily: fonts.sansMedium, fontSize: 14 },
  featuredRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featuredArt: { width: 50, height: 50, borderRadius: radius.sm },
  featuredEyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 1.5, marginBottom: 3 },
  featuredTitle: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 1 },
  featuredArtist: { fontFamily: fonts.sans, fontSize: 12 },
  albumMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  crownBtn: {
    width: 46,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  crownVotes: { fontFamily: fonts.monoMedium, fontSize: 10 },
  crownHint: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 15, marginTop: 6 },
  art: { width: 64, height: 64, borderRadius: radius.md },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  albumPickLabel: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 2.5, marginBottom: 3 },
  albumName: { fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 1 },
  albumMeta: { fontFamily: fonts.sans, fontSize: 12 },
  rateHint: { fontFamily: fonts.monoMedium, fontSize: 10, marginTop: 3 },
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
});
