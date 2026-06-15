/**
 * Build script (R6): generate src/data/championsLearnsets.json.
 *
 * Run with:  npx vite-node scripts/buildChampionsLearnsets.ts
 *
 * What it does:
 *   1. Fetches the LIVE champions mod's learnsets.ts from smogon/pokemon-showdown
 *      and parses it (TS AST, see championsModParser.ts) into id -> [moveId].
 *   2. Takes the same base species pool as the other build scripts
 *      (championsSpeciesPool.ts).
 *   3. For every species, resolves its full champions movepool: the champions
 *      learnset if the mod lists it, else @pkmn/data's vanilla learnset; then
 *      UNIONs the (recursively-resolved) movepools of its pre-evolution chain,
 *      because Showdown learnsets store only own-level moves and the validator
 *      walks `prevo` for inherited moves.
 *   4. Writes the prevo-merged, sorted movepools to src/data/championsLearnsets.json.
 *
 * Baked at build time because @pkmn/data's learnset API is async and the
 * renderer's parsePokepaste must stay synchronous — see championsLearnsets.ts.
 *
 * REGENERATE TRIGGER: regulation-specific. Re-run on every regulation cutover.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import { parseModLearnsets } from './championsModParser';
import { championsSpeciesPool } from './championsSpeciesPool';
import type { ChampionsLearnsetsTable } from '../src/lib/legality/championsLearnsets';
import { CURRENT_FORMAT } from '../src/shared/types';

const LEARNSETS_URL =
  'https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions/learnsets.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/data/championsLearnsets.json');

const gens = new Generations(Dex);
const gen = gens.get(9);

async function fetchLearnsets(): Promise<string> {
  const res = await fetch(LEARNSETS_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${LEARNSETS_URL}: ${res.status} ${res.statusText}`);
  return res.text();
}

async function main() {
  console.log(`[buildChampionsLearnsets] downloading ${LEARNSETS_URL} ...`);
  const championsLearnsets = parseModLearnsets(await fetchLearnsets());
  console.log(
    `[buildChampionsLearnsets] parsed ${Object.keys(championsLearnsets).length} champions learnsets`,
  );

  const pool = championsSpeciesPool();
  console.log(`[buildChampionsLearnsets] base species pool: ${pool.length}`);

  /** Own-level movepool for one species id: champions override, else vanilla. */
  async function ownMoves(id: string): Promise<string[]> {
    if (championsLearnsets[id]) return championsLearnsets[id];
    const ls = await gen.learnsets.get(id);
    return ls?.learnset ? Object.keys(ls.learnset) : [];
  }

  /** Full prevo-merged movepool for a species id, memoized across the run. */
  const memo = new Map<string, Set<string>>();
  async function fullMoves(id: string): Promise<Set<string>> {
    const cached = memo.get(id);
    if (cached) return cached;
    const moves = new Set<string>(await ownMoves(id));
    memo.set(id, moves); // set before recursion to break any pathological cycles
    const species = gen.species.get(id);
    const prevoName = species?.prevo;
    if (prevoName) {
      const prevoId = gen.species.get(prevoName)?.id;
      if (prevoId) for (const m of await fullMoves(prevoId)) moves.add(m);
    }
    return moves;
  }

  const learnsets: Record<string, string[]> = {};
  for (const species of pool) {
    learnsets[species.id] = [...(await fullMoves(species.id))].sort();
  }

  const totalMoves = Object.values(learnsets).reduce((n, m) => n + m.length, 0);
  console.log(
    `[buildChampionsLearnsets] ${Object.keys(learnsets).length} species, ` +
      `${totalMoves} total move entries`,
  );

  const table: ChampionsLearnsetsTable = {
    format: CURRENT_FORMAT,
    generatedAt: new Date().toISOString(),
    source: LEARNSETS_URL,
    learnsets,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(table) + '\n', 'utf8');
  console.log(`[buildChampionsLearnsets] wrote -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[buildChampionsLearnsets] FAILED:', err);
  process.exit(1);
});
