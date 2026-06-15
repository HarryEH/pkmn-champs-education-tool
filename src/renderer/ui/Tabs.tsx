import React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}

/**
 * Horizontal underline tab bar. Active tab gets a Pokéball-red underline and
 * bold weight; hover/focus states come from `.pk-tab` in theme/ui.css.
 */
export function Tabs({ items, activeId, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--border)' }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            className="pk-tab"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            style={{
              font: 'inherit',
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${active ? 'var(--poke-red)' : 'transparent'}`,
              color: active ? 'var(--text)' : 'var(--text-mut)',
              padding: '9px 14px',
              marginBottom: -1,
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
