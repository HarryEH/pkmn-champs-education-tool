import React, { useMemo } from 'react';
import { Icons } from '@pkmn/img';
import { Card, Stat, TypeBadge } from '../ui';
import type { MyPokemon } from '../../shared/types';
import { computeStat } from '../store/teams';

export interface PokemonCardProps {
  mon: MyPokemon;
}

/**
 * Parse the inline-CSS declaration string that `Icons.getPokemon` returns
 * (e.g. `display:inline-block;width:40px;...;background:... -160px -2220px;`)
 * into a React style object. The icon is a single cell of a sprite sheet, so
 * the background-position carried in `style` is load-bearing — we must use it
 * verbatim rather than reconstructing it.
 */
function cssStringToStyle(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;
    // camelCase the CSS property name for React's style object.
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[camel] = value;
  }
  return style as React.CSSProperties;
}

/** The six stats, in canonical Showdown order, with display labels. */
const STAT_ORDER: { key: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'Atk' },
  { key: 'def', label: 'Def' },
  { key: 'spa', label: 'SpA' },
  { key: 'spd', label: 'SpD' },
  { key: 'spe', label: 'Spe' },
];

/** Render a friendly EV spread like "244 HP / 4 Atk / 12 Def / 124 SpD / 124 Spe". */
function formatEvs(evs: MyPokemon['set']['evs']): string {
  if (!evs) return '—';
  const parts = STAT_ORDER.filter(({ key }) => (evs[key] ?? 0) > 0).map(
    ({ key, label }) => `${evs[key]} ${label}`,
  );
  return parts.length ? parts.join(' / ') : '—';
}

/** A small dim "label: value" metadata row. */
function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
      <span style={{ color: 'var(--text-mut)' }}>{label}: </span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/** A single team member rendered with computed stats; Speed is emphasised. */
export function PokemonCard({ mon }: PokemonCardProps) {
  const { set, types } = mon;

  const iconStyle = useMemo(() => {
    const icon = Icons.getPokemon(set.species ?? set.name ?? '');
    return cssStringToStyle(icon.style);
  }, [set.species, set.name]);

  const stats = useMemo(
    () => STAT_ORDER.map(({ key, label }) => ({ key, label, value: computeStat(key, set) })),
    [set],
  );

  const displayName = set.name && set.name !== set.species ? set.name : (set.species ?? 'Unknown');

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={iconStyle} aria-hidden />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
            <span style={{ fontWeight: 800, fontSize: 16 }}>{displayName}</span>
            {set.name && set.name !== set.species && (
              <span style={{ fontSize: 12, color: 'var(--text-mut)' }}>({set.species})</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2px var(--space-4)',
          marginTop: 'var(--space-3)',
        }}
      >
        <Meta label="Item" value={set.item} />
        <Meta label="Ability" value={set.ability} />
        <Meta label="Tera" value={set.teraType && <TypeBadge type={set.teraType} size="sm" />} />
        <Meta label="Nature" value={set.nature} />
      </div>

      <div style={{ marginTop: 'var(--space-2)' }}>
        <Meta label="EVs" value={formatEvs(set.evs)} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-1)',
          marginTop: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        {stats.map((s) => (
          <Stat key={s.key} label={s.label} value={s.value} emphasis={s.key === 'spe'} />
        ))}
      </div>
    </Card>
  );
}
