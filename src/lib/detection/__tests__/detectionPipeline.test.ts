import { describe, it, expect } from 'vitest';
import {
  hashImage,
  resampleNearest,
  NORMALIZE_SIZE,
  HASH_BITS_SIDE,
  type RgbaImage,
} from '../hash';
import type { IconHashEntry, IconHashTable } from '../iconHashes';
import { detectOpponentTeam } from '../detectionPipeline';
import type { NormalizedRect } from '../../../shared/types';

/**
 * A synthetic icon with real spatial structure: a base colour plus a block in a
 * per-icon quadrant. Perceptual hashes need spatial variation to be distinctive
 * (a uniformly-coloured square hashes to a near-degenerate value), so each fake
 * icon's quadrant index makes its hash unique — the way distinct real icons do.
 */
function structuredIcon(size: number, rgb: [number, number, number], quadrant: number): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  const half = size / 2;
  const qx = quadrant % 2;
  const qy = Math.floor(quadrant / 2) % 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inBlock = Math.floor(x / half) === qx && Math.floor(y / half) === qy;
      // The block is a darkened version of the base, giving each icon a unique
      // low/high luminance pattern blockhash can latch onto.
      const f = inBlock ? 0.2 : 1;
      data[i] = rgb[0] * f;
      data[i + 1] = rgb[1] * f;
      data[i + 2] = rgb[2] * f;
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/** Place six distinct icons side by side into one frame. */
function makeFrame(icons: RgbaImage[]): RgbaImage {
  const iconW = icons[0].width;
  const iconH = icons[0].height;
  const width = iconW * icons.length;
  const height = iconH;
  const data = new Uint8ClampedArray(width * height * 4);
  icons.forEach((icon, idx) => {
    const xOff = idx * iconW;
    for (let y = 0; y < iconH; y++) {
      for (let x = 0; x < iconW; x++) {
        const si = (y * iconW + x) * 4;
        const di = (y * width + xOff + x) * 4;
        data[di] = icon.data[si];
        data[di + 1] = icon.data[si + 1];
        data[di + 2] = icon.data[si + 2];
        data[di + 3] = icon.data[si + 3];
      }
    }
  });
  return { width, height, data };
}

describe('detectOpponentTeam', () => {
  const palette: [number, number, number][] = [
    [220, 40, 40],
    [40, 220, 40],
    [40, 40, 220],
    [220, 220, 40],
    [220, 40, 220],
    [40, 220, 220],
  ];
  const speciesIds = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff'];

  function buildTable(): IconHashTable {
    const entries: IconHashEntry[] = palette.map((rgb, i) => ({
      speciesId: speciesIds[i],
      name: speciesIds[i].toUpperCase(),
      hash: hashImage(resampleNearest(structuredIcon(40, rgb, i), NORMALIZE_SIZE)),
    }));
    return {
      format: 'gen9championsvgc2026regma',
      generatedAt: '2026-06-15T00:00:00.000Z',
      hashBitsSide: HASH_BITS_SIDE,
      normalizeSize: NORMALIZE_SIZE,
      spriteSheetUrl: 'test',
      entries,
    };
  }

  it('detects all six slots and auto-accepts confident matches', () => {
    const icons = palette.map((rgb, i) => structuredIcon(40, rgb, i));
    const frame = makeFrame(icons);
    const rects: NormalizedRect[] = palette.map((_, i) => ({
      x: i / 6,
      y: 0,
      w: 1 / 6,
      h: 1,
    }));

    const team = detectOpponentTeam(frame, rects, buildTable(), { now: () => 1234 });

    expect(team.detectedAt).toBe(1234);
    expect(team.slots).toHaveLength(6);
    team.slots.forEach((slot, i) => {
      expect(slot.candidates.length).toBeGreaterThan(0);
      expect(slot.candidates[0].speciesId).toBe(speciesIds[i]);
      expect(slot.speciesId).toBe(speciesIds[i]); // auto-accepted
    });
  });

  it('leaves speciesId null when no candidate clears the threshold', () => {
    const icons = palette.map((rgb, i) => structuredIcon(40, rgb, i));
    const frame = makeFrame(icons);
    const rects: NormalizedRect[] = palette.map((_, i) => ({ x: i / 6, y: 0, w: 1 / 6, h: 1 }));

    // Impossible threshold -> nothing auto-accepts, but candidates still populated.
    const team = detectOpponentTeam(frame, rects, buildTable(), { autoAcceptThreshold: 1.01 });
    team.slots.forEach((slot) => {
      expect(slot.speciesId).toBeNull();
      expect(slot.candidates.length).toBeGreaterThan(0);
    });
  });

  it('throws on a table built with incompatible hashing params', () => {
    const bad = { ...buildTable(), hashBitsSide: 8 };
    expect(() =>
      detectOpponentTeam(makeFrame(palette.map((c, i) => structuredIcon(40, c, i))), [], bad),
    ).toThrow(/incompatible/);
  });
});
