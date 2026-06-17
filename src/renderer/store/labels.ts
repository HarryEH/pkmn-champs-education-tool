/**
 * Label-as-you-go store (persisted via window.api.labels). Accumulates confirmed
 * (crop → species) detection exemplars that the matcher folds back in as few-shot
 * references (see exemplars.ts) and that we can later use to tune thresholds + grow
 * the regression set. Hydrated once on boot like teams/settings.
 */
import { create } from 'zustand';
import type { DetectionLabel } from '../../shared/types';

interface LabelsState {
  labels: DetectionLabel[];
  hydrated: boolean;
  /** Load persisted labels from disk via IPC (call once on boot). */
  hydrate: () => Promise<void>;
  /** Append a captured exemplar, write-through to disk. */
  addLabel: (label: DetectionLabel) => Promise<void>;
  /** Delete every captured exemplar. */
  clear: () => Promise<void>;
}

export const useLabelsStore = create<LabelsState>((set) => ({
  labels: [],
  hydrated: false,

  hydrate: async () => {
    const labels = await window.api.labels.load();
    set({ labels, hydrated: true });
  },

  addLabel: async (label) => {
    set((s) => ({ labels: [...s.labels, label] }));
    await window.api.labels.append(label);
  },

  clear: async () => {
    set({ labels: [] });
    await window.api.labels.clear();
  },
}));
