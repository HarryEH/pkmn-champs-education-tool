/**
 * WS-B — Smogon usage data (renderer-side library).
 *
 * Fetches weighted moveset usage statistics from Smogon (via data.pkmn.cc, the
 * same backing store @pkmn/smogon uses) and shapes them into our `UsageData` /
 * `SpeciesUsage` contract (src/shared/types.ts).
 *
 * Caching is READ-THROUGH against the existing disk cache exposed on
 * `window.api.usage` (preload + main handlers already exist — see
 * src/main/ipc/persistence.ts). This module owns ONLY the network fetch +
 * shaping + cache orchestration; it never registers IPC handlers.
 *
 * Design notes:
 *  - `window` is accessed lazily inside functions (never at import time) so the
 *    module stays importable in a bare Node/vitest environment.
 *  - `monthKey()` accepts an injectable Date so tests are deterministic and the
 *    module never reads the wall clock at import time.
 *  - The data.pkmn.cc stats endpoint serves the *latest* report for a format;
 *    it is NOT month-addressable. The month string is therefore used only to
 *    label/partition OUR disk cache, not to address the remote endpoint.
 */
import { Smogon } from '@pkmn/smogon';
import type { DisplayUsageStatistics, LegacyDisplayUsageStatistics } from '@pkmn/smogon';
import { gen } from '../calc/gen';
import type { SpeciesUsage, UsageData, UsageEntry } from '../../shared/types';

/** Base host for Smogon-derived JSON. Mirrors @pkmn/smogon's internal `URL`. */
const DATA_HOST = 'https://data.pkmn.cc';

/**
 * Either flavour of the per-species usage record. The live data for
 * VGC/championsvgc formats is the *legacy* shape (has `spreads`, no top-level
 * `stats`); we tolerate both.
 */
type AnyUsageStats = DisplayUsageStatistics | LegacyDisplayUsageStatistics;

/** The top-level shape of a `stats/<format>.json` report. */
interface FormatStats {
  battles: number;
  pokemon: Record<string, AnyUsageStats>;
}

export interface FetchUsageOptions {
  /** Force a network re-fetch even when a same-month cache entry exists. */
  refresh?: boolean;
  /** Injectable clock for the cache month key (tests/determinism). */
  now?: Date;
  /**
   * Injectable fetch. Defaults to the global `fetch` (present in the Electron
   * renderer). Allows tests to run without network.
   */
  fetchImpl?: typeof fetch;
}

/**
 * The two-digit, zero-padded `YYYY-MM` key for a given date (defaults to now).
 * Used to partition the on-disk usage cache by calendar month.
 */
export function monthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

/** An empty-but-valid UsageData — returned when offline with no cache. */
function emptyUsage(format: string, month: string, now: Date): UsageData {
  return {
    format,
    month,
    fetchedAt: now.getTime(),
    species: {},
  };
}

/** Sort a `name → fraction` map into descending-usage UsageEntry[]. */
function toEntries(record: Record<string, number> | undefined): UsageEntry[] {
  if (!record) return [];
  return Object.entries(record)
    .map(([name, usage]) => ({ name, usage }))
    .sort((a, b) => b.usage - a.usage);
}

/** Read `spreads` (legacy) or fall back to `stats` (modern), whichever exists. */
function spreadsOf(stats: AnyUsageStats): Record<string, number> | undefined {
  if ('spreads' in stats && stats.spreads) return stats.spreads;
  if ('stats' in stats && stats.stats) return stats.stats;
  return undefined;
}

/** Shape one species' raw usage record into our SpeciesUsage. */
function shapeSpecies(speciesId: string, stats: AnyUsageStats): SpeciesUsage {
  return {
    speciesId,
    usage: stats.usage?.weighted,
    items: toEntries(stats.items),
    abilities: toEntries(stats.abilities),
    teraTypes: toEntries(stats.teraTypes),
    moves: toEntries(stats.moves),
    spreads: toEntries(spreadsOf(stats)),
  };
}

/** Shape a whole format report into our UsageData. */
function shapeFormat(report: FormatStats, format: string, month: string, now: Date): UsageData {
  const species: Record<string, SpeciesUsage> = {};
  for (const [name, stats] of Object.entries(report.pokemon ?? {})) {
    species[name] = shapeSpecies(name, stats);
  }
  return {
    format,
    month,
    fetchedAt: now.getTime(),
    species,
  };
}

/**
 * Reduce a format to the "base" form data.pkmn.cc serves, reusing the exact
 * same logic @pkmn/smogon applies internally. We initialise a throwaway Smogon
 * instance purely to verify the @pkmn/smogon fetch contract is wired (R4), but
 * its `baseFormat` is private — so we fetch the format report ourselves via the
 * documented host. The standard VGC series (gen9vgc20XX...) collapse to an
 * 11-char base; `gen9championsvgc2026regma` does NOT match that pattern and is
 * fetched verbatim.
 */
async function fetchFormatReport(format: string, fetchImpl: typeof fetch): Promise<FormatStats> {
  const res = await fetchImpl(`${DATA_HOST}/stats/${format}.json`);
  if (!res.ok) {
    throw new Error(`Smogon stats fetch failed: HTTP ${res.status} for ${format}`);
  }
  return (await res.json()) as FormatStats;
}

/** Lazily access the disk-cache bridge; null when no renderer window exists. */
function usageBridge(): Window['api']['usage'] | null {
  const w = typeof window !== 'undefined' ? window : (globalThis as { window?: Window }).window;
  return w?.api?.usage ?? null;
}

/**
 * Fetch usage statistics for a format, shaped into our `UsageData`.
 *
 * Read-through cache strategy:
 *   1. Compute the current month key (YYYY-MM).
 *   2. Unless `refresh`, ask the disk cache (`window.api.usage.read`). On hit,
 *      return it.
 *   3. On miss or `refresh`, fetch + shape from Smogon, persist via
 *      `window.api.usage.write`, and return.
 *   4. On network failure, fall back to any cached entry; otherwise return an
 *      empty-but-valid UsageData. Never throws on offline.
 *
 * `gen` is imported from the calc singleton only to keep this module tied to the
 * canonical data source; the format report is keyed by species name strings, so
 * no per-species resolution is required here.
 */
export async function fetchUsage(
  format: string,
  options: FetchUsageOptions = {},
): Promise<UsageData> {
  const now = options.now ?? new Date();
  const month = monthKey(now);
  const refresh = options.refresh ?? false;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  const bridge = usageBridge();

  // 1. Cache read (unless forced refresh).
  if (!refresh && bridge) {
    try {
      const cached = await bridge.read(format, month);
      if (cached) return cached;
    } catch {
      // Treat cache-read errors as a miss and fall through to network.
    }
  }

  // 2. Network fetch + shape + write-through.
  if (fetchImpl) {
    try {
      const report = await fetchFormatReport(format, fetchImpl);
      const shaped = shapeFormat(report, format, month, now);
      if (bridge) {
        try {
          await bridge.write(shaped);
        } catch {
          // Persisting is best-effort; still return fresh data on write failure.
        }
      }
      return shaped;
    } catch {
      // Network/parse failure — fall through to graceful degradation below.
    }
  }

  // 3. Offline / fetch failed: serve any cache (even on refresh), else empty.
  if (bridge) {
    try {
      const cached = await bridge.read(format, month);
      if (cached) return cached;
    } catch {
      // ignore
    }
  }
  return emptyUsage(format, month, now);
}

/**
 * Construct a @pkmn/smogon `Smogon` instance bound to a fetch implementation.
 * Exposed for callers/tests that want the per-species `stats()`/`sets()` API.
 * `fetchUsage` does not depend on this — it fetches the format report directly —
 * but this confirms the R4 wiring: `Smogon` needs a `(url) => { json() }` fetch,
 * which the renderer's native `fetch` satisfies.
 */
export function createSmogon(fetchImpl: typeof fetch = globalThis.fetch): Smogon {
  return new Smogon((url: string) => fetchImpl(url));
}

/** Re-exported for callers that want the calc-singleton gen alongside usage. */
export { gen };
