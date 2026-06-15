import React from 'react';
import { TYPE_COLORS, typeTextColor } from '../theme/types';

export interface TypeBadgeProps {
  type: string;
  size?: 'sm' | 'md';
}

/**
 * The single most-reused atom: a type-coloured pill with a readable text
 * label. Phase-0 stub; WS-G refines.
 */
export function TypeBadge({ type, size = 'md' }: TypeBadgeProps) {
  const known = type in TYPE_COLORS;
  const bg = known ? TYPE_COLORS[type] : 'var(--surface-2)';
  return (
    <span
      className="pk-type-badge"
      style={{
        display: 'inline-block',
        background: bg,
        color: known ? typeTextColor(type) : 'var(--text-mut)',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: size === 'sm' ? 10 : 12,
        lineHeight: 1,
        padding: size === 'sm' ? '3px 8px' : '5px 11px',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {type}
    </span>
  );
}
