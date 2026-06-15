/**
 * Detection accuracy scorer — shared by the harness test(s).
 *
 * Given a frame, the calibration rects, the ground-truth species per slot, and a
 * matcher (crop -> ranked candidates), it crops each slot, ranks it, and reports
 * where the true species landed. This is the quantitative gate the rework is
 * tuned against: top-1 / top-3 hit rate on a real Switch frame.
 */
import type { NormalizedRect } from '../../../../shared/types';
import { cropRegions } from '../../cropRegions';
import type { RgbaImage } from '../../hash';
import type { MatchCandidate } from '../../iconMatcher';

/** A matcher ranks a single crop against some reference set, best-first. */
export type Matcher = (crop: RgbaImage) => MatchCandidate[];

export interface SlotResult {
  slot: number;
  truth: string;
  /** 0-based rank of the truth in the ranking, or -1 if absent. */
  rank: number;
  top1: string | undefined;
  top1Confidence: number;
  /** Confidence assigned to the true species (NaN if absent). */
  truthConfidence: number;
}

export interface AccuracyReport {
  slots: SlotResult[];
  top1Hits: number;
  top3Hits: number;
  top1Rate: number;
  top3Rate: number;
}

export function scoreAccuracy(
  frame: RgbaImage,
  rects: NormalizedRect[],
  truth: readonly string[],
  matcher: Matcher,
): AccuracyReport {
  const crops = cropRegions(frame, rects);
  const slots: SlotResult[] = crops.map((crop, i) => {
    const ranked = matcher(crop);
    const rank = ranked.findIndex((c) => c.speciesId === truth[i]);
    return {
      slot: i + 1,
      truth: truth[i],
      rank,
      top1: ranked[0]?.speciesId,
      top1Confidence: ranked[0]?.confidence ?? NaN,
      truthConfidence: rank >= 0 ? ranked[rank].confidence : NaN,
    };
  });
  const top1Hits = slots.filter((s) => s.rank === 0).length;
  const top3Hits = slots.filter((s) => s.rank >= 0 && s.rank < 3).length;
  return {
    slots,
    top1Hits,
    top3Hits,
    top1Rate: top1Hits / slots.length,
    top3Rate: top3Hits / slots.length,
  };
}

/** Human-readable one-line-per-slot summary for test console output. */
export function formatReport(label: string, report: AccuracyReport): string {
  const lines = report.slots.map((s) => {
    const got = s.top1 ?? '(none)';
    const rankStr = s.rank < 0 ? 'NOT RANKED' : `rank #${s.rank + 1}`;
    const mark = s.rank === 0 ? '✓' : s.rank >= 0 && s.rank < 3 ? '~' : '✗';
    return (
      `  ${mark} slot ${s.slot}: truth=${s.truth} -> top1=${got} ` +
      `(${s.top1Confidence.toFixed(3)})  truth ${rankStr} ` +
      `(${Number.isNaN(s.truthConfidence) ? '—' : s.truthConfidence.toFixed(3)})`
    );
  });
  return (
    `\n[${label}] top1 ${report.top1Hits}/${report.slots.length} ` +
    `(${(report.top1Rate * 100).toFixed(0)}%), top3 ${report.top3Hits}/${report.slots.length} ` +
    `(${(report.top3Rate * 100).toFixed(0)}%)\n${lines.join('\n')}\n`
  );
}
