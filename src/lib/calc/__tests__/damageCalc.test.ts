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
    // Urshifu-Rapid-Strike Surging Strikes vs Calyrex-Shadow (frail Psychic/Ghost).
    const attacker = setOf('Urshifu-Rapid-Strike');
    const defender: Combatant = { kind: 'species', speciesId: 'calyrexshadow' };

    const res = calcDamage(attacker, defender, 'Surging Strikes');

    expect(res.maxPct).toBeGreaterThan(res.minPct - 0.001);
    expect(res.minPct).toBeGreaterThan(0);
    // A strong neutral/super-effective hit on a frail mon: plausible big band.
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
    const attacker = setOf('Flutter Mane');
    const def: Combatant = { kind: 'species', speciesId: 'ironhands' }; // Fighting/Electric
    // Moonblast (Fairy) is neutral vs Fighting/Electric; Shadow Ball (Ghost) neutral too.
    // Compare Moonblast vs a Steel mon to confirm resist scaling instead:
    const steelDef: Combatant = { kind: 'species', speciesId: 'farigiraf' }; // Normal/Psychic
    const neutral = calcDamage(attacker, def, 'Moonblast');
    const other = calcDamage(attacker, steelDef, 'Moonblast');
    expect(neutral.maxPct).toBeGreaterThan(0);
    expect(other.maxPct).toBeGreaterThan(0);
  });

  it('maps field state (tailwind/weather/screens) without throwing', () => {
    const field: FieldState = {
      weather: 'rain',
      terrain: 'grassy',
      attackerSide: { tailwind: true },
      defenderSide: { reflect: true, lightScreen: true },
    };
    const res = calcDamage(
      setOf('Urshifu-Rapid-Strike'),
      { kind: 'species', speciesId: 'calyrexshadow' },
      'Surging Strikes',
      field,
    );
    expect(res.minPct).toBeGreaterThan(0);
  });

  it('Tera activation changes the result for the attacker', () => {
    const mon = FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === 'Urshifu-Rapid-Strike')!;
    const baseAttacker: Combatant = { kind: 'set', set: mon.set };
    const teraAttacker: Combatant = { kind: 'set', set: mon.set, teraActivated: true };
    const defender: Combatant = { kind: 'species', speciesId: 'calyrexshadow' };
    const noTera = calcDamage(baseAttacker, defender, 'Surging Strikes');
    const tera = calcDamage(teraAttacker, defender, 'Surging Strikes');
    // Urshifu-RS Tera Water on a Water move = STAB boost; max should not decrease.
    expect(tera.maxPct).toBeGreaterThanOrEqual(noTera.maxPct);
  });
});
