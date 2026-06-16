import { describe, expect, it, vi } from 'vitest';

// usage.ts (and persistence.ts) import from 'electron' at module load; stub it so
// the pure normalizer is importable in a bare Node/vitest context.
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => '/tmp' } }));

import { monthKey, normalizeChaos } from '../usage';

/**
 * Synthetic chaos slice. Every single-pick category (Items/Abilities/Spreads/
 * Tera Types) sums to the same weighted set total (200 here); move counts sum to
 * ~4× that. The normalizer must divide by that weight, NOT by `Raw count`.
 */
const REPORT = {
  info: { metagame: 'gen9championsvgc2026regma', cutoff: 1760 },
  data: {
    Incineroar: {
      'Raw count': 1_000_000,
      usage: 0.26,
      Abilities: { intimidate: 199, blaze: 1 },
      Items: { sitrusberry: 120, safetygoggles: 80 },
      'Tera Types': { nothing: 200 },
      Moves: { fakeout: 198, partingshot: 150, flareblitz: 100, knockoff: 0.5, ['junk']: 0.0001 },
      Spreads: { 'Careful:252/0/0/4/252/0': 120, 'Adamant:0/252/0/0/4/252': 80 },
    },
  },
};

describe('monthKey', () => {
  it('formats a date as zero-padded YYYY-MM', () => {
    expect(monthKey(new Date('2026-05-09T00:00:00Z'))).toBe('2026-05');
  });
});

describe('normalizeChaos', () => {
  const data = normalizeChaos(REPORT, 'gen9championsvgc2026regma', '2026-06', 42);
  const inc = data.species.Incineroar;

  it('carries format/month/fetchedAt and the species usage fraction', () => {
    expect(data.format).toBe('gen9championsvgc2026regma');
    expect(data.month).toBe('2026-06');
    expect(data.fetchedAt).toBe(42);
    expect(inc.usage).toBe(0.26);
  });

  it('divides counts by the weighted set total, not Raw count', () => {
    // 198 / 200 = 0.99 — would be ~0.0002 if it wrongly used Raw count.
    expect(inc.moves[0]).toEqual({ name: 'fakeout', usage: 0.99 });
    expect(inc.items[0]).toEqual({ name: 'sitrusberry', usage: 0.6 });
    expect(inc.abilities[0]).toEqual({ name: 'intimidate', usage: 0.995 });
  });

  it('sorts entries descending and drops sub-threshold noise', () => {
    expect(inc.moves.map((m) => m.name)).toEqual(['fakeout', 'partingshot', 'flareblitz']);
    // knockoff (0.01) and junk (~0) fall below MIN_USAGE and are dropped.
    expect(inc.moves.find((m) => m.name === 'knockoff')).toBeUndefined();
  });

  it('strips the "nothing" Tera entry (Champions has no Terastallization)', () => {
    expect(inc.teraTypes).toEqual([]);
  });

  it('keeps spread strings verbatim for downstream parsing', () => {
    expect(inc.spreads[0].name).toBe('Careful:252/0/0/4/252/0');
  });
});
