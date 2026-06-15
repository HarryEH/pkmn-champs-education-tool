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
      const fixtureMon = FIXTURE_MY_TEAM.pokemon.find((p) => p.set.species === mon.set.species);
      if (!fixtureMon) throw new Error(`fixture has no ${mon.set.species}`);
      expect(mon.speed).toBe(fixtureMon.speed);
    }
  });

  it('attaches species types', () => {
    const { pokemon } = parsePokepaste(FIXTURE_POKEPASTE);
    const gardevoir = pokemon.find((p) => p.set.species === 'Gardevoir');
    if (!gardevoir) throw new Error('parsed team has no Gardevoir');
    expect(gardevoir.types).toEqual(['Psychic', 'Fairy']);
  });

  it('surfaces a clear error for a typo species and keeps valid ones', () => {
    const bad = `Notarealmon @ Leftovers
Ability: Levitate
Level: 50
- Tackle

Garchomp @ Focus Sash
Ability: Rough Skin
Level: 50
- Earthquake
- Protect`;
    const { pokemon, errors } = parsePokepaste(bad);
    expect(pokemon).toHaveLength(1);
    expect(pokemon[0].set.species).toBe('Garchomp');
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

describe('parsePokepaste Champions legality (non-blocking)', () => {
  it('flags a banned species but keeps it in the team', () => {
    const { pokemon, errors } = parsePokepaste(`Flutter Mane @ Lum Berry
Ability: Protosynthesis
Level: 50
- Moonblast`);
    expect(pokemon).toHaveLength(1);
    expect(pokemon[0].set.species).toBe('Flutter Mane');
    expect(errors.some((e) => /not legal in Champions/.test(e.message))).toBe(true);
  });

  it('flags a banned item (Assault Vest) but keeps the Pokémon', () => {
    const { pokemon, errors } = parsePokepaste(`Garchomp @ Assault Vest
Ability: Rough Skin
Level: 50
- Earthquake
- Protect`);
    expect(pokemon).toHaveLength(1);
    expect(errors.some((e) => /item Assault Vest is banned/.test(e.message))).toBe(true);
  });

  it('flags a banned move (Tera Blast)', () => {
    const { errors } = parsePokepaste(`Garchomp @ Focus Sash
Ability: Rough Skin
Level: 50
- Earthquake
- Tera Blast`);
    expect(errors.some((e) => /move Tera Blast is banned/.test(e.message))).toBe(true);
  });

  it('flags a move the species cannot learn (Incineroar / Knock Off)', () => {
    const { errors } = parsePokepaste(`Incineroar @ Lum Berry
Ability: Intimidate
Level: 50
- Fake Out
- Knock Off`);
    expect(errors.some((e) => /cannot learn Knock Off/.test(e.message))).toBe(true);
  });

  // Champions revives Mega Evolution: Mega Stones and never-released bases like
  // Floette-Eternal are legal there but stripped from the gated Gen-9 dex. They
  // must resolve (via the ungated view) and pass legality, not read as "unknown".
  it('accepts revived Mega content — Mega Stones and Floette-Eternal', () => {
    const { pokemon, errors } = parsePokepaste(`Charizard @ Charizardite Y
Ability: Drought
Level: 50
- Heat Wave
- Protect

Floette-Eternal @ Floettite
Ability: Fairy Aura
Level: 50
- Moonblast
- Calm Mind`);
    expect(pokemon).toHaveLength(2);
    expect(pokemon.find((p) => p.set.species === 'Floette-Eternal')?.speed).toBeGreaterThan(0);
    expect(errors).toHaveLength(0);
  });
});

describe('computeStat', () => {
  it('matches gen.stats.calc for a known spread (Timid 252 Spe Gardevoir = 145)', () => {
    const { pokemon } = parsePokepaste(FIXTURE_POKEPASTE);
    const gardevoir = pokemon.find((p) => p.set.species === 'Gardevoir');
    if (!gardevoir) throw new Error('parsed team has no Gardevoir');
    expect(computeStat('spe', gardevoir.set)).toBe(145);
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
