import React, { useMemo, useState } from 'react';
import { Button, KoBadge, SpeedArrow } from '../ui';
import { pokemonIconStyle } from './pokemonIcon';
import { gen } from '../../lib/calc/gen';
import type { MyPokemon, MyTeam, OpponentTeam, PokemonSet, UsageData } from '../../shared/types';
import {
  buildMatrixCell,
  representativeOpponent,
  type MatrixCell,
} from '../screens/Detection/matrixBuild';

export type MatrixViewMode = 'offense' | 'defense' | 'speed' | 'verdict';

/** The exact set for an opponent slot, if one was provided (PokePaste source). */
function setFor(
  speciesId: string | null,
  sets: Record<string, PokemonSet> | undefined,
): PokemonSet | undefined {
  return speciesId ? sets?.[speciesId] : undefined;
}

export interface MatchupMatrixProps {
  myTeam: MyTeam;
  opponent: OpponentTeam;
  usage: UsageData | null;
  /** Exact opponent sets by species id (PokePaste source); drives exact calc. */
  opponentSets?: Record<string, PokemonSet>;
  viewMode: MatrixViewMode;
  onViewModeChange: (mode: MatrixViewMode) => void;
  /** Click a cell or column header to open the drill-down drawer for that opponent. */
  onSelectCell?: (myIndex: number, theirIndex: number) => void;
}

const VIEW_MODES: { id: MatrixViewMode; label: string }[] = [
  { id: 'verdict', label: 'Verdict' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'speed', label: 'Speed' },
];

const CELL_W = 140;
const CELL_H = 52;
const LABEL_W = 132;
/** Floor per data column: below this the grid scrolls instead of crushing cells. */
const MIN_CELL_W = 116;

/** Tint background for a cell's net verdict (paired always with a glyph/label). */
const VERDICT_BG: Record<MatrixCell['verdict'], string> = {
  win: 'var(--matchup-resist-1)',
  lose: 'var(--matchup-weak-1)',
  even: 'transparent',
};

const VERDICT_GLYPH: Record<MatrixCell['verdict'], string> = {
  win: '✓',
  lose: '✕',
  even: '=',
};

const VERDICT_FG: Record<MatrixCell['verdict'], string> = {
  win: 'var(--matchup-resist-fg)',
  lose: 'var(--matchup-weak-fg)',
  even: 'var(--text-mut)',
};

const VERDICT_LABEL: Record<MatrixCell['verdict'], string> = {
  win: 'You win',
  lose: 'They win',
  even: 'Even',
};

function myDisplayName(mon: MyPokemon): string {
  return mon.set.name && mon.set.name !== mon.set.species
    ? mon.set.name
    : (mon.set.species ?? 'Unknown');
}

function mySpeciesId(mon: MyPokemon): string {
  return gen.species.get(mon.set.species ?? '')?.id ?? mon.set.species ?? '';
}

/**
 * Heatmap background for a damage % (your-offense / their-offense single-axis
 * views): stronger tint at higher %. `tone` keys which palette to use.
 */
function damageHeat(pct: number | null | undefined, tone: 'good' | 'bad'): string {
  if (pct == null) return 'transparent';
  const palette = tone === 'good' ? 'resist' : 'weak';
  if (pct >= 100) return `var(--matchup-${palette}-2)`;
  if (pct >= 50) return `var(--matchup-${palette}-1)`;
  return 'transparent';
}

/** The full combined cell (Verdict default view): speed + both KOs + tint. */
function CombinedCell({ cell }: { cell: MatrixCell }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        padding: 'var(--space-0)',
        rowGap: 1,
      }}
    >
      {/* center watermark: net-verdict glyph for fastest scan */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--font-md)',
          fontWeight: 900,
          color: VERDICT_FG[cell.verdict],
          opacity: 0.4,
          pointerEvents: 'none',
        }}
      >
        {VERDICT_GLYPH[cell.verdict]}
      </span>
      {/* top-left: speed */}
      <div style={{ justifySelf: 'start' }}>
        <SpeedArrow direction={cell.speed} delta={cell.speedDelta ?? undefined} showDelta />
      </div>
      {/* top-right: your KO on them */}
      <div style={{ justifySelf: 'end' }}>
        <KoBadge label={cell.myOffense.ko.label} tone="good" guaranteed={cell.myOffense.ko.guaranteed} />
      </div>
      {/* bottom-left: your best % to them */}
      <div
        style={{
          justifySelf: 'start',
          fontSize: 'var(--font-2xs)',
          fontFamily: 'var(--font-num)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--matchup-resist-fg)',
        }}
      >
        {cell.myOffense.pct ?? '—'}
      </div>
      {/* bottom-right: their best % to you */}
      <div
        style={{
          justifySelf: 'end',
          fontSize: 'var(--font-2xs)',
          fontFamily: 'var(--font-num)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--matchup-weak-fg)',
        }}
      >
        {cell.theirOffense.pct ?? '—'}
      </div>
    </div>
  );
}

/** Single-axis cell content per view mode. */
function CellContent({ cell, viewMode }: { cell: MatrixCell; viewMode: MatrixViewMode }) {
  if (viewMode === 'offense') {
    return (
      <KoBadge
        label={cell.myOffense.ko.label}
        pct={cell.myOffense.pct ?? undefined}
        tone="good"
        guaranteed={cell.myOffense.ko.guaranteed}
      />
    );
  }
  if (viewMode === 'defense') {
    return (
      <KoBadge
        label={cell.theirOffense.ko.label}
        pct={cell.theirOffense.pct ?? undefined}
        tone="bad"
        guaranteed={cell.theirOffense.ko.guaranteed}
      />
    );
  }
  // speed
  return <SpeedArrow direction={cell.speed} delta={cell.speedDelta ?? undefined} showDelta />;
}

/** Background tint for a cell given the active view mode. */
function cellBackground(cell: MatrixCell, viewMode: MatrixViewMode): string {
  switch (viewMode) {
    case 'offense':
      return damageHeat(cell.myOffense.result?.maxPct, 'good');
    case 'defense':
      return damageHeat(cell.theirOffense.result?.maxPct, 'bad');
    case 'speed':
      return cell.speed === 'up'
        ? 'var(--matchup-resist-1)'
        : cell.speed === 'down'
          ? 'var(--matchup-weak-1)'
          : 'transparent';
    case 'verdict':
    default:
      return VERDICT_BG[cell.verdict];
  }
}

/** Accessible cell title (tooltip) covering all four axes. */
function cellTitle(cell: MatrixCell, myLabel: string): string {
  const speed =
    cell.speedDelta == null
      ? 'speed unknown'
      : `${cell.speed === 'up' ? 'you outspeed' : cell.speed === 'down' ? 'you are outsped' : 'speed tie'} (${
          cell.speedDelta > 0 ? '+' : ''
        }${cell.speedDelta})`;
  const mine = cell.myOffense.move
    ? `you: ${cell.myOffense.move} ${cell.myOffense.pct} (${cell.myOffense.ko.label})`
    : 'you: no usable move';
  const theirs = cell.theirOffense.move
    ? `them: ${cell.theirOffense.move} ${cell.theirOffense.pct} (${cell.theirOffense.ko.label})`
    : 'them: no usage data';
  return `${myLabel} vs ${cell.theirLabel} — ${VERDICT_LABEL[cell.verdict]}; ${speed}; ${mine}; ${theirs}`;
}

/**
 * The Detection hero (plan §3.2): a 6×6 head-to-head matrix — your mons as rows,
 * the detected opponents as columns. Each cell packs the speed comparison, your
 * best move's KO, their best likely move's KO, and a net verdict tint, with four
 * view modes re-skinning the same grid. Degrades cleanly with empty usage (your
 * offense + speed still render; opponent offense/speed show '—'). Never throws on
 * unidentified slots.
 */
export function MatchupMatrix({
  myTeam,
  opponent,
  usage,
  opponentSets,
  viewMode,
  onViewModeChange,
  onSelectCell,
}: MatchupMatrixProps) {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);

  const myMons = myTeam.pokemon;
  const slots = opponent.slots;

  // Column headers: the representative forme/label per opponent slot. With an
  // exact set (paste), the header is that set's own species/forme — not a
  // usage-picked variant — so it matches the cells' calc.
  const columns = useMemo(
    () =>
      slots.map((slot) => {
        const set = setFor(slot.speciesId, opponentSets);
        if (!set) return representativeOpponent(slot.speciesId, usage);
        const sp = gen.species.get(set.species ?? slot.speciesId ?? '');
        return {
          speciesId: sp?.exists ? sp.id : (slot.speciesId ?? ''),
          label: sp?.exists ? sp.name : (slot.speciesId ?? '—'),
          usage: undefined,
        };
      }),
    [slots, usage, opponentSets],
  );

  // The full cell grid, memoized (calc-heavy).
  const grid = useMemo(
    () =>
      myMons.map((mon) =>
        slots.map((slot) =>
          buildMatrixCell(mon, slot.speciesId, usage, undefined, setFor(slot.speciesId, opponentSets)),
        ),
      ),
    [myMons, slots, usage, opponentSets],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 }}>
      {/* View-mode segmented control */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
        {VIEW_MODES.map((m) => (
          <Button
            key={m.id}
            size="sm"
            variant={viewMode === m.id ? 'primary' : 'ghost'}
            onClick={() => onViewModeChange(m.id)}
          >
            {m.label}
          </Button>
        ))}
        <span
          style={{
            marginLeft: 'auto',
            alignSelf: 'center',
            fontSize: 'var(--font-2xs)',
            color: 'var(--text-mut)',
          }}
        >
          {viewMode === 'verdict'
            ? '✓ you win · ✕ they win · = even — click a cell for the deep dive'
            : viewMode === 'offense'
              ? 'Your best move → each opponent (KO + %)'
              : viewMode === 'defense'
                ? 'Their best likely move → each of your mons (KO + %)'
                : 'Speed: ▲ you faster · ▼ slower · ≈ tie'}
        </span>
      </div>

      {/* The grid */}
      <div style={{ overflow: 'auto', minWidth: 0 }}>
        <table
          style={{
            borderCollapse: 'separate',
            borderSpacing: 0,
            width: '100%',
            tableLayout: 'fixed',
            // Fits the pane at 1711×1112 (6 columns share the space); scrolls below this floor.
            minWidth: LABEL_W + columns.length * MIN_CELL_W,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  top: 0,
                  zIndex: 3,
                  width: LABEL_W,
                  minWidth: LABEL_W,
                  background: 'var(--surface)',
                  borderBottom: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  fontSize: 'var(--font-2xs)',
                  color: 'var(--text-mut)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  padding: 'var(--space-1) var(--space-2)',
                  textAlign: 'left',
                }}
              >
                You ＼ Them
              </th>
              {columns.map((rep, col) => (
                <th
                  key={col}
                  onClick={() => onSelectCell?.(0, col)}
                  title={rep ? `${rep.label} — open deep dive` : 'Unidentified slot'}
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: 'var(--surface)',
                    borderBottom: '1px solid var(--border)',
                    padding: 'var(--space-1) var(--space-1)',
                    cursor: onSelectCell ? 'pointer' : undefined,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-1)',
                      justifyContent: 'center',
                    }}
                  >
                    {rep && <span style={pokemonIconStyle(rep.speciesId)} aria-hidden />}
                    <span
                      style={{
                        fontSize: 'var(--font-xs)',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: CELL_W - 36,
                      }}
                    >
                      {rep ? rep.label : `Slot ${col + 1}`}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {myMons.map((mon, row) => (
              <tr key={mon.set.species ?? row}>
                <th
                  scope="row"
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    width: LABEL_W,
                    minWidth: LABEL_W,
                    background: 'var(--surface)',
                    borderRight: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    padding: 'var(--space-1) var(--space-2)',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <span style={pokemonIconStyle(mySpeciesId(mon))} aria-hidden />
                    <span
                      style={{
                        fontSize: 'var(--font-xs)',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: LABEL_W - 36,
                      }}
                    >
                      {myDisplayName(mon)}
                    </span>
                  </div>
                </th>
                {grid[row].map((cell, col) => {
                  const isHover = hovered?.row === row && hovered?.col === col;
                  return (
                    <td
                      key={col}
                      onClick={() => onSelectCell?.(row, col)}
                      onMouseEnter={() => setHovered({ row, col })}
                      onMouseLeave={() => setHovered(null)}
                      title={cellTitle(cell, myDisplayName(mon))}
                      style={{
                        height: CELL_H,
                        borderBottom: '1px solid var(--border)',
                        borderRight: '1px solid var(--border)',
                        padding: 'var(--space-0) var(--space-1)',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        background: cellBackground(cell, viewMode),
                        cursor: onSelectCell ? 'pointer' : undefined,
                        outline: isHover ? '2px solid var(--poke-red)' : undefined,
                        outlineOffset: -2,
                      }}
                    >
                      {viewMode === 'verdict' ? (
                        <CombinedCell cell={cell} />
                      ) : (
                        <CellContent cell={cell} viewMode={viewMode} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
