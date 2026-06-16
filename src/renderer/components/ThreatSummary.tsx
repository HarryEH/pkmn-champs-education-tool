import React, { useMemo, useState } from 'react';
import { Card } from '../ui';
import { SpeedTierList } from './SpeedTierList';
import { pokemonIconStyle } from './pokemonIcon';
import { gen } from '../../lib/calc/gen';
import { scanThreats, type ThreatScan } from '../../lib/smogon/threatScan';
import type { SpeedTierInput } from '../../lib/calc/speedTiers';
import type { MyPokemon, MyTeam, OpponentTeam, UsageData } from '../../shared/types';
import { likelySpeedInput } from '../screens/Detection/opponentBuild';
import { representativeOpponent } from '../screens/Detection/matrixBuild';

export interface ThreatSummaryProps {
  myTeam: MyTeam;
  opponent: OpponentTeam;
  usage: UsageData | null;
}

function myDisplayName(mon: MyPokemon): string {
  return mon.set.name && mon.set.name !== mon.set.species
    ? mon.set.name
    : (mon.set.species ?? 'Unknown');
}

/** A small species chip: icon + name. */
function SpeciesChip({ name }: { name: string }) {
  const id = gen.species.get(name)?.id ?? name;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: 'var(--space-0) var(--space-1)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-2)',
        fontSize: 'var(--font-xs)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={pokemonIconStyle(id)} aria-hidden />
      {name}
    </span>
  );
}

/** A labelled flag row: text label + the species chips that bring it. */
function FlagRow({
  label,
  species,
  detail,
}: {
  label: string;
  species: string[];
  detail?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
          fontSize: 'var(--font-xs)',
        }}
      >
        <span style={{ fontWeight: 700 }}>{label}</span>
        {detail && <span style={{ color: 'var(--text-mut)' }}>{detail}</span>}
      </div>
      {species.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {species.map((s) => (
            <SpeciesChip key={s} name={s} />
          ))}
        </div>
      ) : (
        <span style={{ fontSize: 'var(--font-2xs)', color: 'var(--text-mut)' }}>none detected</span>
      )}
    </div>
  );
}

/** A small section header inside the rail. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div
        style={{
          fontSize: 'var(--font-2xs)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          fontWeight: 700,
          color: 'var(--text-mut)',
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/** Whether a scan has *any* signal at all (drives the empty state). */
function hasSignal(scan: ThreatScan): boolean {
  return (
    scan.tailwind.length > 0 ||
    scan.trickRoom.length > 0 ||
    scan.scarf.length > 0 ||
    scan.priority.length > 0 ||
    scan.intimidate.length > 0 ||
    scan.redirection.length > 0 ||
    scan.fakeOut.length > 0 ||
    scan.sleep.length > 0 ||
    scan.taunt.length > 0 ||
    scan.dangerousItems.length > 0
  );
}

/**
 * Detection right rail (plan §3.3): the synthesized "what archetype is this and
 * what do I play around" panel. Renders {@link scanThreats} as compact chip
 * groups — speed control, disruption, dangerous items — plus a collapsible
 * merged 12-mon speed tier list. Degrades to a quiet note when usage is empty.
 */
export function ThreatSummary({ myTeam, opponent, usage }: ThreatSummaryProps) {
  const [tiersOpen, setTiersOpen] = useState(false);

  const scan = useMemo(() => scanThreats(opponent.slots, usage), [opponent.slots, usage]);
  const signal = hasSignal(scan);

  // Merged 12-mon speed tiers: your 6 sets + the 6 opponent likely-speed lines.
  const mineSpeed: SpeedTierInput[] = useMemo(
    () => myTeam.pokemon.map((mon) => ({ label: myDisplayName(mon), set: mon.set })),
    [myTeam],
  );
  const oppSpeed: SpeedTierInput[] = useMemo(
    () =>
      opponent.slots.flatMap((slot) => {
        const rep = representativeOpponent(slot.speciesId, usage);
        if (!rep) return [];
        return [likelySpeedInput(rep.speciesId, rep.usage, rep.label)];
      }),
    [opponent.slots, usage],
  );

  const priorityDetail = scan.priority.map((p) => p.move).join(', ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Card title="Threats & speed">
        {!signal && (
          <p
            style={{
              margin: '0 0 var(--space-3)',
              fontSize: 'var(--font-xs)',
              color: 'var(--text-mut)',
            }}
          >
            {usage
              ? 'No notable speed-control, disruption, or item tells in this team.'
              : 'No usage data yet — threats light up when Champions stats publish.'}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Section title="Speed control">
            <FlagRow label="⚡ Tailwind" species={scan.tailwind} />
            <FlagRow label="🌀 Trick Room" species={scan.trickRoom} />
            <FlagRow label="👟 Choice Scarf" species={scan.scarf} />
            <FlagRow
              label="⏩ Priority"
              species={[...new Set(scan.priority.flatMap((p) => p.species))]}
              detail={priorityDetail || undefined}
            />
          </Section>

          <Section title="Disruption">
            <FlagRow label="✊ Fake Out" species={scan.fakeOut} />
            <FlagRow label="🎯 Redirection" species={scan.redirection} />
            <FlagRow label="😾 Intimidate" species={scan.intimidate} />
            <FlagRow label="💤 Sleep" species={scan.sleep} />
            <FlagRow label="🤐 Taunt" species={scan.taunt} />
          </Section>

          <Section title="Dangerous items">
            {scan.dangerousItems.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {scan.dangerousItems.map((di) => (
                  <FlagRow key={di.item} label={di.item} species={di.species} />
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 'var(--font-2xs)', color: 'var(--text-mut)' }}>
                none detected
              </span>
            )}
          </Section>
        </div>
      </Card>

      <Card
        title={`Merged speed tiers (${mineSpeed.length + oppSpeed.length})`}
        actions={
          <button
            type="button"
            onClick={() => setTiersOpen((o) => !o)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-mut)',
              fontSize: 'var(--font-xs)',
            }}
          >
            {tiersOpen ? 'Hide ▴' : 'Show ▾'}
          </button>
        }
      >
        {tiersOpen ? (
          <SpeedTierList mine={mineSpeed} opponent={oppSpeed} />
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--font-2xs)', color: 'var(--text-mut)' }}>
            All 12 mons interleaved by Speed (opponent uses their most-likely line).
          </p>
        )}
      </Card>
    </div>
  );
}
