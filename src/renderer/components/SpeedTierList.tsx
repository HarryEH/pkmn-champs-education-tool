import React, { useMemo } from 'react';
import { Card, Stat, DataTable, type DataTableColumn, type DataTableRow, type StatProps } from '../ui';
import {
  buildSpeedTiers,
  type SpeedModifiers,
  type SpeedTierInput,
} from '../../lib/calc/speedTiers';

export interface SpeedTierListProps {
  /** Your team (or active subset). */
  mine: SpeedTierInput[];
  /** The opponent (typically one mon's common spread, possibly with variants). */
  opponent: SpeedTierInput[];
  /** Reverses sort order (slowest first) to mirror Trick Room. */
  trickRoom?: boolean;
}

type Tone = NonNullable<StatProps['tone']>;
type Side = 'mine' | 'opponent';

interface Row {
  side: Side;
  label: string;
  effectiveSpeed: number;
  modifiers: SpeedModifiers;
  tone?: Tone;
}

/** Does `a` act before `b` at these effective speeds, given the turn order? */
function actsBefore(a: number, b: number, trickRoom: boolean): boolean {
  return trickRoom ? a < b : a > b;
}

/**
 * Tone for one entry, comparing it against every entry on the other side:
 *  - "faster" (green) when this entry always acts first vs the other side —
 *    for a "mine" entry that's good for you; for an "opponent" entry it means
 *    every one of your mons outspeeds it, which is also good for you.
 *  - "slower" (red) is the mirror — bad for you either way.
 *  - "tie" (amber) when the outcome depends on the specific matchup.
 */
function speedTone(
  side: Side,
  effectiveSpeed: number,
  otherSpeeds: number[],
  trickRoom: boolean,
): Tone | undefined {
  if (otherSpeeds.length === 0) return undefined;
  const alwaysFirst = otherSpeeds.every((other) => actsBefore(effectiveSpeed, other, trickRoom));
  const alwaysLast = otherSpeeds.every((other) => actsBefore(other, effectiveSpeed, trickRoom));
  if (side === 'mine') {
    if (alwaysFirst) return 'faster';
    if (alwaysLast) return 'slower';
    return 'tie';
  }
  // Opponent entry: framed from your perspective — an opponent that always
  // acts last (your mons all act first) is good for you ("faster").
  if (alwaysLast) return 'faster';
  if (alwaysFirst) return 'slower';
  return 'tie';
}

function modifierLabels(mods: SpeedModifiers): string[] {
  const labels: string[] = [];
  if (mods.weatherSpeedBoost) labels.push('Weather ×2');
  if (mods.tailwind) labels.push('Tailwind');
  if (mods.choiceScarf) labels.push('Scarf');
  if (mods.paralysis) labels.push('Para');
  if (mods.stages) labels.push(mods.stages > 0 ? `+${mods.stages}` : `${mods.stages}`);
  return labels;
}

/**
 * Merged, sorted speed-tier list (spec §4.3): "your" team and the opponent's
 * common spread(s) interleaved by effective speed, with a colour-blind-safe
 * tone showing who's favoured at each matchup. Re-based onto the compact
 * `DataTable` primitive (density plan §2.3); the per-row speed tone keeps riding
 * on the `Stat` chip.
 */
export function SpeedTierList({ mine, opponent, trickRoom = false }: SpeedTierListProps) {
  const rows = useMemo<Row[]>(() => {
    const mineEntries = buildSpeedTiers(mine, { trickRoom }).map((e) => ({
      side: 'mine' as const,
      ...e,
    }));
    const oppEntries = buildSpeedTiers(opponent, { trickRoom }).map((e) => ({
      side: 'opponent' as const,
      ...e,
    }));
    const mineSpeeds = mineEntries.map((e) => e.effectiveSpeed);
    const oppSpeeds = oppEntries.map((e) => e.effectiveSpeed);

    const combined = [...mineEntries, ...oppEntries].map((entry) => ({
      side: entry.side,
      label: entry.label,
      effectiveSpeed: entry.effectiveSpeed,
      modifiers: entry.modifiers,
      tone: speedTone(
        entry.side,
        entry.effectiveSpeed,
        entry.side === 'mine' ? oppSpeeds : mineSpeeds,
        trickRoom,
      ),
    }));

    return combined
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const diff = trickRoom
          ? a.entry.effectiveSpeed - b.entry.effectiveSpeed
          : b.entry.effectiveSpeed - a.entry.effectiveSpeed;
        return diff !== 0 ? diff : a.index - b.index;
      })
      .map(({ entry }) => entry);
  }, [mine, opponent, trickRoom]);

  const columns: DataTableColumn[] = [
    { key: 'rank', header: '#', numeric: true, sticky: true, width: 36 },
    { key: 'mon', header: 'Pokémon' },
    { key: 'speed', header: 'Speed', numeric: true },
    { key: 'modifiers', header: 'Modifiers' },
  ];

  const tableRows: DataTableRow[] = rows.map((row, i) => ({
    key: `${row.side}-${row.label}-${i}`,
    cells: {
      rank: i + 1,
      mon: (
        <>
          {row.label}{' '}
          <span style={{ fontSize: 'var(--font-xs)', fontWeight: 400, color: 'var(--text-mut)' }}>
            {row.side === 'mine' ? '(you)' : '(opp)'}
          </span>
        </>
      ),
      speed: <Stat label="Spe" value={row.effectiveSpeed} tone={row.tone} />,
      modifiers: (
        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-mut)' }}>
          {modifierLabels(row.modifiers).join(', ') || '—'}
        </span>
      ),
    },
    cellStyle: {
      speed: { textAlign: 'center' },
    },
  }));

  return (
    <Card title={trickRoom ? 'Speed order (Trick Room)' : 'Speed order'}>
      <DataTable columns={columns} rows={tableRows} />
    </Card>
  );
}
