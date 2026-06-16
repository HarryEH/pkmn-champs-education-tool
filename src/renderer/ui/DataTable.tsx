import React from 'react';

export interface DataTableColumn {
  /** Stable key, used to look up cells in each row. */
  key: string;
  header: React.ReactNode;
  /** Right-align + tabular-nums for aligned number columns. */
  numeric?: boolean;
  /** Pin this column horizontally (typically the first, label, column). */
  sticky?: boolean;
  width?: number | string;
}

export interface DataTableRow {
  key: string;
  cells: Record<string, React.ReactNode>;
  /** Per-cell style override, keyed by column key (for heatmap backgrounds). */
  cellStyle?: Record<string, React.CSSProperties>;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  caption?: React.ReactNode;
}

const HAIRLINE = '1px solid var(--border)';

const baseCellStyle: React.CSSProperties = {
  height: 'var(--density-row-h)',
  padding: '0 var(--space-2)',
  fontSize: 'var(--font-sm)',
  borderBottom: HAIRLINE,
  whiteSpace: 'nowrap',
};

const headerCellStyle: React.CSSProperties = {
  height: 'var(--density-row-h)',
  padding: '0 var(--space-2)',
  fontSize: 'var(--font-xs)',
  fontWeight: 600,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
  color: 'var(--text-mut)',
  borderBottom: HAIRLINE,
  whiteSpace: 'nowrap',
  background: 'var(--surface)',
};

/**
 * Compact, presentational table primitive (density plan §2.3): sticky header
 * row + sticky first column, `--density-row-h` rows, hairline borders (no
 * zebra), tabular-nums on numeric columns. `DamageCalcTable`, `SpeedTierList`,
 * and `TypeMatchupGrid` re-base onto it for a consistent, tight look. Per-cell
 * backgrounds (heatmaps) flow through each row's `cellStyle`.
 */
export function DataTable({ columns, rows, caption }: DataTableProps) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'separate',
        borderSpacing: 0,
        fontFamily: 'var(--font-ui)',
      }}
    >
      {caption != null && (
        <caption
          style={{
            captionSide: 'top',
            textAlign: 'left',
            fontSize: 'var(--font-xs)',
            color: 'var(--text-mut)',
            paddingBottom: 'var(--space-1)',
          }}
        >
          {caption}
        </caption>
      )}
      <thead>
        <tr>
          {columns.map((col, i) => (
            <th
              key={col.key}
              style={{
                ...headerCellStyle,
                width: col.width,
                textAlign: col.numeric ? 'right' : 'left',
                position: 'sticky',
                top: 0,
                zIndex: col.sticky ? 3 : 2,
                left: col.sticky ? 0 : undefined,
                ...(i === 0 ? { borderTopLeftRadius: 'var(--radius-sm)' } : null),
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {columns.map((col) => {
              const override = row.cellStyle?.[col.key];
              return (
                <td
                  key={col.key}
                  style={{
                    ...baseCellStyle,
                    width: col.width,
                    textAlign: col.numeric ? 'right' : 'left',
                    fontVariantNumeric: col.numeric ? 'tabular-nums' : undefined,
                    fontFamily: col.numeric ? 'var(--font-num)' : undefined,
                    ...(col.sticky
                      ? { position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface)' }
                      : null),
                    ...override,
                  }}
                >
                  {row.cells[col.key]}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
