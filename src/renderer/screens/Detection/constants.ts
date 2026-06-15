/**
 * Detection screen (E1a/E2) constants: the icon-hash table + Champions
 * legality index used by the detection pipeline, the species list for the
 * manual-override dropdown, and a default calibration layout for a Switch
 * team-preview screenshot.
 */
import iconHashesJson from '../../../data/iconHashes.json';
import championsLegalityJson from '../../../data/championsLegality.json';
import type { IconHashTable } from '../../../lib/detection/iconHashes';
import {
  buildLegalityIndex,
  type ChampionsLegalityTable,
} from '../../../lib/detection/championsLegality';
import type { NormalizedRect } from '../../../shared/types';
import type { SelectOption } from '../../ui';

/** Regulation-independent icon-hash table (1259 species). */
export const ICON_HASH_TABLE = iconHashesJson as IconHashTable;

/** Reg M-A legality table (253/1285 legal). */
export const LEGALITY_TABLE = championsLegalityJson as ChampionsLegalityTable;

/** speciesId -> legality entry, for flagging banned detections. */
export const LEGALITY_INDEX = buildLegalityIndex(LEGALITY_TABLE);

/** Species pickable in the override dropdown: the Champions Reg M-A legal pool, A-Z. */
export const SPECIES_OPTIONS: SelectOption[] = LEGALITY_TABLE.entries
  .filter((entry) => entry.legal)
  .map((entry) => ({ value: entry.speciesId, label: entry.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

/**
 * Six equally-spaced rects covering the opponent's team-preview icon row on a
 * 16:9 Nintendo Switch capture. Fully adjustable via the calibration overlay —
 * this is just a reasonable starting point so "Detect" works before any
 * manual calibration.
 */
export const DEFAULT_CALIBRATION_RECTS: NormalizedRect[] = Array.from({ length: 6 }, (_, i) => ({
  x: 0.16 + i * 0.1146,
  y: 0.1,
  w: 0.1,
  h: 0.14,
}));
