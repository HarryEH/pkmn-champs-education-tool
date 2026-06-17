/**
 * Build the CLIP box-embedding reference table (R7) — the embedding-era source of
 * truth that replaces the blockhash `iconHashes.json`. Detection matches an
 * opponent team-preview crop by CLIP image embedding (cosine NN) against this
 * precomputed table of legal base-forme sprite embeddings.
 *
 *   npx vite-node scripts/buildBoxEmbeddings.ts
 *
 * For each legal base-forme species (championsLegality.json `legal === true`) we
 * resolve a sprite, preprocess it through the SHARED build/runtime path
 * (`compositeOnWhite`, see embedPreproc.PREPROC_VERSION), embed it with the shared
 * CLIP model (boxEmbeddings.EMBED_MODEL), and store the RAW 512-d vector. The
 * element-wise pool mean is computed over every embedded entry and stored
 * separately — centering (mean subtraction) is applied identically at build and
 * runtime by `centerAndNormalize`, so the legal-only runtime filter never needs to
 * recompute it over a subset.
 *
 * Reference art: pokesprite gen-8 BOX icons (the spike-validated chibi pose that
 * matches the in-game team-preview render; 5/6 on the Jason frame). pokesprite's
 * box set predates gen-9, so the ~20 Paldea species (and a handful of box-less
 * older formes) fall back to Showdown gen5 sprites via @pkmn/img — verified by
 * HTTP probe before embedding. Slugs are resolved from pokesprite's own
 * pokemon.json (keyed by zero-padded dex number) bridged via @pkmn/dex, never
 * hand-rolled (the spike's raw-id guess caused the lone Rotom miss).
 *
 * Per-sprite embeddings are memoized in scripts/.embedcache.json (gitignored,
 * keyed by sprite URL) so reruns are fast and stable.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { pipeline, RawImage } from '@huggingface/transformers';
import { Dex } from '@pkmn/dex';
import { Sprites } from '@pkmn/img';
import type { RgbaImage } from '../src/lib/detection/image';
import { compositeOnWhite, PREPROC_VERSION } from '../src/lib/detection/embedPreproc';
import { EMBED_DIM, EMBED_MODEL, type BoxEmbeddingTable } from '../src/lib/detection/boxEmbeddings';
import legality from '../src/data/championsLegality.json';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = resolve(here, '.embedcache.json');
const OUT_PATH = resolve(here, '../src/data/boxEmbeddings.json');

/** pokesprite gen-8 box icons — the spike-validated reference art domain. */
const BOX_BASE = 'https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular';
/** pokesprite metadata: dex-number-keyed (zero-padded) base slugs + form maps. */
const POKESPRITE_DATA = 'https://raw.githubusercontent.com/msikma/pokesprite/master/data/pokemon.json';

const pad3 = (n: number): string => String(n).padStart(3, '0');

interface LegalEntry {
  speciesId: string;
  name: string;
  legal: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchPng(url: string): Promise<RgbaImage | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  return { width: png.width, height: png.height, data: png.data };
}

async function urlOk(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: 'HEAD' })).ok;
  } catch {
    return false;
  }
}

/**
 * Ordered pokesprite box-sprite filename candidates for a species. The flat
 * gen-8 box dir uses hyphenated form slugs (`rotom-wash`, `ninetales-alola`,
 * `vivillon-poke-ball`); gender F-forms live in a `female/` subfolder; Alcremie
 * needs a decoration suffix on its cream. We try each and take the first that
 * resolves rather than hard-coding every quirk.
 */
function boxCandidates(baseSlug: string, forme: string): string[] {
  if (!forme) return [`${baseSlug}.png`];
  const formKey = forme.toLowerCase().replace(/[\s_]+/g, '-');
  const out: string[] = [];
  if (forme === 'F') out.push(`female/${baseSlug}.png`, `${baseSlug}-female.png`);
  out.push(`${baseSlug}-${formKey}.png`);
  // Alcremie box art is keyed by cream + decoration; default to the canonical bow.
  out.push(`${baseSlug}-${formKey}-strawberry.png`);
  return out;
}

/**
 * Resolve a verified (HTTP 200) sprite URL for a champions species id, preferring
 * the validated pokesprite box art and falling back to a Showdown gen5 sprite for
 * gen-9 / box-less formes. Returns null (caller logs a SKIP) if nothing resolves.
 */
async function resolveSpriteUrl(
  speciesId: string,
  ps: Record<string, { slug?: { eng?: string } }>,
): Promise<string | null> {
  const sp = Dex.species.get(speciesId);
  const psEntry = ps[pad3(sp.num)];
  const baseSlug = psEntry?.slug?.eng ?? sp.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (psEntry) {
    for (const cand of boxCandidates(baseSlug, sp.forme)) {
      const url = `${BOX_BASE}/${cand}`;
      if (await urlOk(url)) return url;
    }
  }
  const fallback = Sprites.getPokemon(speciesId, { gen: 'gen5' as never }).url;
  if (await urlOk(fallback)) return fallback;
  return null;
}

/** A CLIP image-feature extractor bound to a single sprite -> raw 512-d vector. */
type Embedder = (img: RgbaImage) => Promise<number[]>;

async function makeEmbedder(): Promise<Embedder> {
  // Built inline (not stored as the broad pipeline() union) so `ext`'s call
  // signature is narrowly inferred, mirroring scripts/spikeEmbed.ts.
  const ext = await pipeline('image-feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
  return async (img: RgbaImage): Promise<number[]> => {
    const rgb = compositeOnWhite(img);
    const raw = new RawImage(rgb.data, rgb.width, rgb.height, 3);
    // transformers@4.x omits pooling/normalize from this pipeline's option types,
    // but the runtime accepts them (mirrors scripts/spikeEmbed.ts).
    const t = await ext(raw, { pooling: 'mean', normalize: true } as Parameters<typeof ext>[1]);
    return Array.from(t.data as Float32Array);
  };
}

async function main(): Promise<void> {
  const legal = (legality as { entries: LegalEntry[] }).entries.filter((e) => e.legal);
  console.log(`Building box embeddings for ${legal.length} legal base-forme species...`);

  const ps = await fetchJson<Record<string, { slug?: { eng?: string } }>>(POKESPRITE_DATA);

  const cache: Record<string, number[]> = existsSync(CACHE_PATH)
    ? (JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Record<string, number[]>)
    : {};
  const flushCache = (): void => writeFileSync(CACHE_PATH, JSON.stringify(cache));

  const entries: BoxEmbeddingTable['entries'] = [];
  const skips: string[] = [];
  let resolved = 0;
  let embedded = 0;
  // Lazily loaded so a fully-cached rerun never downloads the ~hundreds-of-MB model.
  let embed: Embedder | null = null;

  for (const e of legal) {
    const url = await resolveSpriteUrl(e.speciesId, ps);
    if (!url) {
      skips.push(`SKIP ${e.speciesId}: no pokesprite box or Showdown gen5 sprite resolved`);
      console.warn(skips[skips.length - 1]);
      continue;
    }
    resolved++;

    let vector = cache[url];
    if (!vector) {
      const img = await fetchPng(url);
      if (!img) {
        skips.push(`SKIP ${e.speciesId}: ${url} HEAD ok but GET/decode failed`);
        console.warn(skips[skips.length - 1]);
        continue;
      }
      if (!embed) embed = await makeEmbedder();
      vector = await embed(img);
      cache[url] = vector;
      if (++embedded % 20 === 0) {
        flushCache();
        console.log(`  embedded ${embedded} new sprites...`);
      }
    }

    if (vector.length !== EMBED_DIM) {
      skips.push(`SKIP ${e.speciesId}: embedding dim ${vector.length} != ${EMBED_DIM}`);
      console.warn(skips[skips.length - 1]);
      continue;
    }
    // Pool appliance/cosmetic formes under their base species for the matcher's
    // forme-family collapse (e.g. every rotom* -> "rotom").
    const baseSpeciesId = Dex.species.get(Dex.species.get(e.speciesId).baseSpecies).id;
    entries.push({ speciesId: e.speciesId, name: e.name, baseSpeciesId, vector });
  }
  flushCache();

  if (entries.length === 0) throw new Error('No embeddings produced — aborting.');

  // Element-wise pool mean over EVERY embedded entry (load-bearing for centering).
  const mean = new Array<number>(EMBED_DIM).fill(0);
  for (const entry of entries) {
    for (let i = 0; i < EMBED_DIM; i++) mean[i] += entry.vector[i] / entries.length;
  }

  const table: BoxEmbeddingTable = {
    model: EMBED_MODEL,
    preprocVersion: PREPROC_VERSION,
    dim: EMBED_DIM,
    mean,
    generatedAt: new Date().toISOString(),
    entries,
  };
  writeFileSync(OUT_PATH, JSON.stringify(table));

  const pct = ((resolved / legal.length) * 100).toFixed(1);
  console.log(
    `\nDone. ${resolved}/${legal.length} resolved (${pct}%), ` +
      `${entries.length} embedded, ${skips.length} skipped.`,
  );
  if (skips.length) console.log(skips.join('\n'));
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
