import { useColorScheme } from 'react-native';

import { useThemeStore } from '@/stores/themeStore';
import { palettes, type Palette } from '@/theme';

// Resolves the active palette from the user's theme preference, falling back to
// the device color scheme when the preference is 'system'.
export function useTheme(): { palette: Palette; isDark: boolean } {
  const scheme = useColorScheme();
  const mode = useThemeStore((s) => s.mode);
  const isDark = mode === 'system' ? scheme !== 'light' : mode === 'dark';
  return { palette: isDark ? palettes.dark : palettes.light, isDark };
}
