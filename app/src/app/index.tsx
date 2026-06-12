import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Button, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useMyClubs } from '@/hooks/useMyClubs';
import { useAuthStore } from '@/stores/authStore';
import { avatarColors, fonts, radius } from '@/theme';

// The lobby: your clubs, create, join.
export default function Lobby() {
  const { palette } = useTheme();
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const { rows, loading } = useMyClubs();

  // First sign-in: get a display name before anything else.
  if (profile && !profile.display_name) {
    return <Redirect href="/profile-setup" />;
  }

  return (
    <Screen>
      <View style={styles.topbar}>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>YOUR CLUBS</Text>
          <Text style={[styles.wordmark, { color: palette.text1 }]}>Vinyl &amp; Vino</Text>
        </View>
        <Pressable onPress={() => router.push('/profile-setup')}>
          <Avatar
            name={profile?.display_name ?? null}
            colorIndex={profile?.avatar_color ?? 0}
            size={38}
          />
        </Pressable>
      </View>

      {!loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎵</Text>
          <Text style={[styles.emptyTitle, { color: palette.text1 }]}>No clubs yet</Text>
          <Text style={[styles.emptySub, { color: palette.text2 }]}>
            Create your first listening club, or join one with an invite link from a friend.
          </Text>
        </View>
      ) : null}

      {rows.map(({ club, role }, i) => (
        <Pressable
          key={club.id}
          onPress={() => router.push(`/club/${club.id}`)}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: palette.card,
              borderColor: pressed ? palette.border2 : palette.border,
            },
          ]}
        >
          <View style={[styles.tileEmoji, { backgroundColor: avatarColors[i % 7].bg }]}>
            <Text style={{ fontSize: 26 }}>{club.emoji}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.tileName, { color: palette.text1 }]}>{club.name}</Text>
            <Text style={[styles.tileMeta, { color: palette.text2 }]}>
              Joined {new Date(club.created_at).toLocaleDateString()}
            </Text>
          </View>
          {role !== 'member' ? (
            <Badge
              text={role}
              color={role === 'owner' ? palette.teal : palette.purple}
              bg={role === 'owner' ? palette.tealBg : palette.purpleBg}
            />
          ) : null}
          <Text style={[styles.tileArrow, { color: palette.text3 }]}>›</Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => router.push('/create-club')}
        style={({ pressed }) => [
          styles.newClub,
          { borderColor: pressed ? palette.teal : palette.border2 },
        ]}
      >
        <Text style={[styles.newClubText, { color: palette.text3 }]}>+ Create a new club</Text>
      </Pressable>

      <Button title="Join with an invite code" variant="ghost" onPress={() => router.push('/join')} style={{ marginTop: 10 }} />
      <Button title="Sign out" variant="ghost" onPress={signOut} style={{ marginTop: 24 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 2, marginBottom: 2 },
  wordmark: { fontFamily: fonts.sansBold, fontSize: 22 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontFamily: fonts.sansBold, fontSize: 20, marginBottom: 8 },
  emptySub: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  tileEmoji: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: { fontFamily: fonts.sansBold, fontSize: 16, marginBottom: 3 },
  tileMeta: { fontFamily: fonts.sans, fontSize: 12 },
  tileArrow: { fontSize: 20 },
  newClub: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.xl,
    padding: 16,
    alignItems: 'center',
  },
  newClubText: { fontFamily: fonts.sansMedium, fontSize: 14 },
});
