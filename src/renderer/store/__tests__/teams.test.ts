import { describe, it, expect } from 'vitest';
import { parsePokepaste, createTeam, computeStat } from '../teams';
import { FIXTURE_POKEPASTE, FIXTURE_MY_TEAM } from '../../../shared/fixtures';

describe('parsePokepaste', () => {
  it('parses the fixture into 6 MyPokemon with no errors', () => {
    const { pokemon, errors } = parsePokepaste(FIXTURE_POKEPASTE);
    expect(errors).toHaveLength(0);
    expect(pokemon).toHaveLength(6);
  });

  it('computes speed identical to the precomputed fixture', () => {
    const { pokemon } = parsePokepaste(FIXTURE_POKEPASTE);
    for (const mon of pokemon) {
      const fixtureMon = FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === mon.set.species)!;
      expect(mon.speed).toBe(fixtureMon.speed);
    }
  });

  it('attaches species types', () => {
    const { pokemon } = parsePokepaste(FIXTURE_POKEPASTE);
    const flutter = pokemon.find((p) => p.set.species === 'Flutter Mane')!;
    expect(flutter.types).toEqual(['Ghost', 'Fairy']);
  });

  it('surfaces a clear error for an illegal/typo species and keeps valid ones', () => {
    const bad = `Notarealmon @ Leftovers
Ability: Levitate
Level: 50
- Tackle

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Level: 50
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
- Moonblast`;
    const { pokemon, errors } = parsePokepaste(bad);
    expect(pokemon).toHaveLength(1);
    expect(pokemon[0].set.species).toBe('Flutter Mane');
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(1);
    expect(errors[0].species).toBe('Notarealmon');
    expect(errors[0].message).toMatch(/Unknown species/);
  });

  it('ignores blank/trailing whitespace blocks', () => {
    const { pokemon, errors } = parsePokepaste(`\n\n${FIXTURE_POKEPASTE}\n\n\n`);
    expect(pokemon).toHaveLength(6);
    expect(errors).toHaveLength(0);
  });
});

describe('computeStat', () => {
  it('matches gen.stats.calc for a known spread (Timid 252 Spe Flutter Mane = 205)', () => {
    const { pokemon } = parsePokepaste(FIXTURE_POKEPASTE);
    const flutter = pokemon.find((p) => p.set.species === 'Flutter Mane')!;
    expect(computeStat('spe', flutter.set)).toBe(205);
  });
});

describe('createTeam', () => {
  it('builds a MyTeam with parsed members and a generated id', () => {
    const team = createTeam('My Squad', FIXTURE_POKEPASTE);
    expect(team.name).toBe('My Squad');
    expect(team.pokemon).toHaveLength(6);
    expect(team.pokepaste).toBe(FIXTURE_POKEPASTE);
    expect(team.id).toMatch(/^team-/);
  });

  it('preserves a supplied id for in-place edits', () => {
    const team = createTeam('Edited', FIXTURE_POKEPASTE, 'existing-id');
    expect(team.id).toBe('existing-id');
  });

  it('falls back to a default name when blank', () => {
    const team = createTeam('   ', FIXTURE_POKEPASTE);
    expect(team.name).toBe('Untitled Team');
  });
});
