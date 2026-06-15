/**
 * Persisted-backed settings store (plan §2, spec §6). Phase-0 stub: typed state
 * + hydrate + write-through. WS-E deepens capture/calibration parts.
 */
import { create } from 'zustand';
import type { NormalizedRect, Settings } from '../../shared/types';

interface SettingsState {
  settings: Settings;
  hydrated: boolean;
  /** Load persisted settings from disk via IPC (call once on boot). */
  hydrate: () => Promise<void>;
  /** Patch settings, write-through to disk. */
  update: (patch: Partial<Settings>) => Promise<void>;
  /** Persist the detection-screen calibration rects. */
  setCalibrationRegions: (regions: NormalizedRect[]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  hydrated: false,

  hydrate: async () => {
    const settings = await window.api.settings.load();
    set({ settings, hydrated: true });
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await window.api.settings.save(next);
  },

  setCalibrationRegions: async (regions) => {
    await get().update({ calibrationRegions: regions });
  },
}));
