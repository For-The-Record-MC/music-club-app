import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useThemeStore, type ThemeMode } from '@/stores/themeStore';

const ICON: Record<ThemeMode, string> = { system: '🌗', dark: '🌙', light: '☀️' };

// Tap to cycle system → dark → light. Mirrors the MVP's theme button.
export function ThemeToggle() {
  const { palette } = useTheme();
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);
  return (
    <Pressable
      onPress={cycleMode}
      style={[styles.btn, { borderColor: palette.border, backgroundColor: palette.card }]}
      accessibilityLabel={`Theme: ${mode}`}
    >
      <Text style={{ fontSize: 16 }}>{ICON[mode]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
