/**
 * Detection screen (E1a/E2) constants: the box-embedding reference table +
 * Champions legality index used by the detection pipeline, the legal species set
 * matches are filtered to, the species list for the manual-override dropdown, and
 * a default calibration layout for a Switch team-preview screenshot.
 */
import championsLegalityJson from '../../../data/championsLegality.json';
import { loadBoxEmbeddings } from '../../../lib/detection/boxEmbeddings';
import {
  buildLegalityIndex,
  type ChampionsLegalityTable,
} from '../../../lib/detection/championsLegality';
import type { NormalizedRect } from '../../../shared/types';
import type { SelectOption } from '../../ui';

/** CLIP box-sprite reference embeddings (legal Champions base formes). */
export const BOX_EMBEDDING_TABLE = loadBoxEmbeddings();

/** Reg M-A legality table (253/1285 legal). */
export const LEGALITY_TABLE = championsLegalityJson as ChampionsLegalityTable;

/** speciesId -> legality entry, for flagging banned detections. */
export const LEGALITY_INDEX = buildLegalityIndex(LEGALITY_TABLE);

/** Legal species ids — the pool the embedding matcher ranks against. */
export const LEGAL_SPECIES_IDS = new Set(
  LEGALITY_TABLE.entries.filter((entry) => entry.legal).map((entry) => entry.speciesId),
);

/** Species pickable in the override dropdown: the Champions Reg M-A legal pool, A-Z. */
export const SPECIES_OPTIONS: SelectOption[] = LEGALITY_TABLE.entries
  .filter((entry) => entry.legal)
  .map((entry) => ({ value: entry.speciesId, label: entry.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

/**
 * Six rects covering the opponent's team-preview renders, which on a real
 * Nintendo Switch capture sit as a vertical strip down the right-hand (red)
 * column — NOT a horizontal row. Slots are evenly spaced top -> bottom at a
 * uniform ~83px pitch, each box 104x82px, hand-tuned against the real 1280x720
 * frame (see src/lib/detection/__tests__/fixtures/jasonTeam.ts). Values are
 * normalized (0-1) so they scale to any capture resolution, and stay fully
 * adjustable via the calibration overlay — this is just a starting point so
 * "Detect" works before any manual calibration.
 */
export const DEFAULT_CALIBRATION_RECTS: NormalizedRect[] = [142, 225, 309, 392, 476, 559].map(
  (cy) => ({
    x: 1048 / 1280,
    y: (cy - 41) / 720,
    w: 104 / 1280,
    h: 82 / 720,
  }),
);
