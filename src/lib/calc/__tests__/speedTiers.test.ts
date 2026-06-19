import { describe, it, expect } from 'vitest';
import { Sets } from '@pkmn/sets';
import {
  calcSpeed,
  applySpeedModifiers,
  buildSpeedTiers,
  speedBounds,
  weatherSpeedBoostActive,
} from '../speedTiers';
import { FIXTURE_MY_TEAM } from '../../../shared/fixtures';
import type { PokemonSet } from '../../../shared/types';

const byName = (name: string) => {
  const mon = FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === name);
  if (!mon) throw new Error(`fixture has no ${name}`);
  return mon;
};

describe('calcSpeed', () => {
  it('matches the speed precomputed in the fixture', () => {
    for (const mon of FIXTURE_MY_TEAM.pokemon) {
      expect(calcSpeed(mon.set)).toBe(mon.speed);
    }
  });

  it('Jolly 252 Spe Garchomp sits in a sane Lv50 range', () => {
    const spe = calcSpeed(byName('Garchomp').set);
    expect(spe).toBeGreaterThan(140);
    expect(spe).toBeLessThanOrEqual(170);
  });
});

describe('applySpeedModifiers', () => {
  it('composes tailwind, scarf and paralysis multiplicatively (floored)', () => {
    expect(applySpeedModifiers(100, { tailwind: true })).toBe(200);
    expect(applySpeedModifiers(100, { choiceScarf: true })).toBe(150);
    expect(applySpeedModifiers(101, { paralysis: true })).toBe(50);
    expect(applySpeedModifiers(100, { tailwind: true, choiceScarf: true })).toBe(300);
  });

  it('applies stage boosts', () => {
    expect(applySpeedModifiers(100, { stages: 1 })).toBe(150);
    expect(applySpeedModifiers(100, { stages: -1 })).toBe(66);
  });

  it('doubles for a weather-speed ability, stacking with Tailwind', () => {
    expect(applySpeedModifiers(100, { weatherSpeedBoost: true })).toBe(200);
    expect(applySpeedModifiers(100, { weatherSpeedBoost: true, tailwind: true })).toBe(400);
  });
});

describe('weatherSpeedBoostActive', () => {
  it('matches each weather-speed ability to its weather', () => {
    expect(weatherSpeedBoostActive('Swift Swim', 'rain')).toBe(true);
    expect(weatherSpeedBoostActive('Chlorophyll', 'sun')).toBe(true);
    expect(weatherSpeedBoostActive('Sand Rush', 'sand')).toBe(true);
    expect(weatherSpeedBoostActive('Slush Rush', 'snow')).toBe(true);
  });

  it('is false on a weather mismatch, no weather, or a non-speed ability', () => {
    expect(weatherSpeedBoostActive('Swift Swim', 'sun')).toBe(false);
    expect(weatherSpeedBoostActive('Swift Swim', undefined)).toBe(false);
    expect(weatherSpeedBoostActive('Damp', 'rain')).toBe(false);
    expect(weatherSpeedBoostActive(undefined, 'rain')).toBe(false);
  });
});

describe('buildSpeedTiers', () => {
  it('orders high→low by effective speed', () => {
    const tiers = buildSpeedTiers(
      FIXTURE_MY_TEAM.pokemon.map((p) => ({ label: p.set.species ?? '?', set: p.set })),
    );
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i - 1].effectiveSpeed).toBeGreaterThanOrEqual(tiers[i].effectiveSpeed);
    }
    // Dragapult (Jolly 252 Spe, base 142) should be the fastest of the team.
    expect(tiers[0].label).toBe('Dragapult');
    // Hatterene (0 Spe IV, Sassy) should be slowest.
    expect(tiers[tiers.length - 1].label).toBe('Hatterene');
  });

  it('Trick Room reverses ordering (slowest first)', () => {
    const inputs = FIXTURE_MY_TEAM.pokemon.map((p) => ({
      label: p.set.species ?? '?',
      set: p.set,
    }));
    const normal = buildSpeedTiers(inputs);
    const tr = buildSpeedTiers(inputs, { trickRoom: true });
    expect(tr[0].label).toBe(normal[normal.length - 1].label);
    expect(tr[tr.length - 1].label).toBe(normal[0].label);
  });

  it('a scarfed slower mon can outspeed a faster unscarfed one', () => {
    const tiers = buildSpeedTiers([
      { label: 'fast', stat: 150 },
      { label: 'scarfed', stat: 110, modifiers: { choiceScarf: true } }, // 165 eff
    ]);
    expect(tiers[0].label).toBe('scarfed');
  });
});

describe('Mega speed', () => {
  const speedSet = (species: string, item: string): PokemonSet =>
    Sets.importSet(
      `${species} @ ${item}\nLevel: 50\nJolly Nature\nEVs: 252 Spe\n- Tackle`,
    ) as PokemonSet;

  it('Mega Manectric (105→135) speeds up; Mega Garchomp (102→92) slows down', () => {
    const manectric = speedSet('Manectric', 'Manectite');
    const garchomp = speedSet('Garchomp', 'Garchompite');
    // Base order: Garchomp (102) ahead of Manectric (105)? Manectric base 105 > Garchomp 102.
    expect(calcSpeed(manectric)).toBeGreaterThan(calcSpeed(garchomp));
    // Mega: Manectric 135 > Garchomp 92 — gap widens, Manectric still first.
    expect(calcSpeed(manectric, true)).toBeGreaterThan(calcSpeed(manectric));
    expect(calcSpeed(garchomp, true)).toBeLessThan(calcSpeed(garchomp));

    const tiers = buildSpeedTiers([
      { label: 'Manectric', set: manectric, megaActivated: true },
      { label: 'Garchomp', set: garchomp, megaActivated: true },
    ]);
    expect(tiers[0].label).toBe('Manectric');
  });
});

describe('speedBounds', () => {
  it('returns a sane min<max range for a base-100 Speed mon at Lv50', () => {
    const { min, max } = speedBounds(100);
    expect(min).toBeLessThan(max);
    expect(min).toBeGreaterThan(90); // 0 EV neutral, base 100, Lv50
    expect(max).toBeLessThanOrEqual(200);
  });
});
