import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, InlineNote, Label, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useClubData, type MemberRow } from '@/hooks/useClubData';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { clubEmojis, fonts, radius } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { clubMembers, clubs } from '@/utils/supabase/db';

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
  const [savingDetails, setSavingDetails] = useState(false);
  const [savedDetails, setSavedDetails] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState(false);

  useEffect(() => {
    if (!club) return;
    setName(club.name);
    setEmoji(club.emoji);
    const cap = club.song_limit_per_cycle;
    setLimitOn(cap != null);
    if (cap != null) setLimitText(String(cap));
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

        <Button
          title={savedDetails ? '✓ Saved' : 'Save changes'}
          onPress={saveDetails}
          loading={savingDetails}
          style={{ marginTop: 16 }}
        />
        {error ? <InlineNote text={error} tone="error" /> : null}
      </Card>

      {/* Members */}
      <Label>{'\n'}Members</Label>
      {members.map((m) => {
        const isMe = m.profile_id === userId;
        const canManage = !isMe && m.role !== 'owner' && (isOwner || m.role === 'member');
        return (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <View style={styles.memberRow}>
              <Avatar
                name={m.profiles?.display_name ?? null}
                colorIndex={m.profiles?.avatar_color ?? 0}
                size={38}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.memberName, { color: palette.text1 }]}>
                  {m.profiles?.display_name ?? '(no name yet)'} {isMe ? '· you' : ''}
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

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
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
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontFamily: fonts.sansBold, fontSize: 13, marginBottom: 2 },
  memberMeta: { fontFamily: fonts.mono, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8 },
});
