import { create } from 'zustand';

// Open-state for the Home club-switcher sheet. Lifted out of the ClubSwitcher
// component so the tab bar can reopen it when you tap Home while already on Home.
interface ClubSwitcherStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useClubSwitcherStore = create<ClubSwitcherStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
