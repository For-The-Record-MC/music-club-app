import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar, Badge, BottomSheet, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useClubData, type MemberRow } from '@/hooks/useClubData';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { clubEmojis, fonts, radius } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { memberName } from '@/utils/memberName';
import { COMMON_TIMEZONES, timezoneLabel } from '@/utils/timezone';
import {
  activity,
  clubMembers,
  clubs,
  DEFAULT_LEADERBOARD_WEIGHTS,
  type Club,
  type LeaderboardWeights,
} from '@/utils/supabase/db';

const WEIGHT_FIELDS: { key: keyof LeaderboardWeights; label: string }[] = [
  { key: 'meetings_attended', label: 'Meeting attended' },
  { key: 'albums_chosen', label: 'Album picked' },
  { key: 'songs_shared', label: 'Song shared' },
  { key: 'ratings_given', label: 'Rating given' },
  { key: 'concerts_added', label: 'Concert added' },
  { key: 'interactions_given', label: 'Reaction / comment given' },
];

// The club admin hub (owner + admin). Edit club details, set the per-cycle song
// limit, rotate the invite code, manage members, and (owner only) delete the
// club. Streaming connection lives on its own owner-only screen.
export default function ClubSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const clearClub = useCurrentClubStore((s) => s.setClub);
  const { club, members, myRole, loading, refresh } = useClubData(id);

  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  // Editable club-detail state, seeded once the club loads.
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎵');
  const [limitOn, setLimitOn] = useState(false);
  const [limitText, setLimitText] = useState('5');
  // null = fall back to each viewer's device timezone for meeting times.
  const [tz, setTz] = useState<string | null>(null);
  const [tzSheet, setTzSheet] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savedDetails, setSavedDetails] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState(false);

  // Announcement composer.
  const [announceBody, setAnnounceBody] = useState('');
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announcing, setAnnouncing] = useState(false);
  const [announceErr, setAnnounceErr] = useState<string | null>(null);
  const [announceSent, setAnnounceSent] = useState(false);
  const [announceQuota, setAnnounceQuota] = useState<{ limit: number; used: number } | null>(null);

  const loadQuota = useCallback(async () => {
    if (!club) return;
    const { data } = await activity.announcementQuota(club.id);
    if (data) setAnnounceQuota(data as { limit: number; used: number });
  }, [club]);

  useEffect(() => {
    if (club && isAdmin) loadQuota();
  }, [club, isAdmin, loadQuota]);

  const sendAnnouncement = async () => {
    if (!club || !announceBody.trim()) return;
    setAnnouncing(true);
    setAnnounceErr(null);
    const { error: err } = await activity.postAnnouncement(club.id, announceTitle.trim(), announceBody.trim());
    setAnnouncing(false);
    if (err) {
      setAnnounceErr(err.message);
      return;
    }
    setAnnounceTitle('');
    setAnnounceBody('');
    setAnnounceSent(true);
    setTimeout(() => setAnnounceSent(false), 2200);
    loadQuota();
  };

  useEffect(() => {
    if (!club) return;
    setName(club.name);
    setEmoji(club.emoji);
    const cap = club.song_limit_per_cycle;
    setLimitOn(cap != null);
    if (cap != null) setLimitText(String(cap));
    setTz(club.meeting_timezone ?? null);
  }, [club]);

  // Members can't be here — bounce them home.
  useEffect(() => {
    if (!loading && club && !isAdmin) router.replace('/home');
  }, [loading, club, isAdmin, router]);

  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err.message);
    await refresh();
  };

  const saveDetails = async () => {
    if (!club) return;
    if (!name.trim()) {
      setError('Give your club a name.');
      return;
    }
    const cap = limitOn ? Math.max(1, parseInt(limitText, 10) || 1) : null;
    setSavingDetails(true);
    setError(null);
    const { error: err } = await clubs.update(club.id, {
      name: name.trim(),
      emoji,
      song_limit_per_cycle: cap,
      meeting_timezone: tz,
    });
    setSavingDetails(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSavedDetails(true);
    setTimeout(() => setSavedDetails(false), 2200);
    refresh();
  };

  const toggleAdmin = (m: MemberRow) =>
    act(() => clubMembers.setRole(m.id, m.role === 'admin' ? 'member' : 'admin'));

  const removeMember = async (m: MemberRow) => {
    const who = m.profiles?.display_name ?? 'this member';
    if (await confirmAsync('Remove member', `Remove ${who} from the club?`)) {
      act(() => clubMembers.remove(m.id));
    }
  };

  const rotate = async () => {
    if (!club) return;
    if (
      await confirmAsync(
        'New invite link',
        'The current invite link stops working and a new one is generated.',
      )
    ) {
      await act(() => clubs.rotateInviteCode(club.id));
      setRotated(true);
      setTimeout(() => setRotated(false), 2500);
    }
  };

  const deleteClub = async () => {
    if (!club) return;
    if (
      await confirmAsync('Delete club', `Delete "${club.name}" for everyone? This cannot be undone.`)
    ) {
      await clubs.remove(club.id);
      clearClub(null);
      router.replace('/');
    }
  };

  if (!club) return <Screen><Text style={{ color: palette.text3 }}>Loading…</Text></Screen>;

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>{club.name.toUpperCase()}</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>Club settings</Text>
        </View>
      </View>

      {/* Club details */}
      <Card>
        <Label>Club emoji</Label>
        <View style={styles.emojiGrid}>
          {clubEmojis.map((e) => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              style={[
                styles.emojiOpt,
                { backgroundColor: palette.card2, borderColor: palette.border },
                e === emoji && { borderColor: palette.teal, backgroundColor: palette.tealBg },
              ]}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </Pressable>
          ))}
        </View>

        <Label>{'\n'}Club name</Label>
        <TextField value={name} onChangeText={setName} maxLength={60} placeholder="Club name" />

        <Label>{'\n'}Songs per cycle</Label>
        <View style={styles.limitRow}>
          <Text style={[styles.limitDesc, { color: palette.text2 }]}>
            Cap how many songs each member can add to the feed per cycle.
          </Text>
          <Switch
            value={limitOn}
            onValueChange={setLimitOn}
            trackColor={{ true: palette.teal, false: palette.border2 }}
          />
        </View>
        {limitOn ? (
          <View style={styles.limitInputRow}>
            <TextField
              value={limitText}
              onChangeText={(t) => setLimitText(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={3}
              style={{ width: 80, textAlign: 'center' }}
            />
            <Text style={[styles.limitUnit, { color: palette.text3 }]}>songs / member / cycle</Text>
          </View>
        ) : (
          <Text style={[styles.limitUnit, { color: palette.text3 }]}>Unlimited — no cap.</Text>
        )}

        <Label>{'\n'}Meeting timezone</Label>
        <Text style={[styles.limitDesc, { color: palette.text2, marginBottom: 8 }]}>
          The timezone meeting times (and the time poll) are shown in.
        </Text>
        <Pressable
          onPress={() => setTzSheet(true)}
          style={[styles.tzField, { backgroundColor: palette.card2, borderColor: palette.border }]}
        >
          <Text style={[styles.tzValue, { color: palette.text1 }]}>{timezoneLabel(tz)}</Text>
          <Text style={[styles.tzChevron, { color: palette.teal }]}>change ▾</Text>
        </Pressable>

        <Button
          title={savedDetails ? '✓ Saved' : 'Save changes'}
          onPress={saveDetails}
          loading={savingDetails}
          style={{ marginTop: 16 }}
        />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>

      <BottomSheet visible={tzSheet} onClose={() => setTzSheet(false)}>
        <Label>Meeting timezone</Label>
        <Pressable
          onPress={() => {
            setTz(null);
            setTzSheet(false);
          }}
          style={styles.tzRow}
        >
          <Text style={[styles.tzRowText, { color: !tz ? palette.teal : palette.text1 }]}>
            Device timezone (auto)
          </Text>
        </Pressable>
        {COMMON_TIMEZONES.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => {
              setTz(t.value);
              setTzSheet(false);
            }}
            style={styles.tzRow}
          >
            <Text style={[styles.tzRowText, { color: tz === t.value ? palette.teal : palette.text1 }]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </BottomSheet>

      {/* Announce — owner + admin broadcast to the whole club */}
      <Card style={{ marginTop: 14 }}>
        <Label>📣 Announce to the club</Label>
        <Text style={[styles.limitDesc, { color: palette.text2, marginBottom: 10 }]}>
          Sends a notification to every member (unless they've muted this club).
        </Text>
        <TextField
          value={announceTitle}
          onChangeText={setAnnounceTitle}
          maxLength={80}
          placeholder="Title (optional)"
        />
        <View style={{ height: 8 }} />
        <TextField
          value={announceBody}
          onChangeText={setAnnounceBody}
          maxLength={500}
          placeholder="What's the news?"
          multiline
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
        {announceQuota ? (
          <InlineNote
            text={
              announceQuota.used >= announceQuota.limit
                ? `You've used all ${announceQuota.limit} announcements for today.`
                : `${announceQuota.limit - announceQuota.used} of ${announceQuota.limit} announcements left today.`
            }
            tone={announceQuota.used >= announceQuota.limit ? 'error' : 'muted'}
          />
        ) : null}
        <Button
          title={announceSent ? '✓ Sent' : 'Send announcement'}
          onPress={sendAnnouncement}
          loading={announcing}
          disabled={!announceBody.trim() || (announceQuota?.used ?? 0) >= (announceQuota?.limit ?? 3)}
          style={{ marginTop: 12 }}
        />
        {announceErr ? <InlineNote text={announceErr} tone="error" /> : null}
      </Card>

      {/* Leaderboard scoring */}
      <LeaderboardScoringCard club={club} onSaved={refresh} />

      {/* Members */}
      <Label>{'\n'}Members</Label>
      {members.map((m) => {
        const isMe = m.profile_id === userId;
        const canManage = !isMe && m.role !== 'owner' && (isOwner || m.role === 'member');
        return (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <View style={styles.memberRow}>
              <Avatar
                name={memberName(m.profiles?.display_name, m.profiles?.email)}
                colorIndex={m.profiles?.avatar_color ?? 0}
                imageUrl={m.profiles?.avatar_url}
                size={38}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.memberName, { color: palette.text1 }]}>
                  {memberName(m.profiles?.display_name, m.profiles?.email)} {isMe ? '· you' : ''}
                </Text>
                <Text style={[styles.memberMeta, { color: palette.text3 }]}>
                  joined {new Date(m.joined_at).toLocaleDateString()}
                </Text>
              </View>
              {m.role !== 'member' ? (
                <Badge
                  text={m.role}
                  color={m.role === 'owner' ? palette.teal : palette.purple}
                  bg={m.role === 'owner' ? palette.tealBg : palette.purpleBg}
                />
              ) : null}
            </View>
            {canManage ? (
              <View style={styles.actions}>
                {isOwner ? (
                  <Button
                    title={m.role === 'admin' ? 'Demote to member' : 'Make admin'}
                    variant="ghost"
                    onPress={() => toggleAdmin(m)}
                    style={styles.actionBtn}
                  />
                ) : null}
                <Button
                  title="Remove"
                  variant="danger"
                  onPress={() => removeMember(m)}
                  style={styles.actionBtn}
                />
              </View>
            ) : null}
          </Card>
        );
      })}

      {/* The Archive — curate pre-club albums (owner + admin) */}
      <Label>{'\n'}The Archive</Label>
      <Button
        title="📚 Add pre-club albums"
        variant="ghost"
        onPress={() => router.push(`/club/${club.id}/archive`)}
      />

      {/* Streaming (owner only) */}
      {isOwner ? (
        <>
          <Label>{'\n'}Streaming</Label>
          <Button
            title="🎧 Connect Spotify & playlists"
            variant="ghost"
            onPress={() => router.push(`/club/${club.id}/streaming`)}
          />
        </>
      ) : null}

      {/* Invite */}
      <Label>{'\n'}Invite</Label>
      <Button
        title={rotated ? '✓ New link generated' : 'Generate a new invite link'}
        variant="ghost"
        onPress={rotate}
      />

      {/* Danger zone (owner only) */}
      {isOwner ? (
        <View style={{ marginTop: 24 }}>
          <Label>Danger zone</Label>
          <Button title="🗑 Delete this club" variant="danger" onPress={deleteClub} />
        </View>
      ) : null}
    </Screen>
  );
}

// Owner/admin-tunable points for the "Most Active" leaderboard. Stored on
// clubs.leaderboard_weights; the club_leaderboard RPC reads it. "Top Rated" and
// "Most Loved" are intentionally not weighted, so they aren't shown here.
function LeaderboardScoringCard({ club, onSaved }: { club: Club; onSaved: () => void }) {
  const { palette } = useTheme();
  const seed = (): LeaderboardWeights => ({
    ...DEFAULT_LEADERBOARD_WEIGHTS,
    ...((club.leaderboard_weights as Partial<LeaderboardWeights> | null) ?? {}),
  });
  const [weights, setWeights] = useState<LeaderboardWeights>(seed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setWeights(seed());
  }, [club.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField = (key: keyof LeaderboardWeights, text: string) =>
    setWeights((w) => ({ ...w, [key]: Math.min(99, parseInt(text.replace(/[^0-9]/g, ''), 10) || 0) }));

  const save = async () => {
    setSaving(true);
    await clubs.update(club.id, { leaderboard_weights: weights });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
    onSaved();
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <Label>Leaderboard scoring</Label>
      <Text style={[styles.limitDesc, { color: palette.text2, marginBottom: 6 }]}>
        Points each action is worth in the “Most Active” ranking.
      </Text>
      {WEIGHT_FIELDS.map((f) => (
        <View key={f.key} style={styles.weightRow}>
          <Text style={[styles.weightLabel, { color: palette.text1 }]}>{f.label}</Text>
          <TextField
            value={String(weights[f.key])}
            onChangeText={(t) => setField(f.key, t)}
            keyboardType="number-pad"
            maxLength={2}
            style={{ width: 64, textAlign: 'center' }}
          />
        </View>
      ))}
      <Button
        title="Reset to defaults"
        variant="ghost"
        onPress={() => setWeights({ ...DEFAULT_LEADERBOARD_WEIGHTS })}
        style={{ marginTop: 12 }}
      />
      <Button
        title={saved ? '✓ Saved' : 'Save scoring'}
        onPress={save}
        loading={saving}
        style={{ marginTop: 8 }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiOpt: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  limitDesc: { flex: 1, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  limitInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  limitUnit: { fontFamily: fonts.mono, fontSize: 11, marginTop: 6 },
  tzField: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tzValue: { fontFamily: fonts.sansMedium, fontSize: 14 },
  tzChevron: { fontFamily: fonts.monoMedium, fontSize: 11 },
  tzRow: { paddingVertical: 11, paddingHorizontal: 4 },
  tzRowText: { fontFamily: fonts.sansMedium, fontSize: 15 },
  weightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  weightLabel: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontFamily: fonts.sansBold, fontSize: 13, marginBottom: 2 },
  memberMeta: { fontFamily: fonts.mono, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8 },
});
