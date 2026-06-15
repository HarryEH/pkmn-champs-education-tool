/**
 * Icon matcher (WS-D) — renderer/pure.
 *
 * Hashes a single icon crop and ranks it against the precomputed icon-hash table
 * by Hamming distance, returning the top-3 candidates with a confidence in [0,1].
 * Confidence = 1 - distance / maxBits, so an exact match scores 1.0.
 */
import {
  HASH_MAX_BITS,
  NORMALIZE_SIZE,
  hammingDistance,
  hashImage,
  resampleNearest,
  type RgbaImage,
} from './hash';
import type { IconHashEntry } from './iconHashes';
import {
  centerAndNormalize,
  cosine,
  type BoxEmbeddingTable,
} from './boxEmbeddings';

/** A ranked match candidate (matches OpponentSlot.candidates entry shape). */
export interface MatchCandidate {
  speciesId: string;
  confidence: number;
}

/** Options for {@link matchEmbedding}. */
export interface MatchEmbeddingOptions {
  /** If set, only entries whose speciesId is in this set are ranked (legal pool). */
  legalOnly?: Set<string>;
  /** How many candidates to surface; defaults to {@link TOP_N}. */
  topN?: number;
}

/**
 * Map a centered cosine similarity (in [-1, 1]) to a confidence in [0, 1].
 * Monotonic, so ranking is unaffected; only the auto-accept threshold cares about
 * the absolute value (re-tuned against the harness in R7).
 */
export function cosineToConfidence(cos: number): number {
  return (cos + 1) / 2;
}

/**
 * Rank a raw CLIP crop embedding against the box-embedding table by centered
 * cosine NN (R7). Reproduces the spike math: center the crop with the table's
 * stored full-pool `mean`, center each (legal-filtered) entry with the SAME mean,
 * then cosine. Never recompute the mean over the filtered subset.
 *
 * @param cropEmbedding raw 512-d embedding from the runtime embedder
 * @returns up to `topN` candidates, best (highest confidence) first
 */
export function matchEmbedding(
  cropEmbedding: number[],
  table: BoxEmbeddingTable,
  opts: MatchEmbeddingOptions = {},
): MatchCandidate[] {
  const topN = opts.topN ?? TOP_N;
  const centeredCrop = centerAndNormalize(cropEmbedding, table.mean);

  const scored: MatchCandidate[] = [];
  for (const entry of table.entries) {
    if (opts.legalOnly && !opts.legalOnly.has(entry.speciesId)) continue;
    const cos = cosine(centeredCrop, centerAndNormalize(entry.vector, table.mean));
    scored.push({ speciesId: entry.speciesId, confidence: cosineToConfidence(cos) });
  }

  // Highest confidence first; deterministic tie-break on speciesId.
  scored.sort((a, b) => b.confidence - a.confidence || a.speciesId.localeCompare(b.speciesId));
  return scored.slice(0, topN);
}

/**
 * Minimum top-1 confidence at which the pipeline may auto-accept a match without
 * user confirmation. Tunable. Empirically blockhash on clean 40x30 icons yields
 * near-1.0 for the true match and a clear gap to the runner-up; 0.85 leaves room
 * for capture noise / scaling while staying above typical false positives.
 *
 * NOTE: revisit after collecting real Elgato frames (see R3 memo).
 */
export const AUTO_ACCEPT_THRESHOLD = 0.85;

/** How many candidates to surface per slot. */
export const TOP_N = 3;

/**
 * Rank a crop against the hash table. The crop is normalized to NORMALIZE_SIZE
 * (the same edge the build script uses) before hashing, guaranteeing parity.
 *
 * @returns up to TOP_N candidates, best (highest confidence) first.
 */
export function matchIcon(crop: RgbaImage, table: IconHashEntry[], topN = TOP_N): MatchCandidate[] {
  const normalized = resampleNearest(crop, NORMALIZE_SIZE);
  const cropHash = hashImage(normalized);
  return matchHash(cropHash, table, topN);
}

/**
 * Rank a precomputed crop hash against the table. Split out from {@link matchIcon}
 * so callers/tests that already have a hash (and to avoid re-normalizing) can use it.
 */
export function matchHash(
  cropHash: string,
  table: IconHashEntry[],
  topN = TOP_N,
): MatchCandidate[] {
  const scored: MatchCandidate[] = table.map((entry) => ({
    speciesId: entry.speciesId,
    confidence: 1 - hammingDistance(cropHash, entry.hash) / HASH_MAX_BITS,
  }));

  // Highest confidence first; stable-enough tie-break on speciesId for determinism.
  scored.sort((a, b) => b.confidence - a.confidence || a.speciesId.localeCompare(b.speciesId));
  return scored.slice(0, topN);
}

/** Whether a candidate list clears the auto-accept bar (top-1 >= threshold). */
export function isAutoAcceptable(
  candidates: MatchCandidate[],
  threshold = AUTO_ACCEPT_THRESHOLD,
): boolean {
  return candidates.length > 0 && candidates[0].confidence >= threshold;
}
