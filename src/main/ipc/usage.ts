/**
 * Smogon usage fetch (MAIN process).
 *
 * The Champions format (`gen9championsvgc2026regma`) is published by Smogon on
 * its raw stats server (smogon.com/stats/<month>/chaos/<format>-<cutoff>.json)
 * but is NOT mirrored to the CORS-enabled data.pkmn.cc. smogon.com sends no
 * CORS headers, so the renderer (a Chromium context) cannot fetch it directly —
 * this is why the network call lives in main (Node, no same-origin policy).
 *
 * Responsibilities (the renderer's `lib/smogon/usageData.ts` is now a thin IPC
 * caller + cosmetic name prettifier):
 *   1. Resolve the latest available month + rating cutoff (HEAD-probe so we never
 *      download the wrong 7 MB file).
 *   2. Download the gzipped chaos JSON and gunzip it (3× smaller than the raw
 *      .json).
 *   3. Normalize the chaos shape ({info, data}, weighted *counts* under
 *      capitalized keys) into our `UsageData` (fractions, sorted, capped).
 *   4. Read-through the existing on-disk cache (cache/usage-<format>-<month>.json,
 *      shared with the persistence handlers).
 *
 * Never throws: degrades to cache, then to an empty-but-valid UsageData.
 */
import { ipcMain } from 'electron';
import { gunzipSync } from 'node:zlib';
import { IPC } from '../../shared/ipc';
import type { SpeciesUsage, UsageData, UsageEntry } from '../../shared/types';
import { readJson, usagePath, writeJson } from './persistence';

const STATS_HOST = 'https://www.smogon.com/stats';

/** Rating cutoffs to try, best signal first. 1760 = high ladder. */
const CUTOFFS = [1760, 1630, 1500, 0] as const;

/** How many months back to look for a published report. */
const MONTH_LOOKBACK = 12;

/**
 * Interim usage fallback chain: a regulation that just went live has no
 * published Smogon report yet, so fall back to the previous regulation's stats
 * so matchups/common sets still load. The requested format is always probed
 * FIRST, so this auto-upgrades the moment the new regulation's first report
 * lands — no code change needed. Reg M-B launched 2026-06-17; its first chaos
 * report publishes ~early July, after which the regma fallback goes unused.
 * The returned UsageData is stamped with the format it actually came from.
 */
const FALLBACK_FORMATS: Record<string, readonly string[]> = {
  gen9championsvgc2026regmb: ['gen9championsvgc2026regma'],
};

/** Keep the per-category lists small — the dashboard shows ≤6, in-battle ≤6. */
const ENTRY_CAP = 12;

/** Drop entries below this usage fraction (also strips negative-weight noise). */
const MIN_USAGE = 0.005;

/** One species' raw chaos record (weighted COUNTS, not fractions). */
interface ChaosSpecies {
  'Raw count'?: number;
  usage?: number;
  Abilities?: Record<string, number>;
  Items?: Record<string, number>;
  'Tera Types'?: Record<string, number>;
  Moves?: Record<string, number>;
  Spreads?: Record<string, number>;
}

interface ChaosReport {
  info?: { metagame?: string; cutoff?: number; 'number of battles'?: number };
  data?: Record<string, ChaosSpecies>;
}

/** `YYYY-MM` for a date (defaults to now) — the cache partition key. */
export function monthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

/** The N most recent `YYYY-MM` strings, newest first (for the lookback walk). */
function recentMonths(now: Date, count: number): string[] {
  const months: string[] = [];
  for (let i = 0; i < count; i++) {
    months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return months;
}

function emptyUsage(format: string, month: string, fetchedAt: number): UsageData {
  return { format, month, fetchedAt, species: {} };
}

/**
 * Turn a chaos count-map into sorted UsageEntry[] of fractions. `weight` is the
 * species' weighted set total (sum of any single-valued category, e.g. Items);
 * dividing move counts by it yields "fraction of sets carrying this move".
 */
function toEntries(
  record: Record<string, number> | undefined,
  weight: number,
  dropName?: (name: string) => boolean,
): UsageEntry[] {
  if (!record || weight <= 0) return [];
  return Object.entries(record)
    .map(([name, count]) => ({ name, usage: count / weight }))
    .filter((e) => e.usage >= MIN_USAGE && !(dropName?.(e.name) ?? false))
    .sort((a, b) => b.usage - a.usage)
    .slice(0, ENTRY_CAP);
}

/**
 * The weighted set total: every single-pick category (Items/Abilities/Spreads/
 * Tera) sums to it, so we take the largest such sum. NOTE: `Raw count` is the
 * *unweighted* battle count (orders of magnitude larger) and must NOT be mixed
 * into this max — it's only a last-resort fallback when no category has data.
 */
function setWeight(stats: ChaosSpecies): number {
  const sums = [stats.Items, stats.Abilities, stats.Spreads, stats['Tera Types']].map((r) =>
    r ? Object.values(r).reduce((a, b) => a + b, 0) : 0,
  );
  const weight = Math.max(...sums, 0);
  return weight > 0 ? weight : (stats['Raw count'] ?? 0);
}

function shapeSpecies(name: string, stats: ChaosSpecies): SpeciesUsage {
  const weight = setWeight(stats);
  return {
    speciesId: name,
    usage: stats.usage,
    items: toEntries(stats.Items, weight),
    abilities: toEntries(stats.Abilities, weight),
    // Champions revives Mega Evolution but has NO Terastallization, so the live
    // data is uniformly "nothing"; drop it so we never show a phantom Tera type.
    teraTypes: toEntries(stats['Tera Types'], weight, (n) => n.toLowerCase() === 'nothing'),
    moves: toEntries(stats.Moves, weight),
    spreads: toEntries(stats.Spreads, weight),
  };
}

/** Normalize a chaos report into our UsageData. Pure — exported for tests. */
export function normalizeChaos(
  report: ChaosReport,
  format: string,
  month: string,
  fetchedAt: number,
): UsageData {
  const species: Record<string, SpeciesUsage> = {};
  for (const [name, stats] of Object.entries(report.data ?? {})) {
    species[name] = shapeSpecies(name, stats);
  }
  return { format, month, fetchedAt, species };
}

function chaosUrl(month: string, format: string, cutoff: number): string {
  return `${STATS_HOST}/${month}/chaos/${format}-${cutoff}.json.gz`;
}

/**
 * Find + download the most recent published chaos report for a format, walking
 * months back and trying rating cutoffs high-first. HEAD-probes so only the one
 * matching file is downloaded. Returns the parsed report, or null if none found.
 */
async function downloadLatestChaos(
  format: string,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<ChaosReport | null> {
  for (const month of recentMonths(now, MONTH_LOOKBACK)) {
    for (const cutoff of CUTOFFS) {
      const url = chaosUrl(month, format, cutoff);
      try {
        const head = await fetchImpl(url, { method: 'HEAD' });
        if (!head.ok) continue;
        const res = await fetchImpl(url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        return JSON.parse(gunzipSync(buf).toString('utf8')) as ChaosReport;
      } catch {
        // Network/parse error on this candidate — try the next.
      }
    }
  }
  return null;
}

/** Core fetch-or-cache flow. Exposed (with injectable deps) for testing. */
export async function fetchUsageMain(
  format: string,
  options: { refresh?: boolean; now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<UsageData> {
  const now = options.now ?? new Date();
  const month = monthKey(now);
  const refresh = options.refresh ?? false;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  const cacheFile = usagePath(format, month);

  if (!refresh) {
    const cached = await readJson<UsageData | null>(cacheFile, null);
    if (cached) return cached;
  }

  if (fetchImpl) {
    // Probe the requested format first, then any interim fallbacks; the data is
    // stamped with whichever format actually produced it, but cached under the
    // requested format so it auto-refreshes when the real report appears.
    const candidates = [format, ...(FALLBACK_FORMATS[format] ?? [])];
    for (const candidate of candidates) {
      const report = await downloadLatestChaos(candidate, now, fetchImpl);
      if (report) {
        const data = normalizeChaos(report, candidate, month, now.getTime());
        try {
          await writeJson(cacheFile, data);
        } catch {
          // Persisting is best-effort.
        }
        return data;
      }
    }
  }

  // Network failed / no report: serve any cache (even on refresh), else empty.
  const cached = await readJson<UsageData | null>(cacheFile, null);
  return cached ?? emptyUsage(format, month, now.getTime());
}

export function registerUsageFetchHandler(): void {
  ipcMain.handle(
    IPC.usageFetch,
    async (_e, format: string, options?: { refresh?: boolean }): Promise<UsageData> => {
      return fetchUsageMain(format, { refresh: options?.refresh });
    },
  );
}
