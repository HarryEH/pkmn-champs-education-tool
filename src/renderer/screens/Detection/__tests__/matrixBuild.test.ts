import { describe, expect, it } from 'vitest';
import type { PokemonSet, SpeciesUsage, UsageData } from '../../../../shared/types';
import { FIXTURE_MY_TEAM } from '../../../../shared/fixtures';
import { buildMatrixCell, likelyMovesOf } from '../matrixBuild';

function speciesUsage(speciesId: string, over: Partial<SpeciesUsage> = {}): SpeciesUsage {
  return {
    speciesId,
    usage: 0.1,
    items: [],
    abilities: [],
    teraTypes: [],
    moves: [],
    spreads: [],
    ...over,
  };
}

function usageData(species: Record<string, SpeciesUsage>): UsageData {
  return { format: 'gen9championsvgc2026regma', month: '2026-06', fetchedAt: 0, species };
}

const myMon = FIXTURE_MY_TEAM.pokemon[0];

describe('likelyMovesOf', () => {
  it('keeps non-Status moves, drops Status, caps at 8', () => {
    const usage = speciesUsage('incineroar', {
      moves: [
        { name: 'Flare Blitz', usage: 0.9 },
        { name: 'Protect', usage: 0.8 }, // Status → dropped
        { name: 'Knock Off', usage: 0.7 },
        { name: 'Fake Out', usage: 0.6 },
        { name: 'Parting Shot', usage: 0.5 }, // Status → dropped
      ],
    });
    const moves = likelyMovesOf(usage);
    expect(moves).toContain('Flare Blitz');
    expect(moves).toContain('Knock Off');
    expect(moves).not.toContain('Protect');
    expect(moves).not.toContain('Parting Shot');
  });

  it('returns [] for missing usage', () => {
    expect(likelyMovesOf(undefined)).toEqual([]);
  });
});

describe('buildMatrixCell', () => {
  it('computes both sides and a verdict for a usage-backed pairing', () => {
    const usage = usageData({
      Incineroar: speciesUsage('incineroar', {
        items: [{ name: 'Assault Vest', usage: 0.5 }],
        abilities: [{ name: 'Intimidate', usage: 0.9 }],
        spreads: [{ name: 'Adamant:236/0/4/0/116/156', usage: 0.4 }],
        moves: [
          { name: 'Flare Blitz', usage: 0.9 },
          { name: 'Knock Off', usage: 0.8 },
        ],
      }),
    });

    const cell = buildMatrixCell(myMon, 'incineroar', usage);

    // Your offense computes from your own set regardless of usage.
    expect(cell.myOffense.move).toBeTruthy();
    expect(cell.myOffense.pct).toMatch(/%$/);
    // Their offense lights up from the usage movepool.
    expect(cell.theirOffense.move).toBeTruthy();
    expect(cell.theirUsageMissing).toBe(false);
    expect(['win', 'lose', 'even']).toContain(cell.verdict);
    expect(['up', 'down', 'tie']).toContain(cell.speed);
    expect(typeof cell.speedDelta).toBe('number');
  });

  it('degrades opponent offense to "—" with empty usage, but keeps your offense + speed', () => {
    const cell = buildMatrixCell(myMon, 'incineroar', null);

    // No usage → opponent has no plausible movepool, so their offense is empty.
    expect(cell.theirOffense.move).toBeNull();
    expect(cell.theirOffense.ko.label).toBe('—');
    expect(cell.theirUsageMissing).toBe(true);
    // Your offense + speed still resolve from your own set.
    expect(cell.myOffense.move).toBeTruthy();
    expect(typeof cell.speedDelta).toBe('number');
    expect(cell.theirLabel).not.toBe('—');
  });

  it('handles an unidentified opponent slot without throwing', () => {
    const cell = buildMatrixCell(myMon, null, null);
    expect(cell.myOffense.move).toBeNull();
    expect(cell.theirOffense.move).toBeNull();
    expect(cell.verdict).toBe('even');
    expect(cell.theirLabel).toBe('—');
  });

  it('uses an exact set (paste) for opponent offense/speed even with no usage', () => {
    const set = {
      species: 'Incineroar',
      item: 'Choice Band',
      ability: 'Intimidate',
      level: 50,
      nature: 'Jolly',
      evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
      moves: ['Flare Blitz', 'Knock Off', 'Protect'],
    } as PokemonSet;
    // No usage at all, but the exact set is known (PokePaste source).
    const cell = buildMatrixCell(myMon, 'incineroar', null, undefined, set);

    // A paste means the opponent is never "usage missing"; their offense computes
    // from the set's damaging moves (Protect is Status → ignored).
    expect(cell.theirUsageMissing).toBe(false);
    expect(['Flare Blitz', 'Knock Off']).toContain(cell.theirOffense.move);
    expect(typeof cell.speedDelta).toBe('number');
    expect(cell.theirLabel).toBe('Incineroar');
  });
});
