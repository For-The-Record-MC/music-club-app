import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Card, Label, Screen } from '@/components/ui';
import { useMyClubs } from '@/hooks/useMyClubs';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/authStore';
import { fonts } from '@/theme';
import { notificationPrefs } from '@/utils/supabase/db';

// Default category state for a member with no preferences row yet — mirrors the
// notification_preferences table defaults (and the server's coalesce).
const DEFAULT_PREFS = { mentions: true, lifecycle: true, social: false, announcements: true };

type PrefKey = keyof typeof DEFAULT_PREFS;

const CATEGORIES: { key: PrefKey; label: string; help: string }[] = [
  { key: 'mentions', label: 'Mentions & your turn', help: '@-mentions and when the wheel lands on you.' },
  { key: 'lifecycle', label: 'Club happenings', help: 'Spins, albums, meetings, reveals, showdowns.' },
  { key: 'social', label: 'Feed & concerts', help: 'New music shares and concerts. Off by default.' },
  { key: 'announcements', label: 'Announcements', help: 'Messages from your club owner or admins.' },
];

// Per-user push preferences: four category switches + a per-club mute list.
// Reached from the account menu (ClubSwitcher). On web there's no push at all,
// so we say so up top but still let prefs/mute be set (they apply on mobile).
export default function NotificationsScreen() {
  const { palette } = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const { rows: clubRows } = useMyClubs();

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const [{ data: p }, { data: mutes }] = await Promise.all([
        notificationPrefs.get(userId),
        notificationPrefs.listMyMutes(userId),
      ]);
      if (p) setPrefs({ mentions: p.mentions, lifecycle: p.lifecycle, social: p.social, announcements: p.announcements });
      setMuted(Object.fromEntries((mutes ?? []).map((m: any) => [m.club_id, !!m.notifications_muted])));
      setLoading(false);
    })();
  }, [userId]);

  // Supabase builders are lazy — the request only fires when awaited, so these
  // must await (a bare call saves nothing). On failure, roll the switch back.
  const toggleCategory = async (key: PrefKey) => {
    if (!userId) return;
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic
    const { error } = await notificationPrefs.upsert(userId, next);
    if (error) {
      setPrefs(prev);
      Alert.alert('Could not save', error.message);
    }
  };

  const toggleMute = async (clubId: string) => {
    const nextMuted = !muted[clubId];
    setMuted((m) => ({ ...m, [clubId]: nextMuted })); // optimistic
    const { error } = await notificationPrefs.setMute(clubId, nextMuted);
    if (error) {
      setMuted((m) => ({ ...m, [clubId]: !nextMuted }));
      Alert.alert('Could not save', error.message);
    }
  };

  return (
    <Screen>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>YOUR ACCOUNT</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>Notifications</Text>
        </View>
      </View>

      {Platform.OS === 'web' ? (
        <Text style={[styles.webNote, { color: palette.text3 }]}>
          Push notifications arrive on the iOS app. These settings still apply there.
        </Text>
      ) : null}

      <Card>
        <Label>What to notify me about</Label>
        {CATEGORIES.map((c, i) => (
          <View
            key={c.key}
            style={[styles.row, i > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.rowLabel, { color: palette.text1 }]}>{c.label}</Text>
              <Text style={[styles.rowHelp, { color: palette.text3 }]}>{c.help}</Text>
            </View>
            <Switch
              value={prefs[c.key]}
              onValueChange={() => toggleCategory(c.key)}
              trackColor={{ true: palette.teal, false: palette.border2 }}
              disabled={loading}
            />
          </View>
        ))}
      </Card>

      {clubRows.length > 0 ? (
        <Card style={{ marginTop: 14 }}>
          <Label>Mute a club</Label>
          <Text style={[styles.rowHelp, { color: palette.text3, marginBottom: 4 }]}>
            Muting silences all push for that club, whatever the categories above say.
          </Text>
          {clubRows.map(({ club }, i) => (
            <View
              key={club.id}
              style={[styles.row, i > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }]}
            >
              <Text style={[styles.rowLabel, { color: palette.text1, flex: 1 }]} numberOfLines={1}>
                {club.emoji} {club.name}
              </Text>
              <Switch
                value={!!muted[club.id]}
                onValueChange={() => toggleMute(club.id)}
                trackColor={{ true: palette.coral, false: palette.border2 }}
                disabled={loading}
              />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  back: { fontSize: 26, fontFamily: fonts.sansMedium },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 22 },
  webNote: { fontFamily: fonts.mono, fontSize: 11, marginBottom: 14, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowLabel: { fontFamily: fonts.sansMedium, fontSize: 15 },
  rowHelp: { fontFamily: fonts.mono, fontSize: 11, marginTop: 3, lineHeight: 15 },
});
