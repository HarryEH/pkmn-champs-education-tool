import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Select, Tabs, Toggle, TypeBadge, type TabItem } from '../../ui';
import { TypeMatchupGrid, type TypeMatchupMon } from '../../components/TypeMatchupGrid';
import { SpeedTierList } from '../../components/SpeedTierList';
import {
  DamageCalcTable,
  type DamageColSpec,
  type DamageRowSpec,
} from '../../components/DamageCalcTable';
import { pokemonIconStyle } from '../../components/pokemonIcon';
import { gen } from '../../../lib/calc/gen';
import type { SpeedTierInput } from '../../../lib/calc/speedTiers';
import { fetchUsage } from '../../../lib/smogon/usageData';
import { CURRENT_FORMAT } from '../../../shared/types';
import type {
  MyPokemon,
  MyTeam,
  OpponentTeam,
  SpeciesUsage,
  UsageData,
  UsageEntry,
} from '../../../shared/types';
import {
  buildOpponentCombatant,
  defaultVariant,
  opponentSpeedStat,
  topMoves,
  usageVariants,
} from './opponentBuild';

export interface OpponentDashboardProps {
  opponent: OpponentTeam;
  myTeam: MyTeam;
}

function speciesName(speciesId: string): string {
  return gen.species.get(speciesId)?.name ?? speciesId;
}

function myDisplayName(mon: MyPokemon): string {
  return mon.set.name && mon.set.name !== mon.set.species
    ? mon.set.name
    : mon.set.species ?? 'Unknown';
}

/** Unique non-Status move types a "my team" Pokémon carries. */
function moveTypesOf(mon: MyPokemon): string[] {
  const types = new Set<string>();
  for (const moveName of mon.set.moves ?? []) {
    const move = gen.moves.get(moveName);
    if (move?.exists && move.category !== 'Status') types.add(move.type);
  }
  return [...types];
}

/** Non-Status moves a "my team" Pokémon carries, in set order. */
function damagingMovesOf(mon: MyPokemon): string[] {
  return (mon.set.moves ?? []).filter((m) => {
    const move = gen.moves.get(m);
    return move?.exists && move.category !== 'Status';
  });
}

function UsageList({
  title,
  entries,
  isType,
  limit = 5,
}: {
  title: string;
  entries: UsageEntry[];
  isType?: boolean;
  limit?: number;
}) {
  const top = entries.slice(0, limit);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mut)', marginBottom: 4 }}>
        {title}
      </div>
      {top.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-mut)' }}>—</div>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {top.map((entry) => (
            <li
              key={entry.name}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}
            >
              {isType ? (
                <TypeBadge type={entry.name} size="sm" />
              ) : (
                <span style={{ fontSize: 12 }}>{entry.name}</span>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-mut)' }}>
                {Math.round(entry.usage * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Smogon usage summary for one opponent species (spec §4.3 "common sets"). */
function CommonSets({ usage }: { usage: SpeciesUsage | undefined }) {
  return (
    <Card title="Common sets (Smogon usage)">
      {!usage ? (
        <p style={{ color: 'var(--text-mut)', margin: 0, fontSize: 13 }}>
          No usage data available for this species yet.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          <UsageList title="Items" entries={usage.items} />
          <UsageList title="Abilities" entries={usage.abilities} />
          <UsageList title="Tera types" entries={usage.teraTypes} isType />
          <UsageList title="Moves" entries={usage.moves} limit={6} />
          <UsageList title="Spreads" entries={usage.spreads} limit={3} />
        </div>
      )}
    </Card>
  );
}

interface SlotAnalysisProps {
  speciesId: string;
  usage: SpeciesUsage | undefined;
  myTeam: MyTeam;
  myMons: TypeMatchupMon[];
  trickRoom: boolean;
}

/** Full per-opponent analysis: common sets, type matchups, speed, damage. */
function OpponentSlotAnalysis({ speciesId, usage, myTeam, myMons, trickRoom }: SlotAnalysisProps) {
  const opponentLabel = speciesName(speciesId);
  const opponentTypes = useMemo(() => {
    const species = gen.species.get(speciesId);
    return species?.exists ? [...species.types] : [];
  }, [speciesId]);

  const combatant = useMemo(() => buildOpponentCombatant(speciesId, usage), [speciesId, usage]);
  const opponentMoves = useMemo(() => topMoves(usage, 4), [usage]);

  const mySpeedEntries: SpeedTierInput[] = useMemo(
    () => myTeam.pokemon.map((mon) => ({ label: myDisplayName(mon), set: mon.set })),
    [myTeam],
  );
  const opponentSpeedEntries: SpeedTierInput[] = useMemo(
    () => [{ label: opponentLabel, stat: opponentSpeedStat(combatant) }],
    [combatant, opponentLabel],
  );

  const yourMovesRows: DamageRowSpec[] = useMemo(
    () =>
      myTeam.pokemon.flatMap((mon) =>
        damagingMovesOf(mon).map((move) => ({
          label: `${myDisplayName(mon)} — ${move}`,
          attacker: { kind: 'set' as const, set: mon.set },
          move,
        })),
      ),
    [myTeam],
  );
  const yourMovesCols: DamageColSpec[] = useMemo(
    () => [{ label: opponentLabel, defender: combatant }],
    [opponentLabel, combatant],
  );

  const opponentMovesRows: DamageRowSpec[] = useMemo(
    () => opponentMoves.map((move) => ({ label: move, attacker: combatant, move })),
    [opponentMoves, combatant],
  );
  const opponentMovesCols: DamageColSpec[] = useMemo(
    () =>
      myTeam.pokemon.map((mon) => ({
        label: myDisplayName(mon),
        defender: { kind: 'set' as const, set: mon.set },
      })),
    [myTeam],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={pokemonIconStyle(speciesId)} aria-hidden />
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{opponentLabel}</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            {opponentTypes.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </div>
        </div>
      </div>

      <CommonSets usage={usage} />

      <TypeMatchupGrid opponentLabel={opponentLabel} opponentTypes={opponentTypes} myMons={myMons} />

      <SpeedTierList mine={mySpeedEntries} opponent={opponentSpeedEntries} trickRoom={trickRoom} />

      <DamageCalcTable
        title={`Your moves vs ${opponentLabel}`}
        rows={yourMovesRows}
        columns={yourMovesCols}
      />
      <DamageCalcTable
        title={`${opponentLabel}'s likely moves vs your team`}
        rows={opponentMovesRows}
        columns={opponentMovesCols}
      />
    </div>
  );
}

/**
 * E2 analysis dashboard: one tab per detected opponent slot, each rendering
 * common sets, type matchups, a merged speed tier list, and damage calc
 * tables against your active team.
 */
export function OpponentDashboard({ opponent, myTeam }: OpponentDashboardProps) {
  const [activeId, setActiveId] = useState('0');
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [trickRoom, setTrickRoom] = useState(false);
  // Per-detected-species forme selection (base id → chosen variant forme id).
  // Empty = use the dominant-by-usage default for that species.
  const [formeChoice, setFormeChoice] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setUsageLoading(true);
    fetchUsage(CURRENT_FORMAT)
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUsage = async () => {
    setUsageLoading(true);
    try {
      setUsage(await fetchUsage(CURRENT_FORMAT, { refresh: true }));
    } finally {
      setUsageLoading(false);
    }
  };

  const tabs: TabItem[] = opponent.slots.map((slot, i) => ({
    id: String(i),
    label: slot.speciesId ? speciesName(slot.speciesId) : `Slot ${i + 1}`,
  }));

  const activeSlot = opponent.slots[Number(activeId)];
  const activeBaseId = activeSlot?.speciesId ?? '';

  // Base + Mega forme views for the active opponent; pick the dominant-by-usage
  // one unless the user has overridden it via the forme selector.
  const variants = useMemo(
    () => (activeBaseId ? usageVariants(activeBaseId, usage) : []),
    [activeBaseId, usage],
  );
  const fallbackVariant = useMemo(() => defaultVariant(variants), [variants]);
  const chosen =
    variants.find((v) => v.speciesId === formeChoice[activeBaseId]) ?? fallbackVariant;

  const myMons: TypeMatchupMon[] = useMemo(
    () =>
      myTeam.pokemon.map((mon) => ({
        label: myDisplayName(mon),
        types: mon.types,
        moveTypes: moveTypesOf(mon),
      })),
    [myTeam],
  );

  return (
    <Card
      title="Analysis dashboard"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Toggle checked={trickRoom} onChange={setTrickRoom} label="Trick Room" />
          <Button variant="ghost" size="sm" onClick={refreshUsage} disabled={usageLoading}>
            {usageLoading ? 'Refreshing…' : 'Refresh usage data'}
          </Button>
        </div>
      }
    >
      <Tabs items={tabs} activeId={activeId} onChange={setActiveId} />
      <div style={{ marginTop: 'var(--space-4)' }}>
        {activeSlot?.speciesId && chosen ? (
          <>
            {variants.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-mut)' }}>
                  Forme / sets
                </span>
                <Select
                  value={chosen.speciesId}
                  onChange={(value) =>
                    setFormeChoice((prev) => ({ ...prev, [activeBaseId]: value }))
                  }
                  options={variants.map((v) => ({
                    value: v.speciesId,
                    label: v.usage
                      ? `${v.label} — ${Math.round(v.usagePct * 100)}% usage`
                      : `${v.label} — no usage data`,
                  }))}
                />
              </div>
            )}
            <OpponentSlotAnalysis
              speciesId={chosen.speciesId}
              usage={chosen.usage}
              myTeam={myTeam}
              myMons={myMons}
              trickRoom={trickRoom}
            />
          </>
        ) : (
          <p style={{ color: 'var(--text-mut)' }}>
            This slot hasn&apos;t been identified yet — pick a species above to see its analysis.
          </p>
        )}
      </div>
    </Card>
  );
}
