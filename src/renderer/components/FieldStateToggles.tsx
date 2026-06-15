import React from 'react';
import { Card, Toggle } from '../ui';
import type { FieldState, SideState } from '../../shared/types';

export interface FieldStateTogglesProps {
  field: FieldState;
  /** Patch the session field state (shallow-merged by the store). */
  onChange: (patch: Partial<FieldState>) => void;
}

type Weather = NonNullable<FieldState['weather']>;
type Terrain = NonNullable<FieldState['terrain']>;

const WEATHERS: { id: Weather; label: string }[] = [
  { id: 'sun', label: 'Sun' },
  { id: 'rain', label: 'Rain' },
  { id: 'sand', label: 'Sand' },
  { id: 'snow', label: 'Snow' },
];

const TERRAINS: { id: Terrain; label: string }[] = [
  { id: 'electric', label: 'Electric' },
  { id: 'grassy', label: 'Grassy' },
  { id: 'misty', label: 'Misty' },
  { id: 'psychic', label: 'Psychic' },
];

const groupLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-mut)',
  marginBottom: 6,
};

/** A mutually-exclusive segmented control with a "None" reset. */
function Segmented<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T | undefined;
  options: { id: T; label: string }[];
  onSelect: (value: T | undefined) => void;
}) {
  const all = [{ id: undefined as T | undefined, label: 'None' }, ...options];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {all.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onSelect(opt.id)}
            style={{
              font: 'inherit',
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              padding: '5px 12px',
              borderRadius: 999,
              border: `1px solid ${active ? 'var(--poke-red)' : 'var(--border)'}`,
              background: active ? 'var(--poke-red)' : 'transparent',
              color: active ? 'var(--poke-white)' : 'var(--text)',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled column of per-side screen toggles (Tailwind / Reflect / etc.). */
function SideToggles({
  title,
  side,
  onChange,
}: {
  title: string;
  side: SideState | undefined;
  onChange: (patch: Partial<SideState>) => void;
}) {
  return (
    <div>
      <div style={groupLabelStyle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Toggle
          checked={!!side?.tailwind}
          onChange={(v) => onChange({ tailwind: v })}
          label="Tailwind"
        />
        <Toggle
          checked={!!side?.reflect}
          onChange={(v) => onChange({ reflect: v })}
          label="Reflect"
        />
        <Toggle
          checked={!!side?.lightScreen}
          onChange={(v) => onChange({ lightScreen: v })}
          label="Light Screen"
        />
        <Toggle
          checked={!!side?.auroraVeil}
          onChange={(v) => onChange({ auroraVeil: v })}
          label="Aurora Veil"
        />
      </div>
    </div>
  );
}

/**
 * Field-state control panel (plan §5 WS-F): weather, terrain, Trick Room, and
 * per-side Tailwind/screens. By convention `attackerSide` is YOUR side and
 * `defenderSide` is the opponent's; the In-Battle screen swaps them when
 * computing the opponent-attacking damage table.
 */
export function FieldStateToggles({ field, onChange }: FieldStateTogglesProps) {
  return (
    <Card title="Field conditions">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div style={groupLabelStyle}>Weather</div>
          <Segmented
            value={field.weather}
            options={WEATHERS}
            onSelect={(weather) => onChange({ weather })}
          />
        </div>
        <div>
          <div style={groupLabelStyle}>Terrain</div>
          <Segmented
            value={field.terrain}
            options={TERRAINS}
            onSelect={(terrain) => onChange({ terrain })}
          />
        </div>
        <div>
          <div style={groupLabelStyle}>Room</div>
          <Toggle
            checked={!!field.trickRoom}
            onChange={(v) => onChange({ trickRoom: v })}
            label="Trick Room"
          />
        </div>
        <SideToggles
          title="Your side"
          side={field.attackerSide}
          onChange={(patch) => onChange({ attackerSide: { ...field.attackerSide, ...patch } })}
        />
        <SideToggles
          title="Opponent side"
          side={field.defenderSide}
          onChange={(patch) => onChange({ defenderSide: { ...field.defenderSide, ...patch } })}
        />
      </div>
    </Card>
  );
}
