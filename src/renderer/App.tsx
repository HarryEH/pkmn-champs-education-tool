import React, { useEffect } from 'react';
import { useNavStore, type Screen } from './store/nav';
import { useTeamsStore } from './store/teams';
import { useSettingsStore } from './store/settings';
import { useLabelsStore } from './store/labels';
import { TeamSetupScreen } from './screens/TeamSetup';
import { DetectionScreen } from './screens/Detection';
import { InBattleScreen } from './screens/InBattle';
import { CURRENT_FORMAT } from '../shared/types';

const NAV: { id: Screen; label: string }[] = [
  { id: 'setup', label: 'Team Setup' },
  { id: 'detection', label: 'Detection' },
  { id: 'battle', label: 'In-Battle' },
];

/** Small Pokéball glyph for the nav. */
function Pokeball({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: `linear-gradient(to bottom, ${active ? 'var(--poke-red)' : 'var(--text-mut)'} 0 50%, var(--surface) 50% 100%)`,
        border: '1.5px solid var(--poke-black)',
        position: 'relative',
      }}
    />
  );
}

export function App() {
  const screen = useNavStore((s) => s.screen);
  const go = useNavStore((s) => s.go);
  const hydrateTeams = useTeamsStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateLabels = useLabelsStore((s) => s.hydrate);

  // Persisted stores hydrate from IPC on boot (plan §2).
  useEffect(() => {
    void hydrateTeams();
    void hydrateSettings();
    void hydrateLabels();
  }, [hydrateTeams, hydrateSettings, hydrateLabels]);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Left nav */}
      <nav
        style={{
          width: 200,
          flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            height: 4,
            background: 'var(--poke-red)',
          }}
        />
        <div style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Champions Assistant</div>
          <div style={{ color: 'var(--gold)', fontSize: 11, fontWeight: 700, marginTop: 2 }}>
            {CURRENT_FORMAT}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 var(--space-2)' }}>
          {NAV.map((item) => {
            const active = item.id === screen;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  font: 'inherit',
                  fontWeight: active ? 700 : 500,
                  textAlign: 'left',
                  background: active ? 'var(--surface-2)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-mut)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  margin: '2px 0',
                  cursor: 'pointer',
                }}
              >
                <Pokeball active={active} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Screen body */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {screen === 'setup' && <TeamSetupScreen />}
        {screen === 'detection' && <DetectionScreen />}
        {screen === 'battle' && <InBattleScreen />}
      </main>
    </div>
  );
}
