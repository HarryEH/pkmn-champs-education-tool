import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Toggle } from '../../ui';
import { SpeedTierList } from '../../components/SpeedTierList';
import {
  DamageCalcTable,
  type DamageColSpec,
  type DamageRowSpec,
} from '../../components/DamageCalcTable';
import { TypeMatchupGrid, type TypeMatchupMon } from '../../components/TypeMatchupGrid';
import { FieldStateToggles } from '../../components/FieldStateToggles';
import { pokemonIconStyle } from '../../components/pokemonIcon';
import { useSessionStore } from '../../store/session';
import { useTeamsStore } from '../../store/teams';
import { fetchUsage } from '../../../lib/smogon/usageData';
import { CURRENT_FORMAT } from '../../../shared/types';
import type { MyPokemon, MyTeam, OpponentTeam, UsageData } from '../../../shared/types';
import { FIXTURE_MY_TEAM, FIXTURE_OPPONENT_TEAM } from '../../../shared/fixtures';
import { gen } from '../../../lib/calc/gen';
import type { SpeedTierInput } from '../../../lib/calc/speedTiers';
import { topMoves } from '../Detection/opponentBuild';
import {
  activeTypes,
  damagingMovesOf,
  findUsage,
  myCombatant,
  myDisplayName,
  myMegaForme,
  mySpeedInput,
  opponentCombatant,
  opponentMegaForme,
  opponentSpeedInputs,
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
              fontSize: 14,
              fontWeight: active ? 700 : 500,
              padding: '6px 12px 6px 8px',
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
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--text-mut)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 'var(--space-2)',
};

/** One on-field mon's Mega/Tera battle toggles. */
function OnFieldToggles({
  name,
  speciesId,
  canMega,
  megaActivated,
  canTera,
  teraType,
  teraActivated,
  onMega,
  onTera,
}: {
  name: string;
  speciesId: string;
  canMega: boolean;
  megaActivated: boolean;
  canTera: boolean;
  teraType?: string;
  teraActivated: boolean;
  onMega: () => void;
  onTera: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        padding: '6px 10px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={pokemonIconStyle(speciesId)} aria-hidden />
        <span style={{ fontWeight: 700, fontSize: 'var(--font-battle)' }}>{name}</span>
      </span>
      <span style={{ display: 'flex', gap: 'var(--space-4)', marginLeft: 'auto' }}>
        {canMega ? (
          <Toggle checked={megaActivated} onChange={onMega} label="Mega" />
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-mut)' }}>No Mega</span>
        )}
        <Toggle
          checked={teraActivated}
          onChange={onTera}
          disabled={!canTera}
          label={teraType ? `Tera ${teraType}` : 'Tera'}
        />
      </span>
    </div>
  );
}

/**
 * Flow C — In-Battle live view (plan §5 WS-F).
 *
 * Two-step on-field selection per side (bring 4 → mark who's currently in),
 * manual per-mon Mega/Tera + field-state toggles, and live speed order +
 * damage matrices restricted to exactly the mons currently on the field.
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
  const toggleMyTera = useSessionStore((s) => s.toggleMyTera);
  const toggleOpponentMega = useSessionStore((s) => s.toggleOpponentMega);
  const toggleOpponentTera = useSessionStore((s) => s.toggleOpponentTera);
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
    () => myOnField.map((id) => myTeam.pokemon.find((mon) => myId(mon) === id)).filter(Boolean) as MyPokemon[],
    [myOnField, myTeam],
  );
  const slotFor = useMemo(
    () => (id: string) => opponent.slots.find((s) => s.speciesId === id),
    [opponent],
  );

  const myTailwind = !!field.attackerSide?.tailwind;
  const oppTailwind = !!field.defenderSide?.tailwind;

  // ---- Speed tier inputs ------------------------------------------------------
  const mineSpeed: SpeedTierInput[] = useMemo(
    () => myOnFieldMons.map((mon) => mySpeedInput(mon, myBattleState[myId(mon)], myTailwind)),
    [myOnFieldMons, myBattleState, myTailwind],
  );
  const opponentSpeed: SpeedTierInput[] = useMemo(
    () =>
      opponentOnField.flatMap((id) =>
        opponentSpeedInputs(id, findUsage(usage, id), slotFor(id), oppTailwind),
      ),
    [opponentOnField, usage, slotFor, oppTailwind],
  );

  // ---- Damage matrices --------------------------------------------------------
  const yourMovesRows: DamageRowSpec[] = useMemo(
    () =>
      myOnFieldMons.flatMap((mon) =>
        damagingMovesOf(mon).map((move) => ({
          label: `${myDisplayName(mon)} — ${move}`,
          attacker: myCombatant(mon, myBattleState[myId(mon)]),
          move,
        })),
      ),
    [myOnFieldMons, myBattleState],
  );
  const opponentCols: DamageColSpec[] = useMemo(
    () =>
      opponentOnField.map((id) => ({
        label: speciesName(id),
        defender: opponentCombatant(id, findUsage(usage, id), slotFor(id)),
      })),
    [opponentOnField, usage, slotFor],
  );

  const theirMovesRows: DamageRowSpec[] = useMemo(
    () =>
      opponentOnField.flatMap((id) => {
        const combatant = opponentCombatant(id, findUsage(usage, id), slotFor(id));
        return topMoves(findUsage(usage, id), 4).map((move) => ({
          label: `${speciesName(id)} — ${move}`,
          attacker: combatant,
          move,
        }));
      }),
    [opponentOnField, usage, slotFor],
  );
  const myCols: DamageColSpec[] = useMemo(
    () =>
      myOnFieldMons.map((mon) => ({
        label: myDisplayName(mon),
        defender: myCombatant(mon, myBattleState[myId(mon)]),
      })),
    [myOnFieldMons, myBattleState],
  );

  const swappedField = useMemo(() => swapFieldSides(field), [field]);

  // ---- Type matchup (per on-field opponent) -----------------------------------
  const myMatchupMons: TypeMatchupMon[] = useMemo(
    () =>
      myOnFieldMons.map((mon) => {
        const toggles = myBattleState[myId(mon)];
        const types = toggles?.megaActivated
          ? activeTypes(myId(mon), myMegaForme(mon))
          : mon.types;
        return {
          label: myDisplayName(mon),
          types,
          moveTypes: [...new Set(damagingMovesOf(mon).map((m) => gen.moves.get(m)?.type ?? ''))].filter(Boolean),
        };
      }),
    [myOnFieldMons, myBattleState],
  );

  const bothReady = myOnFieldMons.length > 0 && opponentOnField.length > 0;

  return (
    <div
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        maxWidth: 1100,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0 }}>In-Battle</h1>
          <p style={{ color: 'var(--text-mut)', margin: '4px 0 0' }}>
            Bring 4, mark who&apos;s currently in on each side, flip Mega/Tera and field toggles —
            speed order and damage update live for the mons on the field.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={newBattle}>
          New Battle
        </Button>
      </header>

      {(usingTeamFixture || usingOpponentFixture) && (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-mut)' }}>
            {usingTeamFixture && 'No active team — using the sample team. Import one in Team Setup. '}
            {usingOpponentFixture &&
              'No detected opponent — using the sample opponent. Run Detection for the real one.'}
          </p>
        </Card>
      )}

      <Card title="Your side">
        <div style={stepLabelStyle}>Step 1 — bring 4</div>
        <SelectChips
          items={myTeamItems}
          selected={myActiveFour}
          max={MAX_BROUGHT}
          onToggle={(id) => setMyActiveFour(toggleCapped(myActiveFour, id, MAX_BROUGHT))}
        />
        {myActiveFour.length > 0 && (
          <>
            <div style={{ ...stepLabelStyle, marginTop: 'var(--space-4)' }}>
              Step 2 — who&apos;s currently in
            </div>
            <SelectChips
              items={myBroughtItems}
              selected={myOnField}
              max={MAX_ON_FIELD}
              onToggle={(id) => setMyOnField(toggleCapped(myOnField, id, MAX_ON_FIELD))}
            />
          </>
        )}
        {myOnFieldMons.length > 0 && (
          <div
            style={{
              marginTop: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {myOnFieldMons.map((mon) => {
              const id = myId(mon);
              const toggles = myBattleState[id];
              return (
                <OnFieldToggles
                  key={id}
                  name={myDisplayName(mon)}
                  speciesId={id}
                  canMega={!!myMegaForme(mon)}
                  megaActivated={!!toggles?.megaActivated}
                  canTera={!!mon.set.teraType}
                  teraType={mon.set.teraType}
                  teraActivated={!!toggles?.teraActivated}
                  onMega={() => toggleMyMega(id)}
                  onTera={() => toggleMyTera(id)}
                />
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Opponent">
        <div style={stepLabelStyle}>Step 1 — what they brought</div>
        <SelectChips
          items={opponentItems}
          selected={opponentActiveFour}
          max={MAX_BROUGHT}
          onToggle={(id) => setOpponentActiveFour(toggleCapped(opponentActiveFour, id, MAX_BROUGHT))}
        />
        {opponentActiveFour.length > 0 && (
          <>
            <div style={{ ...stepLabelStyle, marginTop: 'var(--space-4)' }}>
              Step 2 — who&apos;s currently in
            </div>
            <SelectChips
              items={opponentBroughtItems}
              selected={opponentOnField}
              max={MAX_ON_FIELD}
              onToggle={(id) => setOpponentOnField(toggleCapped(opponentOnField, id, MAX_ON_FIELD))}
            />
          </>
        )}
        {opponentOnField.length > 0 && (
          <div
            style={{
              marginTop: 'var(--space-4)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {opponentOnField.map((id) => {
              const slot = slotFor(id);
              const megaForme = opponentMegaForme(id, findUsage(usage, id));
              return (
                <OnFieldToggles
                  key={id}
                  name={speciesName(id)}
                  speciesId={id}
                  canMega={!!megaForme}
                  megaActivated={!!slot?.megaActivated}
                  canTera
                  teraType={slot?.teraType ?? findUsage(usage, id)?.teraTypes[0]?.name}
                  teraActivated={!!slot?.teraActivated}
                  onMega={() => toggleOpponentMega(id)}
                  onTera={() => toggleOpponentTera(id)}
                />
              );
            })}
          </div>
        )}
      </Card>

      <FieldStateToggles field={field} onChange={setField} />

      {bothReady ? (
        <>
          <SpeedTierList mine={mineSpeed} opponent={opponentSpeed} trickRoom={!!field.trickRoom} />
          <DamageCalcTable
            title="Your moves vs their active"
            rows={yourMovesRows}
            columns={opponentCols}
            field={field}
          />
          <DamageCalcTable
            title="Their likely moves vs your active"
            rows={theirMovesRows}
            columns={myCols}
            field={swappedField}
          />
          {opponentOnField.map((id) => (
            <TypeMatchupGrid
              key={id}
              opponentLabel={speciesName(id)}
              opponentTypes={activeTypes(
                id,
                slotFor(id)?.megaActivated ? opponentMegaForme(id, findUsage(usage, id)) : null,
              )}
              myMons={myMatchupMons}
            />
          ))}
        </>
      ) : (
        <Card>
          <p style={{ margin: 0, color: 'var(--text-mut)' }}>
            Select at least one mon currently in on each side to see live speed order and damage.
          </p>
        </Card>
      )}
    </div>
  );
}
