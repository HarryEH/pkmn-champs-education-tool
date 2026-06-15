/**
 * Offline dev fixtures (plan §3). A valid PokePaste parsed into a MyTeam, and a
 * 6-mon confirmed OpponentTeam, so every UI/calc workstream can develop without
 * waiting on detection (WS-D) or persisted data.
 *
 * This is the decoupling trick: WS-C/E/F build against these, not live data.
 */
import { Sets } from '@pkmn/sets';
import { gen } from '../lib/calc/gen';
import type { MyPokemon, MyTeam, OpponentTeam, PokemonSet } from './types';

/**
 * A complete, legal-looking Champions VGC 2026 Reg M-A team in Showdown export
 * format. Every species here is in the `champions` mod's legal pool (see
 * src/data/championsLegality.json) — this mod's roster is a curated subset of
 * the National Dex, NOT the full Gen 9 dex, so fixtures must be checked against
 * that table rather than assumed from general VGC knowledge.
 */
export const FIXTURE_POKEPASTE = `Incineroar @ Lum Berry
Ability: Intimidate
Level: 50
Tera Type: Grass
EVs: 244 HP / 4 Atk / 12 Def / 124 SpD / 124 Spe
Adamant Nature
- Fake Out
- Darkest Lariat
- Flare Blitz
- Parting Shot

Gardevoir @ Choice Scarf
Ability: Telepathy
Level: 50
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Moonblast
- Shadow Ball
- Psychic
- Trick

Dragapult @ Choice Scarf
Ability: Clear Body
Level: 50
Tera Type: Ghost
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Dragon Darts
- Phantom Force
- U-turn
- Flamethrower

Garchomp @ Focus Sash
Ability: Rough Skin
Level: 50
Tera Type: Steel
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Earthquake
- Dragon Claw
- Stone Edge
- Protect

Tyranitar @ Leftovers
Ability: Sand Stream
Level: 50
Tera Type: Fairy
EVs: 244 HP / 12 Atk / 252 SpD
Careful Nature
- Rock Slide
- Knock Off
- Earthquake
- Ice Punch

Hatterene @ Sitrus Berry
Ability: Magic Bounce
Level: 50
Tera Type: Psychic
EVs: 252 HP / 4 Def / 252 SpA
Sassy Nature
IVs: 0 Spe
- Dazzling Gleam
- Psychic
- Trick Room
- Protect`;

/** Build a MyPokemon (parsed set + computed speed + types) from a set block. */
function toMyPokemon(block: string): MyPokemon {
  // importSet returns Partial<PokemonSet>; fixture blocks are known-complete, so
  // we treat the result as a full set (WS-C validates this at real import time).
  const set = Sets.importSet(block) as PokemonSet;
  const species = gen.species.get(set.species ?? '');
  const nature = gen.natures.get(set.nature ?? 'Serious');
  const level = set.level ?? 50;
  const baseSpe = species?.baseStats.spe ?? 0;
  const iv = set.ivs?.spe ?? 31;
  const ev = set.evs?.spe ?? 0;
  const speed = species ? gen.stats.calc('spe', baseSpe, iv, ev, level, nature ?? undefined) : 0;
  return {
    set,
    speed,
    types: species ? [...species.types] : [],
  };
}

/** Parsed fixture team. Use as the "active team" stand-in. */
export const FIXTURE_MY_TEAM: MyTeam = {
  id: 'fixture-team',
  name: 'Fixture VGC Team',
  pokepaste: FIXTURE_POKEPASTE,
  pokemon: FIXTURE_POKEPASTE.trim()
    .split(/\n\s*\n/)
    .map(toMyPokemon),
};

/** Confirmed opponent team (species ids) for static dashboard dev. All Champions-legal. */
const OPPONENT_SPECIES = ['Hydreigon', 'Talonflame', 'Mimikyu', 'Sylveon', 'Kingambit', 'Volcarona'];

export const FIXTURE_OPPONENT_TEAM: OpponentTeam = {
  detectedAt: 0,
  slots: OPPONENT_SPECIES.map((name) => {
    const id = gen.species.get(name)?.id ?? name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return {
      speciesId: id,
      candidates: [{ speciesId: id, confidence: 1 }],
    };
  }),
};
