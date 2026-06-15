import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Primary action button. Pokéball-red `primary`, outlined `secondary`, and a
 * minimal `ghost`. Interaction states (hover/active/focus/disabled) come from
 * `.pk-btn*` classes in theme/ui.css; inline styles set the resting palette.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  style,
  className,
  ...rest
}: ButtonProps) {
  const palette: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--poke-red)', color: 'var(--poke-white)', border: 'none' },
    secondary: {
      background: 'var(--surface)',
      color: 'var(--text)',
      border: '1px solid var(--border)',
    },
    ghost: { background: 'transparent', color: 'var(--text)', border: 'none' },
  };
  const pad: Record<string, string> = {
    sm: '5px 12px',
    md: '9px 16px',
    lg: '12px 22px',
  };
  const fontSize: Record<string, number> = { sm: 13, md: 14, lg: 15 };
  return (
    <button
      className={['pk-btn', `pk-btn--${variant}`, className].filter(Boolean).join(' ')}
      style={{
        font: 'inherit',
        fontWeight: 600,
        fontSize: fontSize[size],
        lineHeight: 1.2,
        borderRadius: 'var(--radius-sm)',
        padding: pad[size],
        cursor: 'pointer',
        ...palette[variant],
        ...style,
      }}
      {...rest}
    />
  );
}
