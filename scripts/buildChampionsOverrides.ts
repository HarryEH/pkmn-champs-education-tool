/**
 * Build script (R6): generate src/data/championsOverrides.json.
 *
 * Run with:  npx vite-node scripts/buildChampionsOverrides.ts
 *
 * What it does:
 *   1. Fetches the LIVE champions mod's items.ts / moves.ts / abilities.ts from
 *      smogon/pokemon-showdown.
 *   2. Parses each (TS AST, see championsModParser.ts) into an id -> { isNonstandard }
 *      delta map, keeping ONLY entries that set `isNonstandard` (string OR explicit
 *      null). Everything else is unaffected by the mod and resolved from vanilla
 *      @pkmn/dex at runtime, so it doesn't belong in this delta table.
 *   3. Writes all three maps to src/data/championsOverrides.json.
 *
 * `isNonstandard: null` (an explicit un-ban, e.g. Mega Stones) is preserved
 * distinctly from "absent" — see championsModParser.ts / championsOverrides.ts.
 *
 * REGENERATE TRIGGER: regulation-specific. Re-run on every regulation cutover,
 * alongside buildChampionsLegality.ts.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModOverrides } from './championsModParser';
import type {
  ChampionsOverrideEntry,
  ChampionsOverridesTable,
} from '../src/lib/legality/championsOverrides';
import { CURRENT_FORMAT } from '../src/shared/types';

const BASE = 'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions';
const SOURCES = {
  items: `${BASE}/items.ts`,
  moves: `${BASE}/moves.ts`,
  abilities: `${BASE}/abilities.ts`,
} as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/data/championsOverrides.json');

async function fetchSource(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Parse one mod data file and keep only entries that actually set
 * `isNonstandard` (the only field that affects legality). An entry like
 * `{ inherit: true, onDamage() {...} }` carries no legality delta and is dropped.
 */
function buildDelta(
  source: string,
  exportName: string,
): Record<string, ChampionsOverrideEntry> {
  const parsed = parseModOverrides(source, exportName, new Set(['isNonstandard'] as const));
  const delta: Record<string, ChampionsOverrideEntry> = {};
  for (const [id, entry] of Object.entries(parsed)) {
    if ('isNonstandard' in entry) {
      delta[id] = { isNonstandard: entry.isNonstandard };
    }
  }
  return delta;
}

async function main() {
  console.log(`[buildChampionsOverrides] downloading items/moves/abilities ...`);
  const [itemsSrc, movesSrc, abilitiesSrc] = await Promise.all([
    fetchSource(SOURCES.items),
    fetchSource(SOURCES.moves),
    fetchSource(SOURCES.abilities),
  ]);

  const items = buildDelta(itemsSrc, 'Items');
  const moves = buildDelta(movesSrc, 'Moves');
  const abilities = buildDelta(abilitiesSrc, 'Abilities');
  console.log(
    `[buildChampionsOverrides] deltas — items: ${Object.keys(items).length}, ` +
      `moves: ${Object.keys(moves).length}, abilities: ${Object.keys(abilities).length}`,
  );

  const table: ChampionsOverridesTable = {
    format: CURRENT_FORMAT,
    generatedAt: new Date().toISOString(),
    sources: SOURCES,
    items,
    moves,
    abilities,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(table, null, 2) + '\n', 'utf8');
  console.log(`[buildChampionsOverrides] wrote -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[buildChampionsOverrides] FAILED:', err);
  process.exit(1);
});
