import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ShowdownPanel } from '@/components/ShowdownPanel';
import { Loading, NoClubSelected, Screen } from '@/components/ui';
import { useCycle } from '@/hooks/useCycle';
import { useRefresh } from '@/hooks/useRefresh';
import { useTheme } from '@/hooks/use-theme';
import { useCurrentClubStore } from '@/stores/currentClubStore';
import { fonts } from '@/theme';

// The current club's Jukebox Showdown, reached from the Clubhouse hub. Renders
// the same ShowdownPanel the per-cycle deep-link screen uses, scoped to the
// club's open cycle.
export default function ClubhouseShowdown() {
  const id = useCurrentClubStore((s) => s.clubId) ?? undefined;
  const router = useRouter();
  const { palette } = useTheme();
  const { cycle, loading, refresh } = useCycle(id);
  const { refreshing, onRefresh } = useRefresh(refresh);

  if (!id) return <NoClubSelected what="showdown" />;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={[styles.back, { color: palette.text2 }]}>←</Text>
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: palette.text3 }]}>
            {cycle ? `CYCLE ${cycle.number}` : ''}
          </Text>
          <Text style={[styles.title, { color: palette.text1 }]}>🎵 Jukebox Showdown</Text>
        </View>
      </View>
      {loading ? <Loading /> : <ShowdownPanel cycle={cycle} cycleNumber={cycle?.number} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  back: { fontSize: 22, paddingHorizontal: 4 },
  eyebrow: { fontFamily: fonts.sansMedium, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 19 },
});
