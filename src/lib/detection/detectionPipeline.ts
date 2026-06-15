/**
 * Detection pipeline (WS-D) — renderer orchestration.
 *
 * Ties the pure pieces together: a captured frame + six calibration rects ->
 * six crops -> per-crop top-3 candidates -> an OpponentTeam. WS-E calls this from
 * the Detection screen; it does not touch capture devices or React itself.
 */
import type { NormalizedRect, OpponentSlot, OpponentTeam } from '../../shared/types';
import { cropRegions } from './cropRegions';
import type { RgbaImage } from './hash';
import { assertTableCompatible, type IconHashTable } from './iconHashes';
import {
  AUTO_ACCEPT_THRESHOLD,
  TOP_N,
  isAutoAcceptable,
  matchIcon,
  type MatchCandidate,
} from './iconMatcher';

export interface DetectOptions {
  /** Auto-accept top-1 confidence bar; defaults to AUTO_ACCEPT_THRESHOLD. */
  autoAcceptThreshold?: number;
  /** Candidates surfaced per slot; defaults to TOP_N. */
  topN?: number;
  /** Clock injection for tests; defaults to Date.now. */
  now?: () => number;
}

/**
 * Run detection over a full frame.
 *
 * @param frame  full-resolution captured frame pixels
 * @param rects  six normalized calibration rects (slot order preserved)
 * @param table  loaded icon-hash table (from src/data/iconHashes.json)
 */
export function detectOpponentTeam(
  frame: RgbaImage,
  rects: NormalizedRect[],
  table: IconHashTable,
  options: DetectOptions = {},
): OpponentTeam {
  assertTableCompatible(table);
  const threshold = options.autoAcceptThreshold ?? AUTO_ACCEPT_THRESHOLD;
  const topN = options.topN ?? TOP_N;
  const now = options.now ?? Date.now;

  const crops = cropRegions(frame, rects);
  const slots: OpponentSlot[] = crops.map((crop) => {
    const candidates: MatchCandidate[] = matchIcon(crop, table.entries, topN);
    return {
      // Auto-confirm only when the best match is confident enough; otherwise leave
      // null so the UI prompts the user to pick from `candidates`.
      speciesId: isAutoAcceptable(candidates, threshold) ? candidates[0].speciesId : null,
      candidates,
    };
  });

  return { slots, detectedAt: now() };
}
