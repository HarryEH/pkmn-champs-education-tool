import { describe, expect, it } from 'vitest';
import {
  candidateOpponentMoves,
  formatPctRange,
  koCell,
  likelyOpponentSpeedInput,
  opponentSpeedWithLikely,
} from '../battleBuild';
import type { DamageResult } from '../../../../lib/calc/damageCalc';
import type { SpeciesUsage } from '../../../../shared/types';

/** Minimal usage fixture for Flutter Mane: a damaging move, a Status move, a spread. */
const fluttermaneUsage: SpeciesUsage = {
  speciesId: 'fluttermane',
  usage: 0.3,
  items: [{ name: 'Choice Specs', usage: 0.4 }],
  abilities: [{ name: 'Protosynthesis', usage: 1 }],
  teraTypes: [],
  moves: [
    { name: 'Moonblast', usage: 0.9 },
    { name: 'Protect', usage: 0.8 }, // Status — must be filtered out
    { name: 'Shadow Ball', usage: 0.7 },
    { name: 'Thunderbolt', usage: 0.5 },
  ],
  spreads: [{ name: 'Timid:0/0/0/252/4/252', usage: 0.6 }],
};

describe('candidateOpponentMoves', () => {
  it('keeps only damaging moves from the top usage list', () => {
    const moves = candidateOpponentMoves(fluttermaneUsage, 8);
    expect(moves).toContain('Moonblast');
    expect(moves).toContain('Shadow Ball');
    expect(moves).not.toContain('Protect');
  });

  it('returns [] for empty usage', () => {
    expect(candidateOpponentMoves(undefined)).toEqual([]);
  });

  it('respects the cap', () => {
    // Cap 1 grabs only Moonblast (top usage, damaging).
    expect(candidateOpponentMoves(fluttermaneUsage, 1)).toEqual(['Moonblast']);
  });
});

describe('likelyOpponentSpeedInput', () => {
  it('computes a real stat from the top spread and labels it (likely)', () => {
    const input = likelyOpponentSpeedInput('fluttermane', fluttermaneUsage, undefined, false);
    expect(input.label).toContain('(likely)');
    // Flutter Mane base 135 Spe, 252 EV / Timid (+Spe) at L50 → 205.
    expect(input.stat).toBe(205);
  });

  it('applies the tailwind modifier and degrades to base stat on empty usage', () => {
    const input = likelyOpponentSpeedInput('fluttermane', undefined, undefined, true);
    expect(input.modifiers?.tailwind).toBe(true);
    // No spread → 0 EV neutral base.
    expect(input.stat).toBeGreaterThan(0);
  });
});

describe('opponentSpeedWithLikely', () => {
  it('puts the likely line first, followed by the min/max/+Scarf bounds', () => {
    const rows = opponentSpeedWithLikely('fluttermane', fluttermaneUsage, undefined, false);
    expect(rows[0].label).toContain('(likely)');
    expect(rows).toHaveLength(4); // likely + min + max + max+Scarf
    expect(rows.some((r) => r.label.includes('(min)'))).toBe(true);
    expect(rows.some((r) => r.label.includes('+Scarf'))).toBe(true);
  });
});

describe('formatPctRange / koCell', () => {
  const mk = (minPct: number, maxPct: number): DamageResult => ({
    minPct,
    maxPct,
    koChance: undefined,
    desc: '',
  });

  it('formats a range and a point', () => {
    expect(formatPctRange(mk(61, 78))).toBe('61–78%');
    expect(formatPctRange(mk(78, 78))).toBe('78%');
  });

  it('summarizes a KO cell with headline + pct', () => {
    const cell = koCell(mk(105, 120));
    expect(cell.ko.label).toBe('1HKO');
    expect(cell.pct).toBe('105–120%');
  });

  it('marks a no-damage roll as —', () => {
    const cell = koCell(mk(0, 0));
    expect(cell.ko.label).toBe('—');
  });
});
