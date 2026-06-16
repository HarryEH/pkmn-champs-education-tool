import React from 'react';

export interface KoBadgeProps {
  /** KO headline, e.g. '1HKO' | '2HKO' | '3HKO' | '4HKO+' | '—'. */
  label: string;
  /** Secondary %: a point like '78%' or a range like '61–78%'. */
  pct?: string;
  /** good = you get the KO (green), bad = you get KO'd (red), neutral = muted. */
  tone: 'good' | 'bad' | 'neutral';
  /** Guaranteed KO — emphasise the headline. */
  guaranteed?: boolean;
}

const TONE_FG: Record<KoBadgeProps['tone'], string> = {
  good: 'var(--matchup-resist-fg)',
  bad: 'var(--matchup-weak-fg)',
  neutral: 'var(--text-mut)',
};

const TONE_BG: Record<KoBadgeProps['tone'], string> = {
  good: 'var(--matchup-resist-1)',
  bad: 'var(--matchup-weak-1)',
  neutral: 'transparent',
};

/**
 * Compact KO-math badge (density plan §2.3 / §4.3): the **KO count is the
 * headline**, the % is a faint secondary line. Colour is paired with the text
 * label so it never carries meaning alone (house rule). `guaranteed` bolds and
 * underlines the headline.
 */
export function KoBadge({ label, pct, tone, guaranteed }: KoBadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1.1,
        padding: 'var(--space-0) var(--space-1)',
        borderRadius: 'var(--radius-sm)',
        background: TONE_BG[tone],
        color: TONE_FG[tone],
      }}
    >
      <span
        style={{
          fontSize: 'var(--font-md)',
          fontWeight: guaranteed ? 800 : 700,
          textDecoration: guaranteed ? 'underline' : undefined,
        }}
      >
        {label}
      </span>
      {pct != null && (
        <span
          style={{
            fontSize: 'var(--font-2xs)',
            fontFamily: 'var(--font-num)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-mut)',
          }}
        >
          {pct}
        </span>
      )}
    </span>
  );
}
