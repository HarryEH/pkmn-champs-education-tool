import { describe, it, expect } from 'vitest';
import { scanThreats } from '../threatScan';
import type { OpponentSlot, SpeciesUsage, UsageData } from '../../../shared/types';

const e = (name: string) => ({ name, usage: 0.5 });

const species = (id: string, partial: Partial<SpeciesUsage>): SpeciesUsage => ({
  speciesId: id,
  items: [],
  abilities: [],
  teraTypes: [],
  moves: [],
  spreads: [],
  ...partial,
});

const slot = (speciesId: string): OpponentSlot => ({
  speciesId,
  candidates: [{ speciesId, confidence: 1 }],
});

// Keyed by display name (how UsageData.species is keyed in production).
const USAGE: UsageData = {
  format: 'gen9championsvgc2026regma',
  month: '2026-06',
  fetchedAt: 1,
  species: {
    Incineroar: species('incineroar', {
      // Mixed id/display-name forms to prove case/format-insensitive matching.
      moves: [e('fakeout'), e('Fake Out'), e('Parting Shot')],
      items: [e('Choice Scarf')],
      abilities: [e('intimidate')],
    }),
    Whimsicott: species('whimsicott', {
      moves: [e('Tailwind'), e('Taunt'), e('Encore')],
      items: [e('Focus Sash')],
      abilities: [e('Prankster')],
    }),
    Amoonguss: species('amoonguss', {
      moves: [e('Rage Powder'), e('Spore')],
      items: [e('Sitrus Berry')],
      abilities: [e('Regenerator')],
    }),
    Dragapult: species('dragapult', {
      moves: [e('Sucker Punch'), e('Shadow Ball')],
      items: [e('Assault Vest')],
      abilities: [e('Clear Body')],
    }),
  },
};

describe('scanThreats', () => {
  const slots = [slot('incineroar'), slot('whimsicott'), slot('amoonguss'), slot('dragapult')];
  const scan = scanThreats(slots, USAGE);

  it('flags speed control: Tailwind, Scarf', () => {
    expect(scan.tailwind).toContain('Whimsicott');
    expect(scan.scarf).toContain('Incineroar');
  });

  it('flags Fake Out (case/format-insensitive, deduped)', () => {
    expect(scan.fakeOut).toEqual(['Incineroar']);
  });

  it('flags Intimidate ability', () => {
    expect(scan.intimidate).toContain('Incineroar');
  });

  it('flags redirection and sleep', () => {
    expect(scan.redirection).toContain('Amoonguss');
    expect(scan.sleep).toContain('Amoonguss');
  });

  it('flags Taunt', () => {
    expect(scan.taunt).toContain('Whimsicott');
  });

  it('groups priority moves by move with contributing species', () => {
    const fakeOut = scan.priority.find((p) => p.move === 'Fake Out');
    expect(fakeOut?.species).toEqual(['Incineroar']);
    const sucker = scan.priority.find((p) => p.move === 'Sucker Punch');
    expect(sucker?.species).toEqual(['Dragapult']);
  });

  it('groups dangerous items by item with holders', () => {
    const byItem = Object.fromEntries(scan.dangerousItems.map((d) => [d.item, d.species]));
    expect(byItem['Choice Scarf']).toEqual(['Incineroar']);
    expect(byItem['Focus Sash']).toEqual(['Whimsicott']);
    expect(byItem['Sitrus Berry']).toEqual(['Amoonguss']);
    expect(byItem['Assault Vest']).toEqual(['Dragapult']);
  });
});

describe('scanThreats — empty cases', () => {
  const slots = [slot('incineroar')];
  const empty: UsageData = {
    format: 'gen9championsvgc2026regma',
    month: '2026-06',
    fetchedAt: 1,
    species: {},
  };

  it('returns all-empty (no throw) when usage is null', () => {
    const scan = scanThreats(slots, null);
    expect(scan).toEqual({
      tailwind: [],
      trickRoom: [],
      scarf: [],
      priority: [],
      intimidate: [],
      redirection: [],
      fakeOut: [],
      sleep: [],
      taunt: [],
      dangerousItems: [],
    });
  });

  it('returns all-empty when slots is empty', () => {
    const scan = scanThreats([], empty);
    expect(scan.tailwind).toEqual([]);
    expect(scan.priority).toEqual([]);
    expect(scan.dangerousItems).toEqual([]);
  });

  it('returns all-empty when usage has no matching species', () => {
    const scan = scanThreats(slots, empty);
    expect(scan.fakeOut).toEqual([]);
    expect(scan.scarf).toEqual([]);
  });
});
