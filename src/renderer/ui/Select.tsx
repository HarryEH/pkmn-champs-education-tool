import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'onChange'
> {
  options: SelectOption[];
  onChange: (value: string) => void;
}

/**
 * Native select with a custom chevron and themed border/focus. The `.pk-select`
 * class (theme/ui.css) draws the caret and the red focus ring.
 */
export function Select({ options, onChange, style, className, ...rest }: SelectProps) {
  return (
    <select
      className={['pk-select', className].filter(Boolean).join(' ')}
      onChange={(e) => onChange(e.target.value)}
      style={{
        font: 'inherit',
        fontSize: 14,
        padding: '7px 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        cursor: 'pointer',
        ...style,
      }}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
