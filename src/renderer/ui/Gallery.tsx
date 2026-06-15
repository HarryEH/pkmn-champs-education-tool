import React, { useState } from 'react';
import { Button } from './Button';
import { Card } from './Card';
import { Tabs } from './Tabs';
import { Toggle } from './Toggle';
import { Select } from './Select';
import { TypeBadge } from './TypeBadge';
import { Stat } from './Stat';
import { TYPE_COLORS } from '../theme/types';
import { matchupTint, type MatchupMultiplier } from '../theme/matchup';

const ALL_TYPES = Object.keys(TYPE_COLORS);
const MULTIPLIERS: MatchupMultiplier[] = [0, 0.25, 0.5, 1, 2, 4];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card title={title} style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {children}
      </div>
    </Card>
  );
}

/** A full design-system panel rendered inside one theme mode. */
function ShowcasePanel() {
  const [tab, setTab] = useState('overview');
  const [toggleA, setToggleA] = useState(true);
  const [toggleB, setToggleB] = useState(false);
  const [sel, setSel] = useState('gen9');
  const noop = () => undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <Section title="Buttons">
        <div className="pk-gallery__row">
          <Button variant="primary" size="sm">
            Primary sm
          </Button>
          <Button variant="primary">Primary md</Button>
          <Button variant="primary" size="lg">
            Primary lg
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs
          items={[
            { id: 'overview', label: 'Overview' },
            { id: 'matchups', label: 'Matchups' },
            { id: 'speed', label: 'Speed Tiers' },
          ]}
          activeId={tab}
          onChange={setTab}
        />
        <span style={{ color: 'var(--text-mut)', fontSize: 13 }}>Active tab: {tab}</span>
      </Section>

      <Section title="Toggle and Select">
        <div className="pk-gallery__row">
          <Toggle checked={toggleA} onChange={setToggleA} label="Battle mode" />
          <Toggle checked={toggleB} onChange={setToggleB} label="Show EVs" />
          <Toggle checked={false} onChange={noop} label="Disabled" disabled />
          <Select
            value={sel}
            onChange={setSel}
            options={[
              { value: 'gen9', label: 'Gen 9 (Reg G)' },
              { value: 'gen8', label: 'Gen 8 (Series 13)' },
              { value: 'gen7', label: 'Gen 7 (VGC 2019)' },
            ]}
          />
        </div>
      </Section>

      <Section title="Type badges (all 18)">
        <div className="pk-gallery__row">
          {ALL_TYPES.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}
        </div>
        <div className="pk-gallery__row">
          {ALL_TYPES.slice(0, 6).map((t) => (
            <TypeBadge key={t} type={t} size="sm" />
          ))}
          <TypeBadge type="???" />
        </div>
      </Section>

      <Section title="Stats and speed flags">
        <div className="pk-gallery__row">
          <Stat label="HP" value={175} />
          <Stat label="Atk" value={120} />
          <Stat label="Def" value={90} />
          <Stat label="SpA" value={60} />
          <Stat label="SpD" value={95} />
          <Stat label="Spe" value={134} emphasis />
        </div>
        <div className="pk-gallery__row">
          <Stat label="Outspeed" value="+12" tone="faster" />
          <Stat label="Speed tie" value="=" tone="tie" />
          <Stat label="Outsped" value="-8" tone="slower" />
        </div>
      </Section>

      <Section title="Matchup tint scale">
        <div className="pk-gallery__grid">
          {MULTIPLIERS.map((m) => {
            const tint = matchupTint(m);
            return (
              <div
                key={m}
                className="pk-gallery__cell"
                style={{ background: tint.bg, color: tint.fg }}
              >
                {tint.label}
              </div>
            );
          })}
        </div>
        <span style={{ color: 'var(--text-mut)', fontSize: 13 }}>
          0x immune (grey) - resist green - 1x neutral - weak red. Label always present.
        </span>
      </Section>

      <Section title="Interactive card">
        <Card interactive title="Flutter Mane" actions={<TypeBadge type="Ghost" size="sm" />}>
          <div className="pk-gallery__row">
            <TypeBadge type="Ghost" />
            <TypeBadge type="Fairy" />
            <Stat label="Spe" value={135} emphasis />
          </div>
        </Card>
      </Section>
    </div>
  );
}

/**
 * Dev-only visual QA surface. Renders every primitive twice — once in the
 * light theme and once with `data-mode="battle"` — plus all 18 type badges,
 * the matchup tint scale, and speed-flag chips. Not wired into nav; mount it
 * anywhere (e.g. a temporary route) to eyeball the design system.
 */
export function Gallery() {
  return (
    <div className="pk-gallery" style={{ padding: 'var(--space-5)', minHeight: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 var(--space-4)' }}>
        Design System Gallery
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
        <div>
          <h2 style={{ fontSize: 15, color: 'var(--text-mut)', margin: '0 0 var(--space-3)' }}>
            Light mode
          </h2>
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 'var(--radius)',
              padding: 'var(--space-4)',
              border: '1px solid var(--border)',
            }}
          >
            <ShowcasePanel />
          </div>
        </div>

        <div data-mode="battle">
          <h2 style={{ fontSize: 15, color: 'var(--text-mut)', margin: '0 0 var(--space-3)' }}>
            Battle mode
          </h2>
          <div
            style={{
              background: 'var(--bg)',
              color: 'var(--text)',
              borderRadius: 'var(--radius)',
              padding: 'var(--space-4)',
              border: '1px solid var(--border)',
            }}
          >
            <ShowcasePanel />
          </div>
        </div>
      </div>
    </div>
  );
}
