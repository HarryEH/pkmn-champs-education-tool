import React from 'react';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  /** Emphasise this stat (e.g. Speed on PokemonCard) — Pokéball-red chip. */
  emphasis?: boolean;
  /**
   * Optional speed-flag tint for the emphasis chip. Pairs a colour with the
   * value text so colour is never the only signal (colour-blind safety):
   *   faster -> green, tie -> amber, slower -> red.
   */
  tone?: 'faster' | 'tie' | 'slower';
}

const TONE_BG: Record<NonNullable<StatProps['tone']>, string> = {
  faster: 'var(--speed-faster-bg)',
  tie: 'var(--speed-tie-bg)',
  slower: 'var(--speed-slower-bg)',
};
const TONE_FG: Record<NonNullable<StatProps['tone']>, string> = {
  faster: 'var(--ok)',
  tie: 'var(--warn)',
  slower: 'var(--bad)',
};

/**
 * Compact stat readout. `emphasis` renders a filled Pokéball-red chip (Speed on
 * a Pokémon card). `tone` instead renders a tinted speed-flag chip with matching
 * text colour, for outspeed/tie/outsped indicators.
 */
export function Stat({ label, value, emphasis, tone }: StatProps) {
  const toned = !!tone;
  const background = toned ? TONE_BG[tone] : emphasis ? 'var(--poke-red)' : 'transparent';
  const labelColor = toned ? 'var(--text-mut)' : emphasis ? 'var(--poke-white)' : 'var(--text-mut)';
  const valueColor = toned ? TONE_FG[tone] : emphasis ? 'var(--poke-white)' : 'var(--text)';
  return (
    <div
      className="pk-stat"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: 'var(--radius-sm)',
        background,
        color: valueColor,
        minWidth: 38,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.3, color: labelColor }}>
        {label}
      </span>
      <span style={{ fontWeight: emphasis || toned ? 800 : 600, fontSize: 13, color: valueColor }}>
        {value}
      </span>
    </div>
  );
}
