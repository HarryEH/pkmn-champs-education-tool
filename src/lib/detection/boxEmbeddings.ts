/**
 * Box-embedding reference table (R7) — the embedding-era replacement for the
 * blockhash `iconHashes.ts`/`hash.ts` source-of-truth pair.
 *
 * Detection matches an opponent crop by CLIP image embedding (cosine NN) against
 * a precomputed table of legal base-forme box-sprite embeddings. This module owns
 * the table shape, its loader, and the centering/cosine math so the build script
 * (scripts/buildBoxEmbeddings.ts) and the runtime matcher (iconMatcher.ts) share
 * one definition.
 *
 * Build/run parity invariants (see embedPreproc.PREPROC_VERSION): same model id,
 * same preprocessing, and centering with the SAME stored full-pool mean. Vectors
 * are stored RAW (un-centered); centering math lives here, applied identically at
 * build and run, so the legal-only runtime filter never recomputes the mean over a
 * subset.
 */
import { PREPROC_VERSION } from './embedPreproc';
import boxEmbeddingsJson from '../../data/boxEmbeddings.json';

/** CLIP model id — the single source of truth, shared by build + runtime. */
export const EMBED_MODEL = 'Xenova/clip-vit-base-patch32';

/** Embedding dimensionality (CLIP ViT-B/32 image features, mean-pooled). */
export const EMBED_DIM = 512;

/** One reference species' raw (un-centered) embedding. */
export interface BoxEmbeddingEntry {
  speciesId: string;
  /** Human-readable name (debugging/UX), e.g. "Ogerpon-Wellspring". */
  name: string;
  /** Raw 512-d CLIP embedding (un-centered). Center via {@link centerAndNormalize}. */
  vector: number[];
}

/** Top-level shape of src/data/boxEmbeddings.json. */
export interface BoxEmbeddingTable {
  /** Model the embeddings were produced with — parity guard. */
  model: string;
  /** Preprocessing version — bump on compositing/pooling changes (parity guard). */
  preprocVersion: number;
  /** Embedding dimensionality (length of every vector and of `mean`). */
  dim: number;
  /** Full-pool mean for centering (length === dim). Apply to crop AND entries. */
  mean: number[];
  /** ISO date the table was generated. */
  generatedAt: string;
  /** Raw (un-centered) reference vectors. */
  entries: BoxEmbeddingEntry[];
}

/**
 * Load the committed embedding table and verify build/run parity. Throws on a
 * model or preprocVersion mismatch (a silent mismatch destroys accuracy) rather
 * than returning garbage matches.
 */
export function loadBoxEmbeddings(): BoxEmbeddingTable {
  const table = boxEmbeddingsJson as unknown as BoxEmbeddingTable;
  assertTableCompatible(table);
  return table;
}

/**
 * Verify a loaded table matches the runtime's model + preprocessing. This is the
 * embedding-era replacement for the old `assertTableCompatible(IconHashTable)`.
 */
export function assertTableCompatible(
  table: Pick<BoxEmbeddingTable, 'model' | 'preprocVersion' | 'dim'>,
): void {
  if (table.model !== EMBED_MODEL) {
    throw new Error(
      `boxEmbeddings.json was built with model "${table.model}"; runtime expects ` +
        `"${EMBED_MODEL}". Regenerate: npx vite-node scripts/buildBoxEmbeddings.ts`,
    );
  }
  if (table.preprocVersion !== PREPROC_VERSION) {
    throw new Error(
      `boxEmbeddings.json preprocVersion ${table.preprocVersion} != runtime ` +
        `${PREPROC_VERSION}. Regenerate: npx vite-node scripts/buildBoxEmbeddings.ts`,
    );
  }
}

/** L2-normalize a vector (guards against the zero vector). */
export function l2normalize(vec: number[]): number[] {
  let norm = 0;
  for (const x of vec) norm += x * x;
  norm = Math.sqrt(norm) + 1e-8;
  return vec.map((x) => x / norm);
}

/**
 * Subtract the stored pool mean (removes CLIP's dominant common direction — load
 * bearing, see detection-approach memo) then re-L2-normalize. The ONLY centering
 * implementation: build and runtime both call this with the same `mean`.
 */
export function centerAndNormalize(vec: number[], mean: number[]): number[] {
  return l2normalize(vec.map((x, i) => x - mean[i]));
}

/** Dot product. Inputs are assumed already centered+normalized, so this is cosine. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
