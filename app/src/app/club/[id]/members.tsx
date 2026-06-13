import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, InlineNote, Label, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useClubData, type MemberRow } from '@/hooks/useClubData';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { clubMembers, clubs } from '@/utils/supabase/db';

// Member management. Permissions mirror the RLS policies:
// owner — promote/demote admins, remove anyone, rotate code, delete club.
// admin — remove plain members, rotate code.
// member — leave.
export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const clearClub = useCurrentClubStore((s) => s.setClub);
  const { club, members, myRole, refresh } = useClubData(id);
  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState(false);

  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'owner' || myRole === 'admin';

  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null);
    const { error: err } = await fn();
    if (err) setError(err.message);
    await refresh();
  };

  const toggleAdmin = (m: MemberRow) =>
    act(() => clubMembers.setRole(m.id, m.role === 'admin' ? 'member' : 'admin'));

  const removeMember = async (m: MemberRow) => {
    const name = m.profiles?.display_name ?? 'this member';
    if (await confirmAsync('Remove member', `Remove ${name} from the club?`)) {
      act(() => clubMembers.remove(m.id));
    }
  };

  const leave = async () => {
    if (!club) return;
    const me = members.find((m) => m.profile_id === userId);
    if (!me) return;
    if (await confirmAsync('Leave club', `Leave "${club.name}"?`)) {
      await clubMembers.remove(me.id);
      clearClub(null);
      router.replace('/');
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
          <Text style={[styles.title, { color: palette.text1 }]}>Members</Text>
        </View>
      </View>

      {members.map((m) => {
        const isMe = m.profile_id === userId;
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
            {!isMe && m.role !== 'owner' && (isOwner || (isAdmin && m.role === 'member')) ? (
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

      {error ? <InlineNote text={error} tone="error" /> : null}

      {isAdmin ? (
        <>
          <Label>{'\n'}Admin</Label>
          <Button title={rotated ? '✓ New link generated' : 'Generate a new invite link'} variant="ghost" onPress={rotate} />
        </>
      ) : null}

      <View style={{ marginTop: 24, gap: 8 }}>
        {!isOwner ? <Button title="Leave club" variant="danger" onPress={leave} /> : null}
        {isOwner ? <Button title="🗑 Delete this club" variant="danger" onPress={deleteClub} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberName: { fontFamily: fonts.sansBold, fontSize: 13, marginBottom: 2 },
  memberMeta: { fontFamily: fonts.mono, fontSize: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8 },
});
