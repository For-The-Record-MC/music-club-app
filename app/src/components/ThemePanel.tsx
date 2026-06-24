import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { fonts, radius } from '@/theme';

// The Jukebox Showdown theme banner — a slot-machine-style label panel echoing
// the "Musical Impressions Generator" look. Used as the standard theme display
// on the Showdown view, the Home card, pick-albums, and History.
export function ThemePanel({
  theme,
  subtitle,
  compact,
}: {
  theme: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: palette.purpleBg, borderColor: palette.purple }]}>
      <Text style={[styles.eyebrow, { color: palette.purple }]}>🎵 JUKEBOX SHOWDOWN</Text>
      <View style={[styles.slot, { backgroundColor: palette.surface, borderColor: palette.purple }, compact && styles.slotCompact]}>
        <Text style={[styles.theme, { color: palette.text1 }, compact && styles.themeCompact]} numberOfLines={compact ? 1 : 3}>
          {theme}
        </Text>
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: palette.text3 }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: 14, gap: 8 },
  eyebrow: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  slot: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingVertical: 16, paddingHorizontal: 14, alignItems: 'center' },
  slotCompact: { paddingVertical: 10 },
  theme: { fontFamily: fonts.sansBold, fontSize: 20, textAlign: 'center', lineHeight: 26 },
  themeCompact: { fontSize: 15, lineHeight: 20 },
  subtitle: { fontFamily: fonts.mono, fontSize: 11, textAlign: 'center' },
});
