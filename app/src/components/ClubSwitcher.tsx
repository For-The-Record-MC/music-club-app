import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, BottomSheet, Label } from '@/components/ui';
import { useMyClubs } from '@/hooks/useMyClubs';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { useClubSwitcherStore } from '@/stores/clubSwitcherStore';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';
import { avatarColors, fonts, radius } from '@/theme';

const THEME_ICON: Record<ThemeMode, string> = { system: '🌗', dark: '🌙', light: '☀️' };
const THEME_LABEL: Record<ThemeMode, string> = { system: 'System', dark: 'Dark', light: 'Light' };

// The Home topbar's club-name trigger. Tapping opens a bottom sheet that lists
// your clubs (tap to switch), plus create/join and account actions. Folds in
// everything the old Clubs tab used to hold.
export function ClubSwitcher() {
  const { palette } = useTheme();
  const router = useRouter();
  const open = useClubSwitcherStore((s) => s.open);
  const setOpen = useClubSwitcherStore((s) => s.setOpen);

  const { rows } = useMyClubs();
  const clubId = useCurrentClubStore((s) => s.clubId);
  const setClub = useCurrentClubStore((s) => s.setClub);
  const signOut = useAuthStore((s) => s.signOut);
  const themeMode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);

  const current = rows.find((r) => r.club.id === clubId);

  const go = (path: Href) => {
    setOpen(false);
    router.push(path);
  };

  const switchTo = (id: string) => {
    setClub(id);
    setOpen(false);
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={{ flex: 1 }}>
        <Text style={[styles.eyebrow, { color: palette.text3 }]}>LISTENING CLUB</Text>
        <View style={styles.triggerRow}>
          <Text numberOfLines={1} style={[styles.title, { color: palette.text1 }]}>
            {current ? `${current.club.emoji} ${current.club.name}` : 'For The Record MC'}
          </Text>
          <Text style={[styles.chevron, { color: palette.text3 }]}>▾</Text>
        </View>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
          <Label>Your clubs</Label>
          {rows.map(({ club, role }, i) => {
            const isCurrent = club.id === clubId;
            const canManage = role !== 'member';
            return (
              <Pressable
                key={club.id}
                onPress={() => switchTo(club.id)}
                style={({ pressed }) => [
                  styles.clubRow,
                  {
                    backgroundColor: isCurrent ? palette.card2 : 'transparent',
                    borderColor: isCurrent ? palette.teal : 'transparent',
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.clubEmoji, { backgroundColor: avatarColors[i % 7].bg }]}>
                  <Text style={{ fontSize: 22 }}>{club.emoji}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[styles.clubName, { color: palette.text1 }]}>
                    {club.name}
                  </Text>
                  <Text style={[styles.clubMeta, { color: isCurrent ? palette.teal : palette.text3 }]}>
                    {isCurrent ? '● Current club' : 'Tap to switch'}
                  </Text>
                </View>
                {role !== 'member' ? (
                  <Badge
                    text={role}
                    color={role === 'owner' ? palette.teal : palette.purple}
                    bg={role === 'owner' ? palette.tealBg : palette.purpleBg}
                  />
                ) : null}
                {canManage ? (
                  <Pressable hitSlop={10} onPress={() => go(`/club/${club.id}/settings`)} style={styles.gear}>
                    <Text style={{ fontSize: 17 }}>⚙</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}

          <MenuRow icon="＋" label="Create a new club" onPress={() => go('/create-club')} />
          <MenuRow icon="↪" label="Join with invite code" onPress={() => go('/join')} />

          <View style={[styles.divider, { borderTopColor: palette.border }]} />

          <MenuRow icon="👤" label="Edit profile" onPress={() => go('/profile-setup')} />
          <MenuRow
            icon={THEME_ICON[themeMode]}
            label="Theme"
            trailing={THEME_LABEL[themeMode]}
            onPress={cycleMode}
          />
          <MenuRow icon="❓" label="How the club works" onPress={() => go('/how-it-works')} />
          <MenuRow icon="⤴" label="Sign out" tone="danger" onPress={() => { setOpen(false); signOut(); }} />
        </ScrollView>
      </BottomSheet>
    </>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  tone = 'default',
  onPress,
}: {
  icon: string;
  label: string;
  trailing?: string;
  tone?: 'default' | 'danger';
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const color = tone === 'danger' ? palette.coral : palette.text1;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: palette.card2 }]}
    >
      <Text style={[styles.menuIcon, { color }]}>{icon}</Text>
      <Text style={[styles.menuLabel, { color }]}>{label}</Text>
      {trailing ? <Text style={[styles.menuTrailing, { color: palette.text3 }]}>{trailing}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  triggerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: fonts.sansBold, fontSize: 19, flexShrink: 1 },
  chevron: { fontSize: 14, marginTop: 2 },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  clubEmoji: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubName: { fontFamily: fonts.sansBold, fontSize: 15, marginBottom: 2 },
  clubMeta: { fontFamily: fonts.mono, fontSize: 10 },
  gear: { paddingHorizontal: 4, paddingVertical: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 8 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  menuIcon: { fontSize: 17, width: 22, textAlign: 'center' },
  menuLabel: { fontFamily: fonts.sansMedium, fontSize: 15, flex: 1 },
  menuTrailing: { fontFamily: fonts.mono, fontSize: 12 },
});
