import React from 'react';

export interface SpeedArrowProps {
  /** up = you outspeed, down = you're outsped, tie = speed-tie / range overlap. */
  direction: 'up' | 'down' | 'tie';
  /** Speed difference, surfaced as adjacent text / tooltip (never glyph alone). */
  delta?: number;
  /** Render the numeric delta inline next to the glyph (else it's a title tooltip). */
  showDelta?: boolean;
}

const GLYPH: Record<SpeedArrowProps['direction'], string> = {
  up: '▲',
  down: '▼',
  tie: '≈',
};

const COLOR: Record<SpeedArrowProps['direction'], string> = {
  up: 'var(--ok)',
  down: 'var(--bad)',
  tie: 'var(--warn)',
};

const A11Y_LABEL: Record<SpeedArrowProps['direction'], string> = {
  up: 'outspeed',
  down: 'outsped',
  tie: 'speed tie',
};

/**
 * Compact speed-order glyph (density plan §2.3): ▲ outspeed (green) / ▼ outsped
 * (red) / ≈ tie (amber). The numeric `delta` is always available as adjacent
 * text (`showDelta`) or a `title` tooltip, so colour/glyph never carry meaning
 * alone (house rule).
 */
export function SpeedArrow({ direction, delta, showDelta }: SpeedArrowProps) {
  const label = A11Y_LABEL[direction];
  const deltaText =
    delta == null ? undefined : `${delta > 0 ? '+' : ''}${delta}`;
  const title = deltaText ? `${label} (${deltaText})` : label;
  return (
    <span
      title={title}
      aria-label={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-0)',
        fontSize: 'var(--font-sm)',
        color: COLOR[direction],
        fontWeight: 700,
      }}
    >
      <span aria-hidden="true">{GLYPH[direction]}</span>
      {showDelta && deltaText != null && (
        <span
          style={{
            fontSize: 'var(--font-2xs)',
            fontFamily: 'var(--font-num)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-mut)',
          }}
        >
          {deltaText}
        </span>
      )}
    </span>
  );
}
