import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, InlineNote, Screen } from '@/components/ui';
import { useActivity } from '@/hooks/useActivity';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { renderActivity, timeAgo } from '@/utils/activityTemplates';
import { fonts } from '@/theme';

// The club activity feed ("what's been happening"). Opening it marks all
// events read, clearing the home-screen bell badge.
export default function Activity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const { events, markRead, refresh } = useActivity(id);
  const { refreshing, onRefresh } = useRefresh(refresh);

  useEffect(() => {
    markRead();
  }, [markRead]);

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
              <View key={e.id} style={[styles.row, { borderBottomColor: palette.border }]}>
                <Text style={styles.icon}>{r.icon}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.text, { color: palette.text1 }]}>{r.text}</Text>
                  <Text style={[styles.time, { color: palette.text3 }]}>{timeAgo(e.created_at)}</Text>
                </View>
              </View>
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
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  icon: { fontSize: 18, width: 24, textAlign: 'center' },
  text: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  time: { fontFamily: fonts.mono, fontSize: 10, marginTop: 2 },
});
