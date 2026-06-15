import { describe, it, expect } from 'vitest';
import {
  HASH_MAX_BITS,
  NORMALIZE_SIZE,
  hammingDistance,
  hashImage,
  resampleNearest,
  type RgbaImage,
} from '../hash';
import { AUTO_ACCEPT_THRESHOLD, isAutoAcceptable, matchIcon, matchHash } from '../iconMatcher';
import type { IconHashEntry } from '../iconHashes';

/**
 * Build a tiny synthetic "icon": a solid-colour square with a distinguishing
 * block in one corner, so different colours produce different hashes.
 */
function makeIcon(
  size: number,
  base: [number, number, number],
  corner: [number, number, number],
): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inCorner = x < size / 2 && y < size / 2;
      const c = inCorner ? corner : base;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

describe('hash core parity', () => {
  it('produces a 64-char hex hash for 16-bit-side blockhash', () => {
    const icon = makeIcon(NORMALIZE_SIZE, [200, 50, 50], [10, 10, 200]);
    const h = hashImage(icon);
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it('hammingDistance is 0 for identical hashes and symmetric', () => {
    const a = makeIcon(NORMALIZE_SIZE, [200, 50, 50], [10, 10, 200]);
    const ha = hashImage(a);
    expect(hammingDistance(ha, ha)).toBe(0);
    const b = makeIcon(NORMALIZE_SIZE, [10, 200, 10], [200, 10, 10]);
    const hb = hashImage(b);
    expect(hammingDistance(ha, hb)).toBe(hammingDistance(hb, ha));
    expect(hammingDistance(ha, hb)).toBeGreaterThan(0);
  });

  it('returns max distance for mismatched-length hashes (fail safe)', () => {
    expect(hammingDistance('ff', 'ffff')).toBe(HASH_MAX_BITS);
  });
});

describe('matchIcon', () => {
  // DoD: synthesize a known icon, hash it, insert into a mock table, and assert
  // the matcher returns it as top-1 above the auto-accept threshold.
  it('returns the known icon as top-1 above AUTO_ACCEPT_THRESHOLD', () => {
    const target = makeIcon(NORMALIZE_SIZE, [220, 40, 40], [20, 20, 220]);
    const targetHash = hashImage(resampleNearest(target, NORMALIZE_SIZE));

    const distractorA = makeIcon(NORMALIZE_SIZE, [40, 220, 40], [220, 40, 40]);
    const distractorB = makeIcon(NORMALIZE_SIZE, [40, 40, 220], [220, 220, 40]);

    const table: IconHashEntry[] = [
      { speciesId: 'distractor-a', name: 'Distractor A', hash: hashImage(distractorA) },
      { speciesId: 'pikachu', name: 'Pikachu', hash: targetHash },
      { speciesId: 'distractor-b', name: 'Distractor B', hash: hashImage(distractorB) },
    ];

    const candidates = matchIcon(target, table, 3);

    expect(candidates).toHaveLength(3);
    expect(candidates[0].speciesId).toBe('pikachu');
    expect(candidates[0].confidence).toBe(1); // exact self-match
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(AUTO_ACCEPT_THRESHOLD);
    expect(isAutoAcceptable(candidates)).toBe(true);
    // Ranked best-first.
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(candidates[1].confidence);
    expect(candidates[1].confidence).toBeGreaterThanOrEqual(candidates[2].confidence);
  });

  it('matches a noisy / rescaled crop of the same icon above threshold', () => {
    // Build the table from a clean 32x32 icon, then query with a larger (64x64)
    // version of the same icon to exercise normalization on the query side.
    const clean = makeIcon(NORMALIZE_SIZE, [180, 60, 60], [30, 30, 180]);
    const table: IconHashEntry[] = [
      { speciesId: 'target', name: 'Target', hash: hashImage(clean) },
      {
        speciesId: 'other',
        name: 'Other',
        hash: hashImage(makeIcon(NORMALIZE_SIZE, [60, 180, 60], [180, 60, 60])),
      },
    ];
    const query = makeIcon(64, [180, 60, 60], [30, 30, 180]);
    const candidates = matchIcon(query, table, 2);
    expect(candidates[0].speciesId).toBe('target');
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(AUTO_ACCEPT_THRESHOLD);
  });

  it('isAutoAcceptable is false when best match is weak or table empty', () => {
    expect(isAutoAcceptable([])).toBe(false);
    expect(isAutoAcceptable([{ speciesId: 'x', confidence: 0.5 }])).toBe(false);
    expect(isAutoAcceptable([{ speciesId: 'x', confidence: 0.9 }])).toBe(true);
  });

  it('matchHash and matchIcon agree on confidences', () => {
    const icon = makeIcon(NORMALIZE_SIZE, [120, 120, 200], [200, 120, 120]);
    const h = hashImage(icon);
    const table: IconHashEntry[] = [{ speciesId: 'a', name: 'A', hash: h }];
    expect(matchHash(h, table)[0].confidence).toBe(matchIcon(icon, table)[0].confidence);
  });
});
