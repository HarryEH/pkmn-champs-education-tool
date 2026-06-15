/**
 * Ground-truth fixture: a real Nintendo Switch team-preview screenshot
 * (`teampreview-jason.png`, native 1280x720, Champions Reg M-A) plus the six
 * normalized crop rects over the opponent's Pokémon renders and the confirmed
 * species in slot order.
 *
 * This is the regression anchor the detection rework is measured against — the
 * thing the old Showdown-icon pipeline never had. The rects were hand-tuned
 * against the actual frame (see scripts/detPreview.ts) to sit tightly on each
 * render the way a user's calibration boxes would.
 *
 * Source: IMG_2747.JPG (Switch album export) -> sips PNG. Opponent = "Jason".
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { NormalizedRect } from '../../../../shared/types';

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the committed 1280x720 team-preview PNG. */
export const JASON_FRAME_PATH = resolve(here, 'teampreview-jason.png');

/** Confirmed opponent species ids (slot order, top -> bottom of the red column). */
export const JASON_GROUND_TRUTH: readonly string[] = [
  'incineroar',
  'aerodactyl',
  'rotomwash',
  'garchomp',
  'excadrill',
  'tyranitar',
];

/**
 * Normalized (0-1) crop rects over each opponent render, tuned on the 1280x720
 * frame: render center x≈1100, panel centers y≈142/225/309/392/476/559 (uniform
 * ~83px pitch), box 104x82 px. Slot order matches JASON_GROUND_TRUTH.
 */
export const JASON_RECTS: NormalizedRect[] = [142, 225, 309, 392, 476, 559].map((cy) => ({
  x: 1048 / 1280,
  y: (cy - 41) / 720,
  w: 104 / 1280,
  h: 82 / 720,
}));
