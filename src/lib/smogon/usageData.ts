/**
 * WS-B — Smogon usage data (renderer-side).
 *
 * The actual network fetch + chaos-shape normalization now lives in MAIN
 * (`src/main/ipc/usage.ts`), because the source — smogon.com's raw stats server —
 * sends no CORS headers and the renderer (Chromium) therefore cannot fetch it.
 * data.pkmn.cc (CORS-enabled) does NOT mirror the Champions format, so it isn't
 * an option here.
 *
 * This module is now a thin wrapper over `window.api.usage.fetch` plus a cosmetic
 * pass that turns the Showdown ids main returns (e.g. "fakeout", "mysticwater")
 * into display names ("Fake Out", "Mystic Water"). Prettifying lives here, not in
 * main, because it needs the `gen` dex — and main stays free of Pokémon data.
 * The prettified names round-trip fine through @smogon/calc, which re-normalizes.
 */
import { Smogon } from '@pkmn/smogon';
import { gen } from '../calc/gen';
import type { SpeciesUsage, UsageData, UsageEntry } from '../../shared/types';

export interface FetchUsageOptions {
  /** Force a network re-fetch even when a same-month cache entry exists. */
  refresh?: boolean;
  /** Injectable clock for the empty-fallback month key (tests/determinism). */
  now?: Date;
}

/**
 * The two-digit, zero-padded `YYYY-MM` key for a given date (defaults to now).
 * The real cache partitioning happens in main; this is kept for the no-bridge
 * (bare Node/test) empty-fallback path.
 */
export function monthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

/** An empty-but-valid UsageData — returned when no IPC bridge exists. */
function emptyUsage(format: string, month: string, now: Date): UsageData {
  return { format, month, fetchedAt: now.getTime(), species: {} };
}

/** Lazily access the usage IPC bridge; null when no renderer window exists. */
function usageBridge(): Window['api']['usage'] | null {
  const w = typeof window !== 'undefined' ? window : (globalThis as { window?: Window }).window;
  return w?.api?.usage ?? null;
}

/** Map move/item/ability ids → display names; leave unknown ids untouched. */
function prettify(entries: UsageEntry[], lookup: (id: string) => string | undefined): UsageEntry[] {
  return entries.map((e) => ({ ...e, name: lookup(e.name) ?? e.name }));
}

/** Prettify one species' id-keyed entries into display names. */
function prettifySpecies(s: SpeciesUsage): SpeciesUsage {
  return {
    ...s,
    items: prettify(s.items, (id) => gen.items.get(id)?.name),
    abilities: prettify(s.abilities, (id) => gen.abilities.get(id)?.name),
    moves: prettify(s.moves, (id) => gen.moves.get(id)?.name),
    // teraTypes are already capitalized type names; spreads stay verbatim.
  };
}

function prettifyUsage(data: UsageData): UsageData {
  const species: Record<string, SpeciesUsage> = {};
  for (const [key, value] of Object.entries(data.species)) {
    species[key] = prettifySpecies(value);
  }
  return { ...data, species };
}

/**
 * Fetch usage statistics for a format, shaped into our `UsageData`.
 *
 * Delegates to main over IPC (`window.api.usage.fetch`), which owns the network
 * fetch, normalization, and read-through disk cache. Never throws — main returns
 * an empty-but-valid UsageData on failure; with no bridge (bare Node) we return
 * the same.
 */
export async function fetchUsage(
  format: string,
  options: FetchUsageOptions = {},
): Promise<UsageData> {
  const bridge = usageBridge();
  if (bridge) {
    const data = await bridge.fetch(format, { refresh: options.refresh });
    return prettifyUsage(data);
  }
  const now = options.now ?? new Date();
  return emptyUsage(format, monthKey(now), now);
}

/**
 * Construct a @pkmn/smogon `Smogon` instance bound to a fetch implementation.
 * Retained for callers/tests that want the per-species `stats()`/`sets()` API.
 */
export function createSmogon(fetchImpl: typeof fetch = globalThis.fetch): Smogon {
  return new Smogon((url: string) => fetchImpl(url));
}

/** Re-exported for callers that want the calc-singleton gen alongside usage. */
export { gen };
