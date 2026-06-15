/**
 * Build script (R5): generate src/data/championsLegality.json.
 *
 * Run with:  npx vite-node scripts/buildChampionsLegality.ts
 *
 * What it does:
 *   1. Fetches the LIVE `champions` mod's formats-data.ts from the
 *      smogon/pokemon-showdown server repo (NOT @pkmn/dex/@pkmn/sim, which
 *      package only generation mods and don't have `champions` at all).
 *   2. Parses it (TS AST, see championsModParser.ts) into a per-species
 *      `{ isNonstandard?, tier? }` override map.
 *   3. Takes the SAME base species pool as buildIconHashes.ts (every real,
 *      battle-capable, non-CAP/Custom/Future/LGPE National Dex species — see
 *      that script's `legalSpecies()`), from @pkmn/dex's ungated `Dex.species`.
 *   4. Merges the champions override onto each species and derives Reg M-A
 *      legality (champions-standard tier, minus Mythical/Restricted Legendary
 *      per Flat Rules) via the shared `deriveLegality`.
 *   5. Writes the result to src/data/championsLegality.json.
 *
 * REGENERATE TRIGGER: this file is regulation-specific (unlike boxEmbeddings.json,
 * which is now decoupled from regulation entirely). Regenerate whenever the
 * active Champions regulation changes (e.g. the Reg M-A -> M-B cutover) by
 * re-running this script and committing the result.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dex } from '@pkmn/dex';
import { parseFormatsDataOverrides } from './championsModParser';
import {
  deriveLegality,
  type ChampionsLegalityEntry,
  type ChampionsLegalityTable,
} from '../src/lib/detection/championsLegality';
import { CURRENT_FORMAT } from '../src/shared/types';

const FORMATS_DATA_URL =
  'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/formats-data.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/data/championsLegality.json');

/**
 * Base species pool — kept in lock-step with buildBoxEmbeddings.ts's
 * species pool so every entry in boxEmbeddings.json has a corresponding
 * legality entry here (R5 "decoupled" architecture: the box-embedding table is
 * regulation-independent, this table is the regulation-specific layer on top).
 */
function basePool() {
  return Dex.species
    .all()
    .filter(
      (s) => s.num > 0 && !s.battleOnly && (s.isNonstandard === null || s.isNonstandard === 'Past'),
    );
}

async function fetchFormatsData(): Promise<string> {
  const res = await fetch(FORMATS_DATA_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${FORMATS_DATA_URL}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function main() {
  console.log(`[buildChampionsLegality] downloading ${FORMATS_DATA_URL} ...`);
  const source = await fetchFormatsData();
  const overrides = parseFormatsDataOverrides(source);
  console.log(`[buildChampionsLegality] parsed ${Object.keys(overrides).length} champions overrides`);

  const species = basePool();
  console.log(`[buildChampionsLegality] base species pool: ${species.length}`);

  const entries: ChampionsLegalityEntry[] = species.map((s) => deriveLegality(s, overrides[s.id]));
  const legalCount = entries.filter((e) => e.legal).length;
  console.log(`[buildChampionsLegality] legal: ${legalCount} / ${entries.length}`);

  const table: ChampionsLegalityTable = {
    format: CURRENT_FORMAT,
    generatedAt: new Date().toISOString(),
    source: FORMATS_DATA_URL,
    entries,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(table, null, 2) + '\n', 'utf8');
  console.log(`[buildChampionsLegality] wrote ${entries.length} entries -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[buildChampionsLegality] FAILED:', err);
  process.exit(1);
});
