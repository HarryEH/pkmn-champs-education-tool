import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Optional header title rendered above the card body. */
  title?: React.ReactNode;
  /** Optional content rendered at the right of the header. */
  actions?: React.ReactNode;
  /** Adds hover affordance (lift + border highlight) for clickable cards. */
  interactive?: boolean;
}

/**
 * Rounded surface card with an optional header row. `interactive` adds a hover
 * lift for clickable cards. Hover/border transitions live in theme/ui.css.
 */
export function Card({
  title,
  actions,
  interactive,
  children,
  style,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={['pk-card', interactive && 'pk-card--interactive', className]
        .filter(Boolean)
        .join(' ')}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: 'var(--space-4)',
        ...style,
      }}
      {...rest}
    >
      {(title || actions) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
            paddingBottom: 'var(--space-3)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {title && (
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: 0.1 }}>
              {title}
            </h3>
          )}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
