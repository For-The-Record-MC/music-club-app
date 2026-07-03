import { create } from 'zustand';

import { clearDataCaches } from '@/utils/dataCache';
import { supabase } from '@/utils/supabase/client';
import { profiles, type Profile } from '@/utils/supabase/db';

interface AuthStore {
  userId: string | null;
  profile: Profile | null;
  isHydrated: boolean;
  hydrate: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

let listenerAttached = false;

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await profiles.getById(userId);
  return data ?? null;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  userId: null,
  profile: null,
  isHydrated: false,

  hydrate: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      set({
        userId: session.user.id,
        profile: await fetchProfile(session.user.id),
        isHydrated: true,
      });
    } else {
      set({ isHydrated: true });
    }

    if (!listenerAttached) {
      listenerAttached = true;
      supabase.auth.onAuthStateChange(async (_event, s) => {
        if (s?.user) {
          if (s.user.id !== get().userId) {
            set({ userId: s.user.id, profile: await fetchProfile(s.user.id) });
          }
        } else {
          set({ userId: null, profile: null });
        }
      });
    }
  },

  refreshProfile: async () => {
    const userId = get().userId;
    if (userId) set({ profile: await fetchProfile(userId) });
  },

  // Clear state immediately rather than waiting on the SIGNED_OUT event,
  // which is unreliable in React Native.
  signOut: async () => {
    set({ userId: null, profile: null });
    clearDataCaches();
    await supabase.auth.signOut();
  },
}));
