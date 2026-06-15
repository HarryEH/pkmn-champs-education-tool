import React from 'react';
import { Card } from '../ui';
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

const headerCellStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '4px 10px',
  fontSize: 11,
  color: 'var(--text-mut)',
};

const rowLabelStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const cellStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '6px 10px',
  fontSize: 12,
  borderRadius: 'var(--radius-sm)',
  minWidth: 64,
};

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
 * breaking the table.
 */
export function DamageCalcTable({ title, rows, columns, field }: DamageCalcTableProps) {
  return (
    <Card title={title}>
      {rows.length === 0 || columns.length === 0 ? (
        <p style={{ color: 'var(--text-mut)', margin: 0, fontSize: 13 }}>
          No moves available to compare.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, textAlign: 'left' }}>Move</th>
                {columns.map((col) => (
                  <th key={col.label} style={headerCellStyle}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td style={rowLabelStyle}>{row.label}</td>
                  {columns.map((col) => {
                    let result;
                    try {
                      result = calcDamage(row.attacker, col.defender, row.move, field);
                    } catch {
                      result = null;
                    }
                    if (!result) {
                      return (
                        <td key={col.label} style={{ ...cellStyle, color: 'var(--text-mut)' }}>
                          —
                        </td>
                      );
                    }
                    const tint = damageTint(result.maxPct);
                    const ko = formatKo(result.koChance);
                    return (
                      <td
                        key={col.label}
                        style={{ ...cellStyle, background: tint.bg, color: tint.fg }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {result.minPct}–{result.maxPct}%
                        </div>
                        {ko && <div style={{ fontSize: 11 }}>{ko}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
