/**
 * Build script (WS-D): generate src/data/iconHashes.json.
 *
 * Run with:  npx vite-node scripts/buildIconHashes.ts
 * (vite-node ships with vitest; it runs this TS file under Node with the project's
 *  module resolution. `npx tsx scripts/buildIconHashes.ts` works too if tsx is added.)
 *
 * What it does, per the WS-D design constraints:
 *   1. Enumerate every real National Dex species+forme from @pkmn/dex's
 *      UNGATED `Dex.species` (see R5 memo: `gen.species` is Scarlet/Violet's
 *      regional dex, NOT a useful base — it's missing species like Lopunny
 *      that Champions legalizes, and including/excluding them per-regulation
 *      would require regenerating this file on every regulation change).
 *   2. Download the Showdown icon SPRITE SHEET once (a single
 *      pokemonicons-sheet.png; @pkmn/img `Icons` returns background-position
 *      offsets into it, NOT per-icon files).
 *   3. For each species, crop its 40x30 icon cell at (-left, -top), normalize to
 *      32x32, and perceptual-hash it with the SHARED hashImage() — the identical
 *      function the renderer uses, so build/run agree.
 *   4. Write the table to src/data/iconHashes.json.
 *
 * REGENERATE TRIGGER (R5 "decoupled" architecture): this table is now
 * regulation-INDEPENDENT — it's every real, recognizable species icon, forever.
 * Regenerate only if @pkmn/dex's base species data changes (new Pokémon/formes
 * added upstream), NOT on regulation cutovers. Regulation-specific legality
 * (which of these species are legal/banned this format) lives separately in
 * src/data/championsLegality.json (scripts/buildChampionsLegality.ts), which
 * DOES need regenerating on regulation changes.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Icons } from '@pkmn/img';
import { Dex } from '@pkmn/dex';
import { CURRENT_FORMAT } from '../src/shared/types';
import {
  NORMALIZE_SIZE,
  HASH_BITS_SIDE,
  hashImage,
  resampleNearest,
} from '../src/lib/detection/hash';
import type { IconHashEntry, IconHashTable } from '../src/lib/detection/iconHashes';

const SPRITE_SHEET_URL = 'https://play.pokemonshowdown.com/sprites/pokemonicons-sheet.png';
/** Icon cell dimensions on the Showdown sheet (12 columns; see @pkmn/img Icons). */
const ICON_W = 40;
const ICON_H = 30;

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/data/iconHashes.json');

/**
 * R5 filter: the full National Dex icon pool to hash (regulation-independent).
 *
 * `Dex.species.all()` (ungated — every gen, every forme: 1517 entries) keeps
 * `num > 0` (drops CAP placeholders with num <= 0) and `isNonstandard ∈ {null,
 * 'Past'}` (drops Future/LGPE/Custom/CAP — non-real or not-yet-real species).
 * We additionally drop `battleOnly` formes (Mega evolutions, Terapagos-Terastal,
 * Zacian-Crowned, Ogerpon-*-Tera, etc.) — those are in-battle transformations
 * that never appear as a distinct TEAM-PREVIEW icon (team preview always shows
 * the base forme, and battle-only formes collide on sprite cell with it anyway).
 * Result: ~1285, vs. 860 under the old Gen-9-regional-dex filter — the ~425
 * difference is exactly the "Past" species (e.g. Lopunny) that are absent from
 * `gen.species` but legal/encounterable in Champions. See R5 spike memo.
 */
function legalSpecies() {
  return Dex.species
    .all()
    .filter(
      (s) => s.num > 0 && !s.battleOnly && (s.isNonstandard === null || s.isNonstandard === 'Past'),
    );
}

async function fetchSpriteSheet(): Promise<PNG> {
  const res = await fetch(SPRITE_SHEET_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch sprite sheet: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return PNG.sync.read(buf);
}

/** Crop a 40x30 icon cell out of the decoded sheet into an RGBA RgbaImage. */
function cropIcon(sheet: PNG, leftOffset: number, topOffset: number) {
  // Icons.getPokemon returns NEGATIVE CSS background-position offsets.
  const x0 = -leftOffset;
  const y0 = -topOffset;
  const data = new Uint8ClampedArray(ICON_W * ICON_H * 4);
  for (let y = 0; y < ICON_H; y++) {
    for (let x = 0; x < ICON_W; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      const di = (y * ICON_W + x) * 4;
      if (sx < 0 || sy < 0 || sx >= sheet.width || sy >= sheet.height) {
        // Out of sheet bounds -> transparent black (shouldn't happen for valid icons).
        continue;
      }
      const si = (sy * sheet.width + sx) * 4;
      data[di] = sheet.data[si];
      data[di + 1] = sheet.data[si + 1];
      data[di + 2] = sheet.data[si + 2];
      data[di + 3] = sheet.data[si + 3];
    }
  }
  return { width: ICON_W, height: ICON_H, data };
}

async function main() {
  const species = legalSpecies();
  console.log(`[buildIconHashes] species after filter: ${species.length}`);

  console.log(`[buildIconHashes] downloading sprite sheet ${SPRITE_SHEET_URL} ...`);
  const sheet = await fetchSpriteSheet();
  console.log(`[buildIconHashes] sheet decoded: ${sheet.width}x${sheet.height}`);

  const entries: IconHashEntry[] = [];
  const seenIcon = new Set<string>();
  for (const s of species) {
    const icon = Icons.getPokemon(s.name);
    // De-dupe by sheet cell: distinct species ids occasionally share an icon
    // (e.g. some regional/forme pairs). Keep the first; matching can't tell
    // identical cells apart anyway, and a duplicate hash only adds noise.
    const cellKey = `${icon.left},${icon.top}`;
    if (seenIcon.has(cellKey)) continue;
    seenIcon.add(cellKey);

    const cell = cropIcon(sheet, icon.left, icon.top);
    const normalized = resampleNearest(cell, NORMALIZE_SIZE);
    entries.push({ speciesId: s.id, name: s.name, hash: hashImage(normalized) });
  }

  const table: IconHashTable = {
    // Provenance only (R5): this table is regulation-independent, so `format`
    // no longer signals staleness — it just records what was current at
    // generation time. Regulation-specific legality is championsLegality.json.
    format: CURRENT_FORMAT,
    generatedAt: new Date().toISOString(),
    hashBitsSide: HASH_BITS_SIDE,
    normalizeSize: NORMALIZE_SIZE,
    spriteSheetUrl: SPRITE_SHEET_URL,
    entries,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(table, null, 2) + '\n', 'utf8');
  console.log(`[buildIconHashes] wrote ${entries.length} entries -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[buildIconHashes] FAILED:', err);
  process.exit(1);
});
