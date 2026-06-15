import { describe, it, expect } from 'vitest';
import { getMatchup, defensiveProfile, allTypes } from '../typeMatchup';

describe('getMatchup', () => {
  it('handles single-type super effective / resisted / immune', () => {
    expect(getMatchup('Water', ['Fire'])).toBe(2);
    expect(getMatchup('Fire', ['Water'])).toBe(0.5);
    expect(getMatchup('Normal', ['Ghost'])).toBe(0);
    expect(getMatchup('Water', ['Normal'])).toBe(1);
  });

  it('multiplies across dual types (4x and 0.25x)', () => {
    // Electric vs Water/Flying (Gyarados) = 2 * 2 = 4.
    expect(getMatchup('Electric', ['Water', 'Flying'])).toBe(4);
    // Fire vs Water/Dragon ... use Grass vs Water/Ground (Quagsire) = 2 * 2 = 4.
    expect(getMatchup('Grass', ['Water', 'Ground'])).toBe(4);
    // Fighting vs Psychic/Fairy ... use a 0.25x: Fire vs Fire/Water? -> use Bug vs Fire/Flying.
    expect(getMatchup('Bug', ['Fire', 'Flying'])).toBeCloseTo(0.25);
  });

  it('treats unknown types as neutral rather than throwing', () => {
    expect(getMatchup('NotAType', ['Fire'])).toBe(1);
    expect(getMatchup('Water', ['NotAType'])).toBe(1);
  });
});

describe('defensiveProfile', () => {
  it('returns a multiplier for every attacking type', () => {
    const profile = defensiveProfile('Incineroar'); // Fire/Dark
    const types = allTypes();
    expect(Object.keys(profile).sort()).toEqual([...types].sort());
    // Incineroar (Fire/Dark): weak to Water, Ground, Rock, Fighting.
    expect(profile['Water']).toBe(2);
    // Fighting: vs Fire 1, vs Dark 2 -> 2x overall.
    expect(profile['Fighting']).toBe(2);
    // Ground: vs Fire 2, vs Dark 1 -> 2x.
    expect(profile['Ground']).toBe(2);
  });

  it('Incineroar Fire/Dark key resistances and immunity', () => {
    const profile = defensiveProfile('Incineroar');
    // Psychic is immune-ish? No: Dark is immune to Psychic.
    expect(profile['Psychic']).toBe(0);
    // Fire resists Fire, Grass, Ice, Bug, Steel, Fairy, Dark, Ghost (some via Dark).
    expect(profile['Fire']).toBe(0.5);
    expect(profile['Grass']).toBe(0.5);
  });
});
