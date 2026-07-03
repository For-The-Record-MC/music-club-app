import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ShowdownPanel } from '@/components/ShowdownPanel';
import { Screen } from '@/components/ui';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { cycles as cyclesDb, type Cycle } from '@/utils/supabase/db';
import { fonts } from '@/theme';

// Dedicated Jukebox Showdown screen for one cycle — the deep-link / notification
// target. Renders the same ShowdownPanel the Feed segment uses.
export default function ShowdownScreen() {
  const { cycleId } = useLocalSearchParams<{ id: string; cycleId: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const [cycle, setCycle] = useState<Cycle | null>(null);

  const load = useCallback(async () => {
    if (!cycleId) return;
    const { data } = await cyclesDb.get(cycleId);
    setCycle(data ?? null);
  }, [cycleId]);

  useEffect(() => {
    load();
  }, [load]);
  const { refreshing, onRefresh } = useRefresh(load);

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>
            {cycle ? `CYCLE ${cycle.number}` : ''}
          </Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎵 Jukebox Showdown</Text>
        </View>
      </View>
      <ShowdownPanel cycle={cycle} cycleNumber={cycle?.number} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
});
