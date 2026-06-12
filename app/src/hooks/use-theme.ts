import { useColorScheme } from 'react-native';

import { palettes, type Palette } from '@/theme';

// Follows the device/browser color scheme. A per-user override (like the MVP's
// moon/sun toggle) can be layered on later via a preference store.
export function useTheme(): { palette: Palette; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { palette: isDark ? palettes.dark : palettes.light, isDark };
}
