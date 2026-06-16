import React from 'react';
import { Card, DataTable, type DataTableColumn, type DataTableRow } from '../ui';
import { calcDamage, type Combatant } from '../../lib/calc/damageCalc';
import type { FieldState } from '../../shared/types';

/** One row: an attacker + a single move it knows. */
export interface DamageRowSpec {
  /** Row label, e.g. "Incineroar — Flare Blitz". */
  label: string;
  attacker: Combatant;
  move: string;
}

/** One column: a defending Pokémon. */
export interface DamageColSpec {
  label: string;
  defender: Combatant;
}

export interface DamageCalcTableProps {
  title: string;
  rows: DamageRowSpec[];
  columns: DamageColSpec[];
  field?: FieldState;
}

/** Visual heatmap band for a max-roll percentage, reusing the matchup palette. */
function damageTint(maxPct: number): { bg: string; fg: string } {
  if (maxPct >= 100) return { bg: 'var(--matchup-weak-2)', fg: 'var(--matchup-weak-fg)' };
  if (maxPct >= 50) return { bg: 'var(--matchup-weak-1)', fg: 'var(--matchup-weak-fg)' };
  if (maxPct >= 25) return { bg: 'transparent', fg: 'var(--text)' };
  return { bg: 'var(--matchup-resist-1)', fg: 'var(--matchup-resist-fg)' };
}

function formatKo(koChance: number | undefined): string | null {
  if (koChance == null || koChance <= 0) return null;
  if (koChance >= 1) return 'KO';
  return `${Math.round(koChance * 100)}% KO`;
}

/**
 * Damage matrix (spec §4.3): one row per attacker+move, one column per
 * defender, each cell the min-max % of the defender's HP plus KO chance.
 * Moves that fail to resolve (unknown move id) render as "—" rather than
 * breaking the table. Re-based onto the compact `DataTable` primitive (density
 * plan §2.3) — the damage heatmap rides through per-cell `cellStyle`.
 */
export function DamageCalcTable({ title, rows, columns, field }: DamageCalcTableProps) {
  const tableColumns: DataTableColumn[] = [
    { key: 'move', header: 'Move', sticky: true },
    ...columns.map((col) => ({ key: col.label, header: col.label, numeric: true })),
  ];

  const tableRows: DataTableRow[] = rows.map((row) => {
    const cells: Record<string, React.ReactNode> = { move: row.label };
    const cellStyle: Record<string, React.CSSProperties> = {};
    for (const col of columns) {
      let result;
      try {
        result = calcDamage(row.attacker, col.defender, row.move, field);
      } catch {
        result = null;
      }
      if (!result) {
        cells[col.label] = '—';
        cellStyle[col.label] = { color: 'var(--text-mut)', textAlign: 'center' };
        continue;
      }
      const tint = damageTint(result.maxPct);
      const ko = formatKo(result.koChance);
      cells[col.label] = (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>
            {result.minPct}–{result.maxPct}%
          </div>
          {ko && <div style={{ fontSize: 'var(--font-xs)' }}>{ko}</div>}
        </div>
      );
      cellStyle[col.label] = { background: tint.bg, color: tint.fg, textAlign: 'center' };
    }
    return { key: row.label, cells, cellStyle };
  });

  return (
    <Card title={title}>
      {rows.length === 0 || columns.length === 0 ? (
        <p style={{ color: 'var(--text-mut)', margin: 0, fontSize: 'var(--font-md)' }}>
          No moves available to compare.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <DataTable columns={tableColumns} rows={tableRows} />
        </div>
      )}
    </Card>
  );
}
