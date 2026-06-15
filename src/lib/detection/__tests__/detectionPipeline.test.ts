/**
 * Pipeline integration test (R7). Drives detectOpponentTeam over a synthetic frame
 * with an injected (stub) embedder and a tiny box-embedding table, so it stays
 * headless — the real CLIP model is exercised manually via `npm start` and gated
 * by the accuracy harness (detectionAccuracy.test.ts) on the real frame.
 */
import { describe, it, expect } from 'vitest';
import { EMBED_MODEL, type BoxEmbeddingTable } from '../boxEmbeddings';
import { PREPROC_VERSION } from '../embedPreproc';
import { detectOpponentTeam } from '../detectionPipeline';
import type { RgbaImage } from '../image';
import type { NormalizedRect } from '../../../shared/types';

/** Three orthogonal reference vectors → unambiguous, high-margin matches. */
function table(): BoxEmbeddingTable {
  return {
    model: EMBED_MODEL,
    preprocVersion: PREPROC_VERSION,
    dim: 3,
    mean: [0, 0, 0],
    generatedAt: '',
    entries: [
      { speciesId: 'aa', name: 'AA', vector: [1, 0, 0] },
      { speciesId: 'bb', name: 'BB', vector: [0, 1, 0] },
      { speciesId: 'cc', name: 'CC', vector: [0, 0, 1] },
    ],
  };
}

/** A 1x6 frame; each column is a distinct flat colour so crops differ. */
function frame(): RgbaImage {
  const colours: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ];
  const data = new Uint8ClampedArray(6 * 4);
  colours.forEach((c, i) => {
    data[i * 4] = c[0];
    data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = 255;
  });
  return { width: 6, height: 1, data };
}

const rects: NormalizedRect[] = Array.from({ length: 6 }, (_, i) => ({
  x: i / 6,
  y: 0,
  w: 1 / 6,
  h: 1,
}));

/** Stub embedder: map a crop's first pixel colour to a one-hot 3-vector. */
const stubEmbed = async (img: RgbaImage): Promise<number[]> => {
  const [r, g, b] = [img.data[0], img.data[1], img.data[2]];
  if (r >= g && r >= b) return [1, 0, 0];
  if (g >= r && g >= b) return [0, 1, 0];
  return [0, 0, 1];
};

describe('detectOpponentTeam (embedding path)', () => {
  it('detects all six slots and auto-accepts confident matches', async () => {
    const team = await detectOpponentTeam(frame(), rects, table(), {
      embed: stubEmbed,
      skipSegmentation: true,
      now: () => 1234,
    });
    expect(team.detectedAt).toBe(1234);
    expect(team.slots).toHaveLength(6);
    const expected = ['aa', 'bb', 'cc', 'aa', 'bb', 'cc'];
    team.slots.forEach((slot, i) => {
      expect(slot.candidates.length).toBeGreaterThan(0);
      expect(slot.candidates[0].speciesId).toBe(expected[i]);
      expect(slot.speciesId).toBe(expected[i]); // auto-accepted (high margin)
    });
  });

  it('leaves speciesId null when nothing clears the threshold', async () => {
    const team = await detectOpponentTeam(frame(), rects, table(), {
      embed: stubEmbed,
      skipSegmentation: true,
      autoAcceptThreshold: 1.01,
    });
    team.slots.forEach((slot) => {
      expect(slot.speciesId).toBeNull();
      expect(slot.candidates.length).toBeGreaterThan(0);
    });
  });

  it('restricts matches to the legal pool', async () => {
    const team = await detectOpponentTeam(frame(), rects, table(), {
      embed: stubEmbed,
      skipSegmentation: true,
      legalOnly: new Set(['bb', 'cc']),
    });
    team.slots.forEach((slot) => {
      expect(slot.candidates.every((c) => c.speciesId !== 'aa')).toBe(true);
    });
  });

  it('throws on a table built with an incompatible model', async () => {
    await expect(
      detectOpponentTeam(frame(), rects, { ...table(), model: 'nope' }, { embed: stubEmbed }),
    ).rejects.toThrow(/model/);
  });
});
