import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'vv_seen_how_it_works';

// Tracks whether this device has seen the "How it works" walkthrough. The Home
// tab auto-opens it once the first time a member lands on a club, so new
// joiners get the tour without anyone having to point them to the menu.
interface OnboardingStore {
  seenHowItWorks: boolean;
  hydrated: boolean;
  markSeen: () => void;
  hydrate: () => void;
}

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  seenHowItWorks: false,
  hydrated: false,
  markSeen: () => {
    if (get().seenHowItWorks) return;
    set({ seenHowItWorks: true });
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  },
  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      set({ seenHowItWorks: v === '1', hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
