import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Pressable, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useClubData } from '@/hooks/useClubData';
import { useAuthStore } from '@/stores/authStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts } from '@/theme';
import { confirmAsync } from '@/utils/confirm';
import { clubMembers } from '@/utils/supabase/db';

// The club roster — visible to every member (reached from the home avatar stack).
// Read-only here: role changes, removals, invite rotation and club settings all
// live on the owner/admin-only Club settings screen. Non-owners can leave.
export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const clearClub = useCurrentClubStore((s) => s.setClub);
  const { club, members, myRole } = useClubData(id);

  const isOwner = myRole === 'owner';
  const isAdmin = myRole === 'owner' || myRole === 'admin';

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

      {isAdmin ? (
        <Button
          title="⚙ Club settings"
          variant="ghost"
          onPress={() => router.push(`/club/${club.id}/settings`)}
          style={{ marginBottom: 14 }}
        />
      ) : null}

      {members.map((m) => {
        const isMe = m.profile_id === userId;
        return (
          <Card key={m.id} style={{ marginBottom: 8 }}>
            <View style={styles.memberRow}>
              <Avatar
                name={m.profiles?.display_name ?? null}
                colorIndex={m.profiles?.avatar_color ?? 0}
                imageUrl={m.profiles?.avatar_url}
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
          </Card>
        );
      })}

      {!isOwner ? (
        <Button title="Leave club" variant="danger" onPress={leave} style={{ marginTop: 24 }} />
      ) : null}
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
});
