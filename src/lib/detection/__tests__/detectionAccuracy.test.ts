/**
 * Detection accuracy harness — the regression gate that the old pipeline never
 * had. Runs the REAL production crop+match path over a real Switch team-preview
 * screenshot with known ground truth, and reports top-1 / top-3 hit rate.
 *
 * The "baseline" case documents the failure of the original Showdown-icon table
 * (matching Nintendo box renders against Showdown menu sprites). As the rework
 * lands (box-sprite table + masked matcher + legal-only filtering), add cases
 * here and ratchet the asserted bar up.
 */
import { describe, it, expect } from 'vitest';
import iconHashes from '../../../data/iconHashes.json';
import type { IconHashTable } from '../iconHashes';
import { matchIcon } from '../iconMatcher';
import { loadPng } from './helpers/loadPng';
import { formatReport, scoreAccuracy } from './helpers/accuracy';
import { JASON_FRAME_PATH, JASON_GROUND_TRUTH, JASON_RECTS } from './fixtures/jasonTeam';

const table = iconHashes as unknown as IconHashTable;

describe('detection accuracy on a real Switch frame', () => {
  it('baseline: Showdown-icon table, full National Dex pool', () => {
    const frame = loadPng(JASON_FRAME_PATH);
    const report = scoreAccuracy(frame, JASON_RECTS, JASON_GROUND_TRUTH, (crop) =>
      matchIcon(crop, table.entries, table.entries.length),
    );
    // eslint-disable-next-line no-console
    console.log(formatReport('baseline Showdown icons', report));
    // Documents the status quo; no strict bar yet. The reworked case will assert.
    expect(report.slots).toHaveLength(6);
  });
});
