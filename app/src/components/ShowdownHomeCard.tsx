import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemePanel } from '@/components/ThemePanel';
import { Label } from '@/components/ui';
import { useShowdown } from '@/hooks/useShowdown';
import { useTheme } from '@/hooks/use-theme';
import { fonts } from '@/theme';

// Compact Home surface for the current cycle's Jukebox Showdown. Renders nothing
// until a theme is set; tapping deep-links to the Feed's Showdown segment.
export function ShowdownHomeCard({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const { palette } = useTheme();
  const { view } = useShowdown(cycleId);

  if (!view) return null;

  const sub = view.revealed
    ? 'Results are in — see who won'
    : `${view.submission_count} song${view.submission_count === 1 ? '' : 's'} in · tap to submit & vote`;

  return (
    <View style={{ marginBottom: 12 }}>
      <Label>Jukebox Showdown</Label>
      <Pressable
        onPress={() => router.push({ pathname: '/clubhouse/showdown' })}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <ThemePanel theme={view.theme_text} compact />
        <Text style={[styles.sub, { color: palette.text3 }]}>{sub} ›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: fonts.mono, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
