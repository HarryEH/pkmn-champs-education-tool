/**
 * Build script (WS-D): generate src/data/iconHashes.json.
 *
 * Run with:  npx vite-node scripts/buildIconHashes.ts
 * (vite-node ships with vitest; it runs this TS file under Node with the project's
 *  module resolution. `npx tsx scripts/buildIconHashes.ts` works too if tsx is added.)
 *
 * What it does, per the WS-D design constraints:
 *   1. Enumerate the legal species pool from `gen.species` (see R2 memo for the
 *      exact filter and the Reg M-A -> M-B cutover caveat).
 *   2. Download the Showdown icon SPRITE SHEET once (a single
 *      pokemonicons-sheet.png; @pkmn/img `Icons` returns background-position
 *      offsets into it, NOT per-icon files).
 *   3. For each species, crop its 40x30 icon cell at (-left, -top), normalize to
 *      32x32, and perceptual-hash it with the SHARED hashImage() — the identical
 *      function the renderer uses, so build/run agree.
 *   4. Write the table to src/data/iconHashes.json.
 *
 * REGENERATE TRIGGER: the format flips Reg M-A -> M-B on 2026-06-17. The legal
 * pool changes then, so re-run this script on/after that date and re-commit the
 * JSON. The CURRENT_FORMAT constant + the format field in the JSON make staleness
 * detectable.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { Icons } from '@pkmn/img';
import { gen } from '../src/lib/calc/gen';
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
 * R2 filter: the legal Pokémon pool to hash.
 *
 * `gen.species` (Gen 9) already yields only standard species (876): every entry
 * has `isNonstandard == null`, `num > 0`, and cosmetic formes / G-Max are already
 * excluded. `Dex.formats` is undefined in @pkmn/dex 0.10.10 (R1), so we cannot
 * query Reg M-A legality directly. We therefore additionally drop `battleOnly`
 * formes (e.g. Terapagos-Terastal, Zacian-Crowned, Ogerpon-*-Tera) — those are
 * in-battle transformations that never appear as a distinct TEAM-PREVIEW icon
 * (and would collide on sprite num with their base forme anyway). Result: ~860.
 */
function legalSpecies() {
  return [...gen.species].filter((s) => !s.battleOnly);
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
  console.log(`[buildIconHashes] legal species after filter: ${species.length}`);

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
