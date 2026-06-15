/**
 * Icon matcher (R7) — renderer/pure.
 *
 * Ranks a raw CLIP crop embedding against the precomputed box-embedding table by
 * centered-cosine nearest-neighbour, filtered to the legal species pool, returning
 * the top-N candidates with a confidence in [0,1]. Centering uses the table's
 * stored full-pool mean (see boxEmbeddings.centerAndNormalize) — never recomputed
 * over the filtered subset.
 */
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
 * Minimum top-1 confidence to auto-accept a match without user confirmation.
 *
 * Unlike the old blockhash matcher (exact matches ~1.0), CLIP centered-cosine
 * confidences for true matches on real Switch frames cluster around 0.68–0.80,
 * with distractors close behind — so a high absolute bar would auto-accept nothing.
 * Tuned against the Jason fixture: this plus {@link AUTO_ACCEPT_MARGIN} auto-confirms
 * the clear slots (Aerodactyl/Garchomp/Tyranitar) while deferring genuinely
 * ambiguous ones (e.g. Rotom appliance formes, small renders) to the manual
 * override dropdown. Revisit as more real frames are collected.
 */
export const AUTO_ACCEPT_THRESHOLD = 0.7;

/**
 * Minimum gap between the top-1 and top-2 confidence to auto-accept. A tiny gap
 * (e.g. Incineroar barely edging Garganacl) means the top-1 is a coin-flip, so we
 * prompt instead of silently committing a likely-wrong pick.
 */
export const AUTO_ACCEPT_MARGIN = 0.03;

/** How many candidates to surface per slot. */
export const TOP_N = 3;

/**
 * Map a centered cosine similarity (in [-1, 1]) to a confidence in [0, 1].
 * Monotonic, so ranking is unaffected; only the auto-accept gate reads the
 * absolute value.
 */
export function cosineToConfidence(cos: number): number {
  return (cos + 1) / 2;
}

/**
 * Rank a raw CLIP crop embedding against the box-embedding table by centered
 * cosine NN. Centers the crop with the table's stored full-pool `mean`, centers
 * each (legal-filtered) entry with the SAME mean, then cosine.
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
 * Whether a candidate list clears the auto-accept bar: top-1 confidence at or above
 * {@link AUTO_ACCEPT_THRESHOLD} AND a {@link AUTO_ACCEPT_MARGIN} lead over the
 * runner-up. A lone candidate (no runner-up) only needs the threshold.
 */
export function isAutoAcceptable(
  candidates: MatchCandidate[],
  threshold = AUTO_ACCEPT_THRESHOLD,
  margin = AUTO_ACCEPT_MARGIN,
): boolean {
  if (candidates.length === 0 || candidates[0].confidence < threshold) return false;
  if (candidates.length === 1) return true;
  return candidates[0].confidence - candidates[1].confidence >= margin;
}
