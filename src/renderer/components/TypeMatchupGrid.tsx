import React, { useMemo } from 'react';
import {
  Card,
  TypeBadge,
  DataTable,
  matchupTint,
  type DataTableColumn,
  type DataTableRow,
} from '../ui';
import { getMatchup } from '../../lib/calc/typeMatchup';

/** One of "your" Pokémon, for the matchup grid. */
export interface TypeMatchupMon {
  label: string;
  /** This mon's defensive type(s). */
  types: string[];
  /** This mon's non-Status move types, for the "your moves" grid. */
  moveTypes?: string[];
}

export interface TypeMatchupGridProps {
  /** The opponent Pokémon's display name, for table headers. */
  opponentLabel: string;
  /** The opponent's defensive type(s). */
  opponentTypes: string[];
  /** Your team (or active subset). */
  myMons: TypeMatchupMon[];
}

/** A matchup-tinted cell payload (label + tint via cellStyle). */
function matchupCell(multiplier: number): { node: React.ReactNode; style: React.CSSProperties } {
  const tint = matchupTint(multiplier);
  return {
    node: <span style={{ fontWeight: 700 }}>{tint.label}</span>,
    style: { background: tint.bg, color: tint.fg, textAlign: 'center' },
  };
}

/**
 * Two-table type matchup view for one opponent Pokémon (spec §4.3):
 *  - the opponent's defensive types' effectiveness against each of your mons'
 *    typing (how much your mons take from the opponent's STAB), and
 *  - the effectiveness of every move type your team carries against the
 *    opponent's typing (how well your team hits back).
 *
 * Re-based onto the compact `DataTable` primitive (density plan §2.3); the
 * matchup heatmap rides through per-cell `cellStyle`.
 */
export function TypeMatchupGrid({ opponentLabel, opponentTypes, myMons }: TypeMatchupGridProps) {
  const moveTypes = useMemo(() => {
    const set = new Set<string>();
    for (const mon of myMons) {
      for (const t of mon.moveTypes ?? []) set.add(t);
    }
    return [...set].sort();
  }, [myMons]);

  const stabColumns: DataTableColumn[] = [
    { key: 'mon', header: 'Pokémon', sticky: true },
    ...opponentTypes.map((t) => ({
      key: t,
      header: <TypeBadge type={t} size="sm" />,
      numeric: true,
    })),
  ];

  const stabRows: DataTableRow[] = myMons.map((mon) => {
    const cells: Record<string, React.ReactNode> = { mon: mon.label };
    const cellStyle: Record<string, React.CSSProperties> = {};
    for (const t of opponentTypes) {
      const { node, style } = matchupCell(getMatchup(t, mon.types));
      cells[t] = node;
      cellStyle[t] = style;
    }
    return { key: mon.label, cells, cellStyle };
  });

  const moveColumns: DataTableColumn[] = [
    { key: 'type', header: 'Move type', sticky: true },
    { key: 'vs', header: `vs ${opponentLabel}`, numeric: true },
    { key: 'carried', header: 'Carried by' },
  ];

  const moveRows: DataTableRow[] = moveTypes.map((t) => {
    const { node, style } = matchupCell(getMatchup(t, opponentTypes));
    return {
      key: t,
      cells: {
        type: <TypeBadge type={t} size="sm" />,
        vs: node,
        carried: (
          <span style={{ color: 'var(--text-mut)' }}>
            {myMons
              .filter((m) => m.moveTypes?.includes(t))
              .map((m) => m.label)
              .join(', ')}
          </span>
        ),
      },
      cellStyle: { vs: style },
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card title={`${opponentLabel}'s STAB vs your team`}>
        <DataTable columns={stabColumns} rows={stabRows} />
      </Card>

      <Card title={`Your move types vs ${opponentLabel}`}>
        {moveTypes.length === 0 ? (
          <p style={{ color: 'var(--text-mut)', margin: 0, fontSize: 'var(--font-md)' }}>
            No move types known for your team.
          </p>
        ) : (
          <DataTable columns={moveColumns} rows={moveRows} />
        )}
      </Card>
    </div>
  );
}
