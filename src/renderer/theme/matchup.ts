/**
 * Matchup-cell tint scale (plan §6, consumed by WS-E's matchup grid).
 *
 * Maps a damage multiplier (the defender's effectiveness against an incoming
 * move) to a background tint plus a short text label. Colour is never the only
 * signal — every cell pairs the tint with a label (e.g. "2x", "1/2x", "0x") so
 * the grid stays readable for colour-blind users.
 *
 * Scale:
 *   0x        -> grey      (immune)
 *   1/4x,1/2x -> green     (resisted; defender takes less)
 *   1x        -> plain     (neutral)
 *   2x,4x     -> red       (weak; defender takes more)
 *
 * Tints reference CSS custom properties where a flat fill is wanted, but the
 * graded weak/resist steps use explicit RGBA so the two intensities (1/4 vs
 * 1/2, 2x vs 4x) are visually distinct in both light and battle modes.
 */
export interface MatchupTint {
  /** CSS background value for the cell. */
  bg: string;
  /** Readable text colour to place on top of `bg`. */
  fg: string;
  /** Short human label, e.g. "0x", "1/4x", "1/2x", "1x", "2x", "4x". */
  label: string;
}

/** Canonical multipliers a single matchup cell can take. */
export type MatchupMultiplier = 0 | 0.25 | 0.5 | 1 | 2 | 4;

const TINTS: Record<MatchupMultiplier, MatchupTint> = {
  // Immune — neutral grey, clearly "nothing happens".
  0: { bg: 'var(--matchup-immune)', fg: 'var(--text-mut)', label: '0x' },
  // Doubly resisted — strong green.
  0.25: { bg: 'var(--matchup-resist-2)', fg: 'var(--matchup-resist-fg)', label: '1/4x' },
  // Resisted — soft green.
  0.5: { bg: 'var(--matchup-resist-1)', fg: 'var(--matchup-resist-fg)', label: '1/2x' },
  // Neutral — plain surface.
  1: { bg: 'transparent', fg: 'var(--text)', label: '1x' },
  // Weak — soft red.
  2: { bg: 'var(--matchup-weak-1)', fg: 'var(--matchup-weak-fg)', label: '2x' },
  // Doubly weak — strong red.
  4: { bg: 'var(--matchup-weak-2)', fg: 'var(--matchup-weak-fg)', label: '4x' },
};

/** Snap an arbitrary multiplier to the nearest canonical matchup step. */
function snap(multiplier: number): MatchupMultiplier {
  if (multiplier <= 0) return 0;
  if (multiplier < 0.375) return 0.25;
  if (multiplier < 0.75) return 0.5;
  if (multiplier < 1.5) return 1;
  if (multiplier < 3) return 2;
  return 4;
}

/**
 * Return the tint + label for a damage multiplier. Accepts the exact canonical
 * values (0, 0.25, 0.5, 1, 2, 4) as well as any in-between value, which is
 * snapped to the nearest step.
 */
export function matchupTint(multiplier: number): MatchupTint {
  return TINTS[snap(multiplier)];
}
