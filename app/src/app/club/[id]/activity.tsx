import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Card, InlineNote, Screen } from '@/components/ui';
import { useActivity } from '@/hooks/useActivity';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { renderActivity, timeAgo } from '@/utils/activityTemplates';
import { fonts } from '@/theme';

// Activity ("what's been happening") — reached from the bell in the Home topbar
// (no longer a bottom tab; History took that slot). Opening it marks all events
// read, clearing the unread bell.
export default function Activity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const router = useRouter();
  const { events, markRead, refresh } = useActivity(id);
  const { refreshing, onRefresh } = useRefresh(refresh);

  useEffect(() => {
    if (id) markRead();
  }, [markRead, id]);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>WHAT'S BEEN HAPPENING</Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🔔 Activity</Text>
        </View>
      </View>

      {events.length === 0 ? (
        <InlineNote text="Nothing yet — spins, albums, reveals, posts and concerts show up here." />
      ) : (
        <Card>
          {events.map((e) => {
            const r = renderActivity(e, e.profiles?.display_name ?? null);
            return (
              <Pressable
                key={e.id}
                onPress={r.target ? () => router.push(r.target as never) : undefined}
                disabled={!r.target}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: palette.border },
                  pressed && r.target ? { opacity: 0.6 } : null,
                ]}
              >
                {e.profiles ? (
                  <View style={styles.avatarWrap}>
                    <Avatar
                      name={e.profiles.display_name}
                      colorIndex={e.profiles.avatar_color}
                      imageUrl={e.profiles.avatar_url}
                      size={36}
                    />
                    <View
                      style={[
                        styles.emojiBadge,
                        { backgroundColor: palette.surface, borderColor: palette.border },
                      ]}
                    >
                      <Text style={styles.emojiBadgeText}>{r.icon}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.icon}>{r.icon}</Text>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.text, { color: palette.text1 }]}>{r.text}</Text>
                  <Text style={[styles.time, { color: palette.text3 }]}>{timeAgo(e.created_at)}</Text>
                </View>
                {r.target ? <Text style={[styles.chevron, { color: palette.text3 }]}>›</Text> : null}
              </Pressable>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { fontSize: 18, width: 24, textAlign: 'center' },
  avatarWrap: { width: 36, height: 36 },
  emojiBadge: {
    position: 'absolute',
    bottom: -3,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  emojiBadgeText: { fontSize: 10, lineHeight: 14, textAlign: 'center' },
  chevron: { fontFamily: fonts.sans, fontSize: 20 },
  text: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  time: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
});
