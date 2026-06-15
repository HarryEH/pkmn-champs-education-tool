import React, { useMemo } from 'react';
import { Card, TypeBadge, matchupTint } from '../ui';
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

function MatchupCell({ multiplier }: { multiplier: number }) {
  const tint = matchupTint(multiplier);
  return (
    <td
      style={{
        textAlign: 'center',
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 'var(--radius-sm)',
        minWidth: 56,
        background: tint.bg,
        color: tint.fg,
      }}
    >
      {tint.label}
    </td>
  );
}

/**
 * Two-table type matchup view for one opponent Pokémon (spec §4.3):
 *  - the opponent's defensive types' effectiveness against each of your mons'
 *    typing (how much your mons take from the opponent's STAB), and
 *  - the effectiveness of every move type your team carries against the
 *    opponent's typing (how well your team hits back).
 */
export function TypeMatchupGrid({ opponentLabel, opponentTypes, myMons }: TypeMatchupGridProps) {
  const moveTypes = useMemo(() => {
    const set = new Set<string>();
    for (const mon of myMons) {
      for (const t of mon.moveTypes ?? []) set.add(t);
    }
    return [...set].sort();
  }, [myMons]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card title={`${opponentLabel}'s STAB vs your team`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCellStyle} />
              {opponentTypes.map((t) => (
                <th key={t} style={headerCellStyle}>
                  <TypeBadge type={t} size="sm" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {myMons.map((mon) => (
              <tr key={mon.label}>
                <td style={rowLabelStyle}>{mon.label}</td>
                {opponentTypes.map((t) => (
                  <MatchupCell key={t} multiplier={getMatchup(t, mon.types)} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Your move types vs ${opponentLabel}`}>
        {moveTypes.length === 0 ? (
          <p style={{ color: 'var(--text-mut)', margin: 0, fontSize: 13 }}>
            No move types known for your team.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, textAlign: 'left' }}>Move type</th>
                <th style={headerCellStyle}>vs {opponentLabel}</th>
                <th style={{ ...headerCellStyle, textAlign: 'left' }}>Carried by</th>
              </tr>
            </thead>
            <tbody>
              {moveTypes.map((t) => (
                <tr key={t}>
                  <td style={rowLabelStyle}>
                    <TypeBadge type={t} size="sm" />
                  </td>
                  <MatchupCell multiplier={getMatchup(t, opponentTypes)} />
                  <td
                    style={{
                      ...rowLabelStyle,
                      fontSize: 12,
                      color: 'var(--text-mut)',
                      fontWeight: 400,
                    }}
                  >
                    {myMons
                      .filter((m) => m.moveTypes?.includes(t))
                      .map((m) => m.label)
                      .join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
