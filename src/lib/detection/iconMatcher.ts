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
  /**
   * Collapse forme-families to one candidate per base species before slicing
   * topN, emitting the base speciesId (e.g. every rotom appliance -> "rotom").
   * Appliance/cosmetic formes are visually near-indistinguishable at team-preview
   * render scale, so ranking them as separate candidates both dilutes the base
   * species' recall and surfaces a misleadingly specific (often wrong) forme. Use
   * for the user-facing candidate list; leave OFF for the auto-accept decision,
   * which must reason over the specific forme. Requires `baseSpeciesId` in the
   * table (falls back to speciesId per-entry when absent).
   */
  collapseFormes?: boolean;
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
 * Keep the first item per key, preserving order. Applied to a confidence-sorted
 * list, "first" = highest, so this is a max-by-key dedupe.
 */
function dedupeBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

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

  // Score every (legal) entry, carrying its base species so we can optionally
  // collapse forme-families after ranking.
  const scored: { speciesId: string; baseSpeciesId: string; confidence: number }[] = [];
  for (const entry of table.entries) {
    if (opts.legalOnly && !opts.legalOnly.has(entry.speciesId)) continue;
    const cos = cosine(centeredCrop, centerAndNormalize(entry.vector, table.mean));
    scored.push({
      speciesId: entry.speciesId,
      baseSpeciesId: entry.baseSpeciesId ?? entry.speciesId,
      confidence: cosineToConfidence(cos),
    });
  }

  // Highest confidence first; deterministic tie-break on speciesId.
  scored.sort((a, b) => b.confidence - a.confidence || a.speciesId.localeCompare(b.speciesId));

  // Dedupe to the best evidence per species. The base sprite table lists each
  // species once, but a label-augmented table can carry several real-crop
  // exemplars per species — a species must still surface as ONE candidate
  // (max-cosine 1-NN, the standard few-shot read), not fill the top-N with itself.
  const perSpecies = dedupeBy(scored, (s) => s.speciesId);

  if (!opts.collapseFormes) {
    return perSpecies.slice(0, topN).map(({ speciesId, confidence }) => ({ speciesId, confidence }));
  }

  // Then collapse forme-families to one base candidate, surfacing the BASE id (the
  // specific appliance/cosmetic forme can't be told apart from the image, so the
  // user refines it via the override dropdown).
  return dedupeBy(perSpecies, (s) => s.baseSpeciesId)
    .slice(0, topN)
    .map((s) => ({ speciesId: s.baseSpeciesId, confidence: s.confidence }));
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
