/**
 * Detection pipeline (R7) — renderer orchestration.
 *
 * Ties the pure pieces together: a captured frame + six calibration rects ->
 * six crops -> segment each off the red panel -> CLIP embed -> top-3 candidates ->
 * an OpponentTeam. WS-E calls this from the Detection screen; it does not touch
 * capture devices or React itself.
 */
import type { NormalizedRect, OpponentSlot, OpponentTeam } from '../../shared/types';
import { assertTableCompatible, type BoxEmbeddingTable } from './boxEmbeddings';
import { cropRegions } from './cropRegions';
import { embedCrop } from './embedder';
import type { RgbaImage } from './image';
import { segmentToWhite } from './segment';
import {
  AUTO_ACCEPT_THRESHOLD,
  TOP_N,
  isAutoAcceptable,
  matchEmbedding,
  type MatchCandidate,
} from './iconMatcher';

export interface DetectOptions {
  /** Auto-accept top-1 confidence bar; defaults to AUTO_ACCEPT_THRESHOLD. */
  autoAcceptThreshold?: number;
  /** Candidates surfaced per slot; defaults to TOP_N. */
  topN?: number;
  /** Restrict matches to this legal species pool (speciesIds). */
  legalOnly?: Set<string>;
  /** Clock injection for tests; defaults to Date.now. */
  now?: () => number;
  /**
   * Embedder injection. Defaults to the renderer CLIP embedder; tests pass a
   * stub/Node embedder so the pipeline stays headless.
   */
  embed?: (img: RgbaImage) => Promise<number[]>;
  /**
   * Skip segmentation and embed the raw crop. Diagnostic only — segmentation is
   * the validated primary path (see segment.ts).
   */
  skipSegmentation?: boolean;
}

/**
 * Run detection over a full frame.
 *
 * @param frame  full-resolution captured frame pixels
 * @param rects  six normalized calibration rects (slot order preserved)
 * @param table  loaded box-embedding table (from src/data/boxEmbeddings.json)
 */
export async function detectOpponentTeam(
  frame: RgbaImage,
  rects: NormalizedRect[],
  table: BoxEmbeddingTable,
  options: DetectOptions = {},
): Promise<OpponentTeam> {
  assertTableCompatible(table);
  const threshold = options.autoAcceptThreshold ?? AUTO_ACCEPT_THRESHOLD;
  const topN = options.topN ?? TOP_N;
  const now = options.now ?? Date.now;
  const embed = options.embed ?? embedCrop;

  const crops = cropRegions(frame, rects);
  const slots: OpponentSlot[] = [];
  for (const crop of crops) {
    const prepared = options.skipSegmentation ? crop : segmentToWhite(crop);
    const embedding = await embed(prepared);
    // Auto-accept reasons over the RAW (specific-forme) ranking — a confident
    // single forme is a real commit, and pooling formes first would inflate the
    // top-1/top-2 margin into wrong-forme auto-accepts.
    const raw: MatchCandidate[] = matchEmbedding(embedding, table, {
      legalOnly: options.legalOnly,
      topN,
    });
    // The user-facing candidate list collapses forme-families to one base-species
    // chip (e.g. the six rotom appliances -> a single "Rotom"), so near-identical
    // formes don't crowd out distinct species or suggest a misleadingly specific
    // appliance the model can't actually distinguish.
    const candidates: MatchCandidate[] = matchEmbedding(embedding, table, {
      legalOnly: options.legalOnly,
      topN,
      collapseFormes: true,
    });
    slots.push({
      // Auto-confirm only when the best match is confident and clearly ahead;
      // otherwise leave null so the UI prompts the user to pick from `candidates`.
      speciesId: isAutoAcceptable(raw, threshold) ? raw[0].speciesId : null,
      candidates,
    });
  }

  return { slots, detectedAt: now() };
}
