import { describe, it, expect } from 'vitest';
import { calcSpeed, applySpeedModifiers, buildSpeedTiers } from '../speedTiers';
import { FIXTURE_MY_TEAM } from '../../../shared/fixtures';

const byName = (name: string) =>
  FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === name)!;

describe('calcSpeed', () => {
  it('matches the speed precomputed in the fixture', () => {
    for (const mon of FIXTURE_MY_TEAM.pokemon) {
      expect(calcSpeed(mon.set)).toBe(mon.speed);
    }
  });

  it('Jolly 252 Spe Urshifu sits in a sane Lv50 range', () => {
    const spe = calcSpeed(byName('Urshifu-Rapid-Strike').set);
    expect(spe).toBeGreaterThan(140);
    expect(spe).toBeLessThan(170);
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
});

describe('buildSpeedTiers', () => {
  it('orders high→low by effective speed', () => {
    const tiers = buildSpeedTiers(
      FIXTURE_MY_TEAM.pokemon.map((p) => ({ label: p.set.species ?? '?', set: p.set })),
    );
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i - 1].effectiveSpeed).toBeGreaterThanOrEqual(tiers[i].effectiveSpeed);
    }
    // Flutter Mane (Timid 252 Spe, base 135) should be the fastest of the team.
    expect(tiers[0].label).toBe('Flutter Mane');
    // Amoonguss (0 Spe IV min-invest) should be slowest.
    expect(tiers[tiers.length - 1].label).toBe('Amoonguss');
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
