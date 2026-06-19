import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Toggle,
  Select,
  DataTable,
  KoBadge,
  SpeedArrow,
  type DataTableColumn,
  type DataTableRow,
  type SelectOption,
} from '../../ui';
import { pokemonIconStyle } from '../../components/pokemonIcon';
import { useSessionStore } from '../../store/session';
import { useTeamsStore } from '../../store/teams';
import { fetchUsage } from '../../../lib/smogon/usageData';
import { CURRENT_FORMAT } from '../../../shared/types';
import type { FieldState, MyPokemon, MyTeam, OpponentTeam, UsageData } from '../../../shared/types';
import { FIXTURE_MY_TEAM, FIXTURE_OPPONENT_TEAM } from '../../../shared/fixtures';
import { gen } from '../../../lib/calc/gen';
import { calcDamage, type Combatant } from '../../../lib/calc/damageCalc';
import { buildSpeedTiers, type SpeedTierInput } from '../../../lib/calc/speedTiers';
import { relevantThreats } from '../../../lib/calc/threats';
import {
  candidateOpponentMoves,
  damagingMovesOf,
  findUsage,
  koCell,
  myCombatant,
  myDisplayName,
  myMegaForme,
  mySpeedInput,
  opponentCombatant,
  opponentMegaForme,
  opponentSpeedWithLikely,
  speciesName,
  swapFieldSides,
} from './battleBuild';

const MAX_BROUGHT = 4;
const MAX_ON_FIELD = 2;

/** Species id for one of your mons (matches the ids stored in `myActiveFour`). */
function myId(mon: MyPokemon): string {
  return gen.species.get(mon.set.species ?? '')?.id ?? (mon.set.species ?? '').toLowerCase();
}

/** Toggle `id` in `list`, capped at `max` (ignores adds past the cap). */
function toggleCapped(list: string[], id: string, max: number): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  if (list.length >= max) return list;
  return [...list, id];
}

interface ChipItem {
  id: string;
  label: string;
}

/** Multi-select chip row with an icon per option and a selection cap. */
function SelectChips({
  items,
  selected,
  max,
  onToggle,
}: {
  items: ChipItem[];
  selected: string[];
  max: number;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
      {items.map((item) => {
        const active = selected.includes(item.id);
        const atCap = !active && selected.length >= max;
        return (
          <button
            key={item.id}
            type="button"
            disabled={atCap}
            onClick={() => onToggle(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              font: 'inherit',
              fontSize: 'var(--font-sm)',
              fontWeight: active ? 700 : 500,
              padding: '4px 10px 4px 6px',
              borderRadius: 999,
              border: `2px solid ${active ? 'var(--poke-red)' : 'var(--border)'}`,
              background: active ? 'var(--surface-2)' : 'transparent',
              color: atCap ? 'var(--text-mut)' : 'var(--text)',
              opacity: atCap ? 0.5 : 1,
              cursor: atCap ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={pokemonIconStyle(item.id)} aria-hidden />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const stepLabelStyle: React.CSSProperties = {
  fontSize: 'var(--font-2xs)',
  fontWeight: 700,
  color: 'var(--text-mut)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 'var(--space-2)',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 'var(--font-xs)',
  fontWeight: 700,
  color: 'var(--text-mut)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
};

/**
 * Mega-only on-field control (plan §4.4): a prominent Mega toggle that shows the
 * forme name when active. Tera is intentionally NOT surfaced — Champions has no
 * Terastallization, so the toggle would be misleading.
 */
function MegaControl({
  name,
  speciesId,
  megaForme,
  megaActivated,
  onMega,
}: {
  name: string;
  speciesId: string;
  megaForme: string | null;
  megaActivated: boolean;
  onMega: () => void;
}) {
  const formeName = megaForme ? speciesName(megaForme) : null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '4px 8px',
        border: `1px solid ${megaActivated ? 'var(--poke-red)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        background: megaActivated ? 'var(--surface-2)' : 'transparent',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={pokemonIconStyle(megaActivated && megaForme ? megaForme : speciesId)} aria-hidden />
        <span style={{ fontWeight: 700, fontSize: 'var(--font-md)' }}>
          {megaActivated && formeName ? formeName : name}
        </span>
      </span>
      <span style={{ marginLeft: 'auto' }}>
        {megaForme ? (
          <Toggle checked={megaActivated} onChange={onMega} label="Mega" />
        ) : (
          <span style={{ fontSize: 'var(--font-2xs)', color: 'var(--text-mut)' }}>No Mega</span>
        )}
      </span>
    </div>
  );
}

const WEATHER_OPTS: SelectOption[] = [
  { value: '', label: 'No weather' },
  { value: 'sun', label: 'Sun' },
  { value: 'rain', label: 'Rain' },
  { value: 'sand', label: 'Sand' },
  { value: 'snow', label: 'Snow' },
];

/**
 * Compact control bar (plan §4.1): weather dropdown + per-side Tailwind + Trick
 * Room laid out horizontally, non-scrolling. Tera is removed from this screen.
 */
function ControlBar({
  field,
  onChange,
  onNewBattle,
}: {
  field: FieldState;
  onChange: (patch: Partial<FieldState>) => void;
  onNewBattle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 18 }}>In-Battle</h1>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={sectionLabelStyle}>Weather</span>
        <Select
          value={field.weather ?? ''}
          options={WEATHER_OPTS}
          onChange={(v) => onChange({ weather: (v || undefined) as FieldState['weather'] })}
        />
      </span>
      <Toggle
        checked={!!field.attackerSide?.tailwind}
        onChange={(v) => onChange({ attackerSide: { ...field.attackerSide, tailwind: v } })}
        label="Your Tailwind"
      />
      <Toggle
        checked={!!field.defenderSide?.tailwind}
        onChange={(v) => onChange({ defenderSide: { ...field.defenderSide, tailwind: v } })}
        label="Opp Tailwind"
      />
      <Toggle
        checked={!!field.trickRoom}
        onChange={(v) => onChange({ trickRoom: v })}
        label="Trick Room"
      />
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Button variant="secondary" size="sm" onClick={onNewBattle}>
          New Battle
        </Button>
      </span>
    </div>
  );
}

/** One resolved on-field speed entry, ready for the horizontal strip. */
interface SpeedStripEntry {
  label: string;
  side: 'mine' | 'opp';
  effectiveSpeed: number;
  primary: boolean;
}

/**
 * Full-width horizontal speed strip (plan §4.1): on-field mons only, ordered by
 * effective speed (Trick Room reverses). The opponent's likely line is the
 * primary (bold) entry; min/max are faint context. The ▲/▼ shows who moves
 * first against the fastest entry on the other side.
 */
function SpeedStrip({
  mine,
  opponent,
  trickRoom,
}: {
  mine: SpeedTierInput[];
  opponent: SpeedTierInput[];
  trickRoom: boolean;
}) {
  const entries = useMemo<SpeedStripEntry[]>(() => {
    const mineEntries: SpeedStripEntry[] = buildSpeedTiers(mine, { trickRoom }).map((e) => ({
      label: e.label,
      side: 'mine',
      effectiveSpeed: e.effectiveSpeed,
      // Your own entries are all real, so all primary. The opponent strip is
      // [likely, min, max, +Scarf]; only the "likely" line is primary.
      primary: true,
    }));
    const oppEntries: SpeedStripEntry[] = buildSpeedTiers(opponent, { trickRoom }).map((e) => ({
      label: e.label,
      side: 'opp',
      effectiveSpeed: e.effectiveSpeed,
      primary: e.label.includes('(likely)'),
    }));
    const all = [...mineEntries, ...oppEntries];
    return all
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const diff = trickRoom
          ? a.entry.effectiveSpeed - b.entry.effectiveSpeed
          : b.entry.effectiveSpeed - a.entry.effectiveSpeed;
        return diff !== 0 ? diff : a.index - b.index;
      })
      .map(({ entry }) => entry);
  }, [mine, opponent, trickRoom]);

  // Whole-strip turn-order read: do my fastest on-field mon outspeed their
  // fastest likely line? (Trick Room reverses "faster".)
  const mineSpeeds = entries.filter((e) => e.side === 'mine').map((e) => e.effectiveSpeed);
  const oppPrimary = entries.filter((e) => e.side === 'opp' && e.primary).map((e) => e.effectiveSpeed);
  const myTop = mineSpeeds.length ? Math.max(...mineSpeeds) : null;
  const oppTop = oppPrimary.length ? Math.max(...oppPrimary) : null;
  let direction: 'up' | 'down' | 'tie' | null = null;
  let delta: number | undefined;
  if (myTop != null && oppTop != null) {
    delta = myTop - oppTop;
    const myFaster = trickRoom ? myTop < oppTop : myTop > oppTop;
    const oppFaster = trickRoom ? myTop > oppTop : myTop < oppTop;
    direction = myFaster ? 'up' : oppFaster ? 'down' : 'tie';
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-4)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <span style={sectionLabelStyle}>Speed order{trickRoom ? ' (TR)' : ''}</span>
      {direction && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <SpeedArrow direction={direction} delta={delta} showDelta />
          <span style={{ fontSize: 'var(--font-2xs)', color: 'var(--text-mut)' }}>
            {direction === 'up'
              ? 'you move first'
              : direction === 'down'
                ? 'they move first'
                : 'speed tie'}
          </span>
        </span>
      )}
      {entries.length === 0 && (
        <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-mut)' }}>
          No on-field mons.
        </span>
      )}
      {entries.map((e, i) => (
        <span
          key={`${e.side}-${e.label}-${i}`}
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 'var(--space-1)',
            fontSize: 'var(--font-sm)',
            fontWeight: e.primary ? 700 : 400,
            opacity: e.primary ? 1 : 0.6,
            color: e.side === 'mine' ? 'var(--text)' : 'var(--text)',
          }}
        >
          <span style={{ color: 'var(--text-mut)', fontSize: 'var(--font-2xs)' }}>{i + 1}</span>
          {e.label}
          <span
            style={{
              fontFamily: 'var(--font-num)',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 700,
            }}
          >
            {e.effectiveSpeed}
          </span>
          <span style={{ fontSize: 'var(--font-2xs)', color: 'var(--text-mut)' }}>
            {e.side === 'mine' ? '(you)' : '(opp)'}
          </span>
        </span>
      ))}
    </div>
  );
}

/** A single attacker+move row for a KO matrix. */
interface MatrixRow {
  key: string;
  label: string;
  attacker: Combatant;
  move: string;
}

/** A defender column for a KO matrix. */
interface MatrixCol {
  key: string;
  label: string;
  defender: Combatant;
}

/**
 * KO-centric damage matrix (plan §4.3): each cell leads with the KO count
 * (`KoBadge`), the %-range is the faint secondary line. `tone` is fixed per
 * table — 'good' (green) when YOUR moves get the KO, 'bad' (red) when THEIR
 * moves get the KO on you. Built directly on `DataTable` + `KoBadge` (rather
 * than reusing `DamageCalcTable`, which is %-primary and out of this scope).
 */
function KoMatrix({
  title,
  rows,
  columns,
  field,
  tone,
}: {
  title: string;
  rows: MatrixRow[];
  columns: MatrixCol[];
  field?: FieldState;
  tone: 'good' | 'bad';
}) {
  const tableColumns: DataTableColumn[] = [
    { key: 'move', header: 'Move', sticky: true },
    ...columns.map((col) => ({ key: col.key, header: col.label, numeric: true })),
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
        cells[col.key] = <KoBadge label="—" tone="neutral" />;
        cellStyle[col.key] = { textAlign: 'center' };
        continue;
      }
      const { ko, pct } = koCell(result);
      cells[col.key] = (
        <KoBadge
          label={ko.label}
          pct={pct}
          tone={ko.label === '—' ? 'neutral' : tone}
          guaranteed={ko.guaranteed}
        />
      );
      cellStyle[col.key] = { textAlign: 'center' };
    }
    return { key: row.key, cells, cellStyle };
  });

  return (
    <Card title={title} style={{ minWidth: 0 }}>
      {rows.length === 0 || columns.length === 0 ? (
        <p style={{ color: 'var(--text-mut)', margin: 0, fontSize: 'var(--font-sm)' }}>
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

/**
 * Flow C — In-Battle Battle Console (plan §4). Single-viewport console: a
 * compact control bar (field toggles + collapsible Setup), a full-width
 * horizontal speed strip (likely opponent line bold), two KO-centric damage
 * matrices side-by-side, and a per-opponent on-field context strip. Selection
 * (bring 4 → who's in) lives in the collapsible Setup popover. Mega is a
 * first-class control; Tera is not surfaced (Champions has no Tera).
 */
export function InBattleScreen() {
  const getActiveTeam = useTeamsStore((s) => s.getActiveTeam);
  const teams = useTeamsStore((s) => s.teams);
  const activeTeamId = useTeamsStore((s) => s.activeTeamId);
  const sessionOpponent = useSessionStore((s) => s.opponent);

  const myActiveFour = useSessionStore((s) => s.myActiveFour);
  const opponentActiveFour = useSessionStore((s) => s.opponentActiveFour);
  const myOnField = useSessionStore((s) => s.myOnField);
  const opponentOnField = useSessionStore((s) => s.opponentOnField);
  const myBattleState = useSessionStore((s) => s.myBattleState);
  const field = useSessionStore((s) => s.field);

  const setMyActiveFour = useSessionStore((s) => s.setMyActiveFour);
  const setOpponentActiveFour = useSessionStore((s) => s.setOpponentActiveFour);
  const setMyOnField = useSessionStore((s) => s.setMyOnField);
  const setOpponentOnField = useSessionStore((s) => s.setOpponentOnField);
  const toggleMyMega = useSessionStore((s) => s.toggleMyMega);
  const toggleOpponentMega = useSessionStore((s) => s.toggleOpponentMega);
  const setField = useSessionStore((s) => s.setField);
  const newBattle = useSessionStore((s) => s.newBattle);

  // Fall back to dev fixtures (like the Detection screen) so the screen is
  // usable before a team is imported or an opponent detected.
  const realTeam: MyTeam | undefined = useMemo(
    () => getActiveTeam() ?? teams.find((t) => t.id === activeTeamId),
    [getActiveTeam, teams, activeTeamId],
  );
  const usingTeamFixture = !realTeam;
  const myTeam = realTeam ?? FIXTURE_MY_TEAM;

  const usingOpponentFixture = !sessionOpponent;
  const opponent: OpponentTeam = sessionOpponent ?? FIXTURE_OPPONENT_TEAM;

  const [usage, setUsage] = useState<UsageData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchUsage(CURRENT_FORMAT).then((data) => {
      if (!cancelled) setUsage(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Selection option lists -------------------------------------------------
  const myTeamItems: ChipItem[] = useMemo(
    () => myTeam.pokemon.map((mon) => ({ id: myId(mon), label: myDisplayName(mon) })),
    [myTeam],
  );
  const myBroughtItems = useMemo(
    () => myTeamItems.filter((item) => myActiveFour.includes(item.id)),
    [myTeamItems, myActiveFour],
  );
  const opponentIds = useMemo(
    () => opponent.slots.map((s) => s.speciesId).filter((id): id is string => !!id),
    [opponent],
  );
  const opponentItems: ChipItem[] = useMemo(
    () => opponentIds.map((id) => ({ id, label: speciesName(id) })),
    [opponentIds],
  );
  const opponentBroughtItems = useMemo(
    () => opponentItems.filter((item) => opponentActiveFour.includes(item.id)),
    [opponentItems, opponentActiveFour],
  );

  // ---- Resolve the on-field sets to concrete mons -----------------------------
  const myOnFieldMons = useMemo(
    () =>
      myOnField
        .map((id) => myTeam.pokemon.find((mon) => myId(mon) === id))
        .filter(Boolean) as MyPokemon[],
    [myOnField, myTeam],
  );
  const slotFor = useMemo(
    () => (id: string) => opponent.slots.find((s) => s.speciesId === id),
    [opponent],
  );

  const myTailwind = !!field.attackerSide?.tailwind;
  const oppTailwind = !!field.defenderSide?.tailwind;

  const bothReady = myOnFieldMons.length > 0 && opponentOnField.length > 0;

  // ---- Speed tier inputs ------------------------------------------------------
  const weather = field.weather;
  const mineSpeed: SpeedTierInput[] = useMemo(
    () =>
      myOnFieldMons.map((mon) => mySpeedInput(mon, myBattleState[myId(mon)], myTailwind, weather)),
    [myOnFieldMons, myBattleState, myTailwind, weather],
  );
  const opponentSpeed: SpeedTierInput[] = useMemo(
    () =>
      opponentOnField.flatMap((id) =>
        opponentSpeedWithLikely(id, findUsage(usage, id), slotFor(id), oppTailwind, weather),
      ),
    [opponentOnField, usage, slotFor, oppTailwind, weather],
  );

  // ---- Resolved combatants ----------------------------------------------------
  const myDefenderCombatants = useMemo(
    () => myOnFieldMons.map((mon) => myCombatant(mon, myBattleState[myId(mon)])),
    [myOnFieldMons, myBattleState],
  );

  // ---- "Your moves → their active" matrix -------------------------------------
  const yourMovesRows: MatrixRow[] = useMemo(
    () =>
      myOnFieldMons.flatMap((mon) =>
        damagingMovesOf(mon).map((move) => ({
          key: `${myId(mon)}-${move}`,
          label: `${myDisplayName(mon)} — ${move}`,
          attacker: myCombatant(mon, myBattleState[myId(mon)]),
          move,
        })),
      ),
    [myOnFieldMons, myBattleState],
  );
  const opponentCols: MatrixCol[] = useMemo(
    () =>
      opponentOnField.map((id) => ({
        key: id,
        label: speciesName(id),
        defender: opponentCombatant(id, findUsage(usage, id), slotFor(id)),
      })),
    [opponentOnField, usage, slotFor],
  );

  const swappedField = useMemo(() => swapFieldSides(field), [field]);

  // ---- "Their likely moves → your active" matrix (matchup-aware) --------------
  // Show all likely moves expander state (per the spec's completeness fallback).
  const [showAllOppMoves, setShowAllOppMoves] = useState(false);
  const theirMovesRows: MatrixRow[] = useMemo(
    () =>
      opponentOnField.flatMap((id) => {
        const oppUsage = findUsage(usage, id);
        const combatant = opponentCombatant(id, oppUsage, slotFor(id));
        const candidates = candidateOpponentMoves(oppUsage, 8);
        const moves = showAllOppMoves
          ? candidates
          : relevantThreats(combatant, myDefenderCombatants, candidates, swappedField, 4).map(
              (t) => t.move,
            );
        return moves.map((move) => ({
          key: `${id}-${move}`,
          label: `${speciesName(id)} — ${move}`,
          attacker: combatant,
          move,
        }));
      }),
    [opponentOnField, usage, slotFor, myDefenderCombatants, swappedField, showAllOppMoves],
  );
  const myCols: MatrixCol[] = useMemo(
    () =>
      myOnFieldMons.map((mon) => ({
        key: myId(mon),
        label: myDisplayName(mon),
        defender: myCombatant(mon, myBattleState[myId(mon)]),
      })),
    [myOnFieldMons, myBattleState],
  );

  // ---- Setup panel content ----------------------------------------------------
  const setupPanel = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
      }}
    >
      <div>
        <div style={stepLabelStyle}>Your side — bring 4</div>
        <SelectChips
          items={myTeamItems}
          selected={myActiveFour}
          max={MAX_BROUGHT}
          onToggle={(id) => setMyActiveFour(toggleCapped(myActiveFour, id, MAX_BROUGHT))}
        />
        {myActiveFour.length > 0 && (
          <>
            <div style={{ ...stepLabelStyle, marginTop: 'var(--space-3)' }}>Who&apos;s in</div>
            <SelectChips
              items={myBroughtItems}
              selected={myOnField}
              max={MAX_ON_FIELD}
              onToggle={(id) => setMyOnField(toggleCapped(myOnField, id, MAX_ON_FIELD))}
            />
          </>
        )}
      </div>
      <div>
        <div style={stepLabelStyle}>Opponent — what they brought</div>
        <SelectChips
          items={opponentItems}
          selected={opponentActiveFour}
          max={MAX_BROUGHT}
          onToggle={(id) =>
            setOpponentActiveFour(toggleCapped(opponentActiveFour, id, MAX_BROUGHT))
          }
        />
        {opponentActiveFour.length > 0 && (
          <>
            <div style={{ ...stepLabelStyle, marginTop: 'var(--space-3)' }}>Who&apos;s in</div>
            <SelectChips
              items={opponentBroughtItems}
              selected={opponentOnField}
              max={MAX_ON_FIELD}
              onToggle={(id) => setOpponentOnField(toggleCapped(opponentOnField, id, MAX_ON_FIELD))}
            />
          </>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <ControlBar field={field} onChange={setField} onNewBattle={newBattle} />

      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {(usingTeamFixture || usingOpponentFixture) && (
          <p
            style={{
              margin: 0,
              padding: 'var(--space-2) var(--space-4) 0',
              fontSize: 'var(--font-2xs)',
              color: 'var(--text-mut)',
            }}
          >
            {usingTeamFixture && 'No active team — using the sample team. '}
            {usingOpponentFixture && 'No detected opponent — using the sample opponent.'}
          </p>
        )}
        {setupPanel}
      </div>

      <SpeedStrip mine={mineSpeed} opponent={opponentSpeed} trickRoom={!!field.trickRoom} />

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-4)' }}>
        {bothReady ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-4)',
                alignItems: 'start',
              }}
            >
              <KoMatrix
                title="Your moves → their active"
                rows={yourMovesRows}
                columns={opponentCols}
                field={field}
                tone="good"
              />
              <KoMatrix
                title="Their likely moves → your active"
                rows={theirMovesRows}
                columns={myCols}
                field={swappedField}
                tone="bad"
              />
            </div>
            <div>
              <Button variant="ghost" size="sm" onClick={() => setShowAllOppMoves((v) => !v)}>
                {showAllOppMoves
                  ? 'Show matchup-ranked threats ▲'
                  : 'Show all likely opponent moves ▾'}
              </Button>
            </div>

            <Card title="On-field opponents">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 'var(--space-4)',
                }}
              >
                {opponentOnField.map((id) => {
                  const slot = slotFor(id);
                  const oppUsage = findUsage(usage, id);
                  const megaForme = opponentMegaForme(id, oppUsage);
                  return (
                    <div
                      key={id}
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
                    >
                      <MegaControl
                        name={speciesName(id)}
                        speciesId={id}
                        megaForme={megaForme}
                        megaActivated={!!slot?.megaActivated}
                        onMega={() => toggleOpponentMega(id)}
                      />
                      <OpponentTells usage={oppUsage} />
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Your on-field mons">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 'var(--space-3)',
                }}
              >
                {myOnFieldMons.map((mon) => {
                  const id = myId(mon);
                  const toggles = myBattleState[id];
                  return (
                    <MegaControl
                      key={id}
                      name={myDisplayName(mon)}
                      speciesId={id}
                      megaForme={myMegaForme(mon)}
                      megaActivated={!!toggles?.megaActivated}
                      onMega={() => toggleMyMega(id)}
                    />
                  );
                })}
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <p style={{ margin: 0, color: 'var(--text-mut)', fontSize: 'var(--font-md)' }}>
              In the <strong>Setup</strong> panel above, mark at least one mon on each side
              that&apos;s currently in to see live speed order and KO math.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

/** Compact item/ability/spread "tells" + top-6 usage moves for an on-field opponent. */
function OpponentTells({ usage }: { usage?: ReturnType<typeof findUsage> }) {
  const item = usage?.items[0]?.name;
  const ability = usage?.abilities[0]?.name;
  const spread = usage?.spreads[0]?.name;
  // Top 6 by usage, INCLUDING status moves — surfaces Disable/Encore/Taunt/etc.
  // that the damaging-move matrices never show.
  const moves = (usage?.moves ?? []).slice(0, 6);
  if (!item && !ability && !spread && moves.length === 0) {
    return (
      <span style={{ fontSize: 'var(--font-2xs)', color: 'var(--text-mut)' }}>
        No usage data yet.
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 'var(--space-2)',
          rowGap: 'var(--space-1)',
          fontSize: 'var(--font-xs)',
        }}
      >
        {ability && <Tell label="Ability" value={ability} />}
        {item && <Tell label="Item" value={item} />}
        {spread && <Tell label="Spread" value={spread} />}
      </dl>
      {moves.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {moves.map((m) => (
            <span
              key={m.name}
              title={`${m.name} — ${Math.round(m.usage * 100)}% usage`}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 4,
                fontSize: 'var(--font-2xs)',
                padding: '1px 6px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{m.name}</span>
              <span style={{ color: 'var(--text-mut)', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(m.usage * 100)}%
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Tell({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: 'var(--text-mut)', fontWeight: 600 }}>{label}</dt>
      <dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
    </>
  );
}
