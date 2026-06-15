import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUsage, monthKey, createSmogon } from '../usageData';
import type { UsageData } from '../../../shared/types';

const FORMAT = 'gen9championsvgc2026regma';

/** Minimal slice of a real data.pkmn.cc stats report (legacy VGC shape). */
const RAW_REPORT = {
  battles: 554433,
  pokemon: {
    Incineroar: {
      usage: { raw: 0.33, real: 0.36, weighted: 0.3427 },
      abilities: { Intimidate: 0.9891, Blaze: 0.0109 },
      items: { 'Safety Goggles': 0.5925, 'Sitrus Berry': 0.1686 },
      teraTypes: { Ghost: 0.6927, Grass: 0.195 },
      moves: { 'Fake Out': 0.9862, 'Knock Off': 0.9638 },
      spreads: { 'Adamant:252/252/0/0/4/0': 0.0228, 'Careful:252/0/100/0/156/0': 0.0188 },
    },
    Gholdengo: {
      usage: { raw: 0.3, real: 0.31, weighted: 0.3 },
      abilities: { 'Good as Gold': 1 },
      items: { 'Choice Specs': 0.4, 'Life Orb': 0.2 },
      teraTypes: { Steel: 0.5, Flying: 0.3 },
      moves: { 'Make It Rain': 0.99, 'Shadow Ball': 0.95 },
      spreads: { 'Modest:4/0/0/252/0/252': 0.05 },
    },
  },
};

interface FakeBridge {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

/** Install a fake window.api.usage and return its (mock) bridge + store. */
function installBridge(): { bridge: FakeBridge; store: Map<string, UsageData> } {
  const store = new Map<string, UsageData>();
  const bridge: FakeBridge = {
    read: vi.fn(async (format: string, month: string) => store.get(`${format}-${month}`) ?? null),
    write: vi.fn(async (data: UsageData) => {
      store.set(`${data.format}-${data.month}`, data);
    }),
    clear: vi.fn(async () => {
      store.clear();
    }),
  };
  (globalThis as unknown as { window: { api: { usage: FakeBridge } } }).window = {
    api: { usage: bridge },
  };
  return { bridge, store };
}

function okFetch(body: unknown): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => body,
  })) as unknown as typeof fetch;
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
  const now = new Date('2026-06-15T00:00:00Z');

  it('cache miss → fetches, shapes, and writes through', async () => {
    const { bridge } = installBridge();
    const fetchImpl = okFetch(RAW_REPORT);

    const data = await fetchUsage(FORMAT, { now, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://data.pkmn.cc/stats/gen9championsvgc2026regma.json',
    );
    expect(bridge.read).toHaveBeenCalledWith(FORMAT, '2026-06');
    expect(bridge.write).toHaveBeenCalledTimes(1);

    expect(data.format).toBe(FORMAT);
    expect(data.month).toBe('2026-06');
    expect(Object.keys(data.species)).toEqual(['Incineroar', 'Gholdengo']);

    const inc = data.species.Incineroar;
    expect(inc.usage).toBe(0.3427);
    // Entries are sorted descending by usage.
    expect(inc.abilities[0]).toEqual({ name: 'Intimidate', usage: 0.9891 });
    expect(inc.items[0]).toEqual({ name: 'Safety Goggles', usage: 0.5925 });
    expect(inc.teraTypes[0]).toEqual({ name: 'Ghost', usage: 0.6927 });
    expect(inc.moves[0]).toEqual({ name: 'Fake Out', usage: 0.9862 });
    expect(inc.spreads[0]).toEqual({ name: 'Adamant:252/252/0/0/4/0', usage: 0.0228 });
  });

  it('second call → served from cache without a network hit', async () => {
    const { bridge } = installBridge();
    const fetchImpl = okFetch(RAW_REPORT);

    await fetchUsage(FORMAT, { now, fetchImpl });
    const fetchImpl2 = okFetch(RAW_REPORT);
    const second = await fetchUsage(FORMAT, { now, fetchImpl: fetchImpl2 });

    expect(fetchImpl2).not.toHaveBeenCalled();
    expect(second.species.Incineroar.usage).toBe(0.3427);
    // read called for the miss + the hit.
    expect(bridge.read).toHaveBeenCalledTimes(2);
    expect(bridge.write).toHaveBeenCalledTimes(1);
  });

  it('refresh=true → re-fetches even when cached', async () => {
    const { bridge } = installBridge();
    await fetchUsage(FORMAT, { now, fetchImpl: okFetch(RAW_REPORT) });

    const refreshed = { ...RAW_REPORT, pokemon: { Incineroar: RAW_REPORT.pokemon.Incineroar } };
    const fetchImpl2 = okFetch(refreshed);
    const data = await fetchUsage(FORMAT, { now, refresh: true, fetchImpl: fetchImpl2 });

    expect(fetchImpl2).toHaveBeenCalledTimes(1);
    expect(Object.keys(data.species)).toEqual(['Incineroar']);
    // Refresh writes the new report back to cache.
    expect(bridge.write).toHaveBeenCalledTimes(2);
  });

  it('offline with cache → returns the cached entry, no throw', async () => {
    const { store } = installBridge();
    const cached: UsageData = {
      format: FORMAT,
      month: '2026-06',
      fetchedAt: 123,
      species: {},
    };
    store.set(`${FORMAT}-2026-06`, cached);

    const failFetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const data = await fetchUsage(FORMAT, { now, fetchImpl: failFetch });
    expect(data).toBe(cached);
  });

  it('offline with no cache → empty-but-valid UsageData, no throw', async () => {
    installBridge();
    const failFetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const data = await fetchUsage(FORMAT, { now, fetchImpl: failFetch });
    expect(data).toEqual({
      format: FORMAT,
      month: '2026-06',
      fetchedAt: now.getTime(),
      species: {},
    });
  });

  it('HTTP error (e.g. 404) with no cache → empty-but-valid, no throw', async () => {
    installBridge();
    const notFound = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const data = await fetchUsage(FORMAT, { now, fetchImpl: notFound });
    expect(data.species).toEqual({});
    expect(data.format).toBe(FORMAT);
  });

  it('works without a window (no bridge) → fetches and returns, no throw', async () => {
    // No installBridge(): window is undefined.
    const fetchImpl = okFetch(RAW_REPORT);
    const data = await fetchUsage(FORMAT, { now, fetchImpl });
    expect(data.species.Incineroar.usage).toBe(0.3427);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
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
