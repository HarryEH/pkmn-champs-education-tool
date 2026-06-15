/**
 * Lightweight routing (plan §2): a screen enum in a store, not React Router.
 * App.tsx switches on `screen`; screens can navigate programmatically.
 */
import { create } from 'zustand';

export type Screen = 'setup' | 'detection' | 'battle';

interface NavState {
  screen: Screen;
  go: (screen: Screen) => void;
}

export const useNavStore = create<NavState>((set) => ({
  screen: 'setup',
  go: (screen) => set({ screen }),
}));
