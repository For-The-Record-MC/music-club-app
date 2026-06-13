import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type ThemeMode = 'system' | 'dark' | 'light';

const KEY = 'vv_theme_mode';
const ORDER: ThemeMode[] = ['system', 'dark', 'light'];

interface ThemeStore {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  cycleMode: () => void;
  hydrate: () => void;
}

// Per-user theme override (the MVP's moon/sun toggle). Defaults to 'system' so
// first paint matches the device before the stored value hydrates.
export const useThemeStore = create<ThemeStore>((set, get) => ({
  mode: 'system',
  setMode: (mode) => {
    set({ mode });
    AsyncStorage.setItem(KEY, mode).catch(() => {});
  },
  cycleMode: () => {
    const next = ORDER[(ORDER.indexOf(get().mode) + 1) % ORDER.length];
    get().setMode(next);
  },
  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      if (v === 'dark' || v === 'light' || v === 'system') set({ mode: v });
    } catch {
      // ignore — fall back to 'system'
    }
  },
}));
