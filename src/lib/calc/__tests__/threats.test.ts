import { describe, it, expect } from 'vitest';
import { bestMoveAgainst, relevantThreats, summarizeKo, cellVerdict } from '../threats';
import type { KoSummary } from '../threats';
import type { Combatant, DamageResult } from '../damageCalc';
import { FIXTURE_MY_TEAM } from '../../../shared/fixtures';

const monOf = (name: string) => {
  const mon = FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === name);
  if (!mon) throw new Error(`fixture has no ${name}`);
  return mon;
};
const setOf = (name: string): Combatant => ({ kind: 'set', set: monOf(name).set });
const speciesOf = (id: string): Combatant => ({ kind: 'species', speciesId: id });

const result = (minPct: number, maxPct: number): DamageResult => ({
  minPct,
  maxPct,
  koChance: undefined,
  desc: '',
});

describe('bestMoveAgainst', () => {
  it('picks the higher-damage move (super-effective over resisted)', () => {
    // Garchomp into Talonflame: Stone Edge (Rock, 4x) >> Earthquake (Ground, immune via Flying).
    const attacker = setOf('Garchomp');
    const defender = speciesOf('talonflame');
    const best = bestMoveAgainst(attacker, defender, ['Earthquake', 'Stone Edge']);
    expect(best).not.toBeNull();
    expect(best?.move).toBe('Stone Edge');
    expect(best?.result.maxPct).toBeGreaterThan(0);
  });

  it('skips Status and non-existent moves, returns null when none usable', () => {
    const attacker = setOf('Incineroar');
    const defender = speciesOf('kingambit');
    // Parting Shot is Status; "Not A Move" does not exist.
    expect(bestMoveAgainst(attacker, defender, ['Parting Shot', 'Not A Move'])).toBeNull();
  });
});

describe('relevantThreats', () => {
  const attacker = setOf('Garchomp');
  const defenders = [speciesOf('talonflame'), speciesOf('kingambit')];

  it('ranks moves by best max% across defenders, caps at n, sets vsDefender', () => {
    const threats = relevantThreats(
      attacker,
      defenders,
      ['Earthquake', 'Stone Edge', 'Dragon Claw'],
      undefined,
      2,
    );
    expect(threats).toHaveLength(2);
    // Ranked descending by best max%.
    expect(threats[0].bestResult.maxPct).toBeGreaterThanOrEqual(threats[1].bestResult.maxPct);
    // vsDefender is a valid index.
    for (const t of threats) {
      expect(t.vsDefender).toBeGreaterThanOrEqual(0);
      expect(t.vsDefender).toBeLessThan(defenders.length);
    }
    // Stone Edge (Rock 4x) hits Talonflame (index 0) hardest of the set.
    const stone = threats.find((t) => t.move === 'Stone Edge');
    expect(stone?.vsDefender).toBe(0);
  });

  it('returns empty for an empty candidate list', () => {
    expect(relevantThreats(attacker, defenders, [])).toEqual([]);
  });
});

describe('summarizeKo', () => {
  it('1HKO when one max roll clears 100%', () => {
    const ko = summarizeKo(result(95, 120));
    expect(ko.hits).toBe(1);
    expect(ko.label).toBe('1HKO');
  });

  it('2HKO and flags guaranteed when min also gets there in 2', () => {
    const ko = summarizeKo(result(55, 60));
    expect(ko.hits).toBe(2);
    expect(ko.label).toBe('2HKO');
    expect(ko.guaranteed).toBe(true); // 55 * 2 = 110 >= 100
  });

  it('2HKO not guaranteed when min rolls fall short', () => {
    const ko = summarizeKo(result(40, 60));
    expect(ko.hits).toBe(2);
    expect(ko.guaranteed).toBe(false); // 40 * 2 = 80 < 100
  });

  it("4HKO+ for low damage", () => {
    expect(summarizeKo(result(10, 20)).label).toBe('4HKO+');
  });

  it("'—' / null hits for 0% (immune/no damage)", () => {
    const ko = summarizeKo(result(0, 0));
    expect(ko.hits).toBeNull();
    expect(ko.label).toBe('—');
    expect(ko.guaranteed).toBe(false);
  });
});

describe('cellVerdict', () => {
  const ko = (hits: number | null): KoSummary => ({
    hits,
    label: hits === null ? '—' : hits === 1 ? '1HKO' : hits === 2 ? '2HKO' : '4HKO+',
    guaranteed: false,
  });

  it('fewer hits to KO wins outright (speed irrelevant)', () => {
    expect(cellVerdict(ko(2), ko(3), 'down')).toBe('win');
    expect(cellVerdict(ko(3), ko(2), 'up')).toBe('lose');
  });

  it('equal hits broken by speed', () => {
    expect(cellVerdict(ko(2), ko(2), 'up')).toBe('win');
    expect(cellVerdict(ko(2), ko(2), 'down')).toBe('lose');
    expect(cellVerdict(ko(2), ko(2), 'tie')).toBe('even');
  });

  it('a side that cannot KO never wins; both unable → even', () => {
    expect(cellVerdict(ko(null), ko(2), 'up')).toBe('lose');
    expect(cellVerdict(ko(2), ko(null), 'down')).toBe('win');
    expect(cellVerdict(ko(null), ko(null), 'up')).toBe('even');
  });
});
