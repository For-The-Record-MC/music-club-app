import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const KEY = 'vv_current_club';

// The selected club for the tab UI. Club screens read this instead of a route
// param now that they live under persistent bottom tabs. Persisted so reopening
// the app lands you back in your last club.
interface CurrentClubStore {
  clubId: string | null;
  hydrated: boolean;
  setClub: (id: string | null) => void;
  hydrate: () => void;
}

export const useCurrentClubStore = create<CurrentClubStore>((set) => ({
  clubId: null,
  hydrated: false,
  setClub: (id) => {
    set({ clubId: id });
    if (id) AsyncStorage.setItem(KEY, id).catch(() => {});
    else AsyncStorage.removeItem(KEY).catch(() => {});
  },
  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      set({ clubId: v ?? null, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
