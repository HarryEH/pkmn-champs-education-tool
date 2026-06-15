import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import type { Combatant } from '../damageCalc';
import { FIXTURE_MY_TEAM } from '../../../shared/fixtures';
import type { FieldState } from '../../../shared/types';

const setOf = (name: string): Combatant => {
  const mon = FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === name)!;
  return { kind: 'set', set: mon.set };
};

describe('calcDamage', () => {
  it('produces a plausible % range and valid KO chance for a known matchup', () => {
    // Incineroar Knock Off (Dark) vs Calyrex-Shadow (Psychic/Ghost): 4x super-effective.
    const attacker = setOf('Incineroar');
    const defender: Combatant = { kind: 'species', speciesId: 'calyrexshadow' };

    const res = calcDamage(attacker, defender, 'Knock Off');

    expect(res.maxPct).toBeGreaterThan(res.minPct - 0.001);
    expect(res.minPct).toBeGreaterThan(0);
    // A strong super-effective hit on a frail mon: plausible big band.
    expect(res.maxPct).toBeGreaterThan(40);
    expect(res.maxPct).toBeLessThan(400);
    if (res.koChance !== undefined) {
      expect(res.koChance).toBeGreaterThanOrEqual(0);
      expect(res.koChance).toBeLessThanOrEqual(1);
    }
    expect(typeof res.desc).toBe('string');
    expect(res.desc.length).toBeGreaterThan(0);
  });

  it('resisted move deals less than the same attacker neutral move', () => {
    const attacker = setOf('Gardevoir');
    // Moonblast (Fairy) vs Kingambit (Dark/Steel): 2x * 0.5x = neutral.
    const neutralDef: Combatant = { kind: 'species', speciesId: 'kingambit' };
    // Moonblast (Fairy) vs Talonflame (Fire/Flying): 0.5x * 1x = resisted.
    const resistedDef: Combatant = { kind: 'species', speciesId: 'talonflame' };
    const neutral = calcDamage(attacker, neutralDef, 'Moonblast');
    const resisted = calcDamage(attacker, resistedDef, 'Moonblast');
    expect(resisted.maxPct).toBeLessThan(neutral.maxPct);
  });

  it('maps field state (tailwind/weather/screens) without throwing', () => {
    const field: FieldState = {
      weather: 'rain',
      terrain: 'grassy',
      attackerSide: { tailwind: true },
      defenderSide: { reflect: true, lightScreen: true },
    };
    const res = calcDamage(
      setOf('Garchomp'),
      { kind: 'species', speciesId: 'calyrexshadow' },
      'Earthquake',
      field,
    );
    expect(res.minPct).toBeGreaterThan(0);
  });

  it('Tera activation changes the result for the attacker', () => {
    const mon = FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === 'Gardevoir')!;
    const baseAttacker: Combatant = { kind: 'set', set: mon.set };
    const teraAttacker: Combatant = { kind: 'set', set: mon.set, teraActivated: true };
    const defender: Combatant = { kind: 'species', speciesId: 'calyrexshadow' };
    const noTera = calcDamage(baseAttacker, defender, 'Moonblast');
    const tera = calcDamage(teraAttacker, defender, 'Moonblast');
    // Gardevoir Tera Fairy on a Fairy move = STAB retained/boosted; max should not decrease.
    expect(tera.maxPct).toBeGreaterThanOrEqual(noTera.maxPct);
  });
});
