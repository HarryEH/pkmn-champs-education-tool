import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Accessible switch: a visually-hidden native checkbox drives state (keyboard +
 * focus ring via theme/ui.css), with a Pokéball-red track and sliding thumb as
 * the visual. Focus-visible halo comes from `.pk-toggle-input:focus-visible`.
 */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        font: 'inherit',
      }}
    >
      <input
        type="checkbox"
        role="switch"
        className="pk-toggle-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      />
      <span
        className="pk-toggle-track"
        aria-hidden="true"
        style={{
          width: 38,
          height: 22,
          flex: '0 0 auto',
          borderRadius: 999,
          background: checked ? 'var(--poke-red)' : 'var(--surface-2)',
          border: `1px solid ${checked ? 'var(--poke-red)' : 'var(--border)'}`,
          position: 'relative',
        }}
      >
        <span
          className="pk-toggle-thumb"
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'var(--poke-white)',
            boxShadow: 'var(--shadow)',
          }}
        />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
