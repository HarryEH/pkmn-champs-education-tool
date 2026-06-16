import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUsage, monthKey, createSmogon } from '../usageData';
import type { UsageData } from '../../../shared/types';

const FORMAT = 'gen9championsvgc2026regma';

/** A normalized UsageData as MAIN now returns it: entries keyed by Showdown id. */
const MAIN_RESULT: UsageData = {
  format: FORMAT,
  month: '2026-06',
  fetchedAt: 1,
  species: {
    Incineroar: {
      speciesId: 'Incineroar',
      usage: 0.2593,
      items: [
        { name: 'sitrusberry', usage: 0.42 },
        { name: 'safetygoggles', usage: 0.21 },
      ],
      abilities: [{ name: 'intimidate', usage: 0.99 }],
      teraTypes: [],
      moves: [
        { name: 'fakeout', usage: 0.998 },
        { name: 'partingshot', usage: 0.96 },
      ],
      spreads: [{ name: 'Careful:252/0/0/4/252/0', usage: 0.037 }],
    },
  },
};

interface FakeBridge {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
  fetch: ReturnType<typeof vi.fn>;
}

function installBridge(result: UsageData = MAIN_RESULT): FakeBridge {
  const bridge: FakeBridge = {
    read: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    fetch: vi.fn(async () => result),
  };
  (globalThis as unknown as { window: { api: { usage: FakeBridge } } }).window = {
    api: { usage: bridge },
  };
  return bridge;
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe('monthKey', () => {
  it('formats an injected date as zero-padded YYYY-MM', () => {
    expect(monthKey(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06');
    expect(monthKey(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01');
    expect(monthKey(new Date('2025-12-31T23:00:00Z'))).toBe('2025-12');
  });

  it('does not throw without arguments (uses wall clock)', () => {
    expect(monthKey()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('fetchUsage', () => {
  it('delegates to the main IPC bridge and prettifies ids → display names', async () => {
    const bridge = installBridge();

    const data = await fetchUsage(FORMAT);

    expect(bridge.fetch).toHaveBeenCalledWith(FORMAT, { refresh: undefined });
    const inc = data.species.Incineroar;
    // Move/item/ability ids become display names; usage fractions are preserved.
    expect(inc.moves[0]).toEqual({ name: 'Fake Out', usage: 0.998 });
    expect(inc.items[0]).toEqual({ name: 'Sitrus Berry', usage: 0.42 });
    expect(inc.abilities[0]).toEqual({ name: 'Intimidate', usage: 0.99 });
    // Spreads + (empty) tera types pass through untouched.
    expect(inc.spreads[0]).toEqual({ name: 'Careful:252/0/0/4/252/0', usage: 0.037 });
    expect(inc.teraTypes).toEqual([]);
  });

  it('passes the refresh flag through to main', async () => {
    const bridge = installBridge();
    await fetchUsage(FORMAT, { refresh: true });
    expect(bridge.fetch).toHaveBeenCalledWith(FORMAT, { refresh: true });
  });

  it('unknown ids are left as-is rather than dropped', async () => {
    installBridge({
      ...MAIN_RESULT,
      species: {
        Incineroar: {
          ...MAIN_RESULT.species.Incineroar,
          moves: [{ name: 'madeupmove', usage: 0.5 }],
        },
      },
    });
    const data = await fetchUsage(FORMAT);
    expect(data.species.Incineroar.moves[0]).toEqual({ name: 'madeupmove', usage: 0.5 });
  });

  it('works without a window (no bridge) → empty-but-valid UsageData, no throw', async () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const data = await fetchUsage(FORMAT, { now });
    expect(data).toEqual({
      format: FORMAT,
      month: '2026-06',
      fetchedAt: now.getTime(),
      species: {},
    });
  });
});

describe('createSmogon', () => {
  it('constructs a Smogon instance from an injected fetch (R4 wiring)', () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const smogon = createSmogon(fetchImpl);
    expect(smogon).toBeDefined();
    expect(typeof smogon.stats).toBe('function');
  });
});
