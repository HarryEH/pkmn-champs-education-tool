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

/** A complete, legal-looking Champions-era team in Showdown export format. */
export const FIXTURE_POKEPASTE = `Incineroar @ Safety Goggles
Ability: Intimidate
Level: 50
Tera Type: Grass
EVs: 244 HP / 4 Atk / 12 Def / 124 SpD / 124 Spe
Adamant Nature
- Fake Out
- Knock Off
- Flare Blitz
- Parting Shot

Flutter Mane @ Booster Energy
Ability: Protosynthesis
Level: 50
Tera Type: Fairy
EVs: 4 HP / 252 SpA / 252 Spe
Timid Nature
IVs: 0 Atk
- Moonblast
- Shadow Ball
- Dazzling Gleam
- Protect

Amoonguss @ Sitrus Berry
Ability: Regenerator
Level: 50
Tera Type: Water
EVs: 236 HP / 4 Def / 268 SpD
Calm Nature
IVs: 0 Atk / 0 Spe
- Spore
- Rage Powder
- Pollen Puff
- Protect

Urshifu-Rapid-Strike @ Mystic Water
Ability: Unseen Fist
Level: 50
Tera Type: Water
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Surging Strikes
- Close Combat
- Aqua Jet
- Protect

Rillaboom @ Assault Vest
Ability: Grassy Surge
Level: 50
Tera Type: Fire
EVs: 252 HP / 116 Atk / 140 Spe
Adamant Nature
- Grassy Glide
- Wood Hammer
- U-turn
- Fake Out

Landorus-Therian @ Choice Scarf
Ability: Intimidate
Level: 50
Tera Type: Flying
EVs: 4 HP / 252 Atk / 252 Spe
Jolly Nature
- Earthquake
- Rock Slide
- U-turn
- Stomping Tantrum`;

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

/** Confirmed opponent team (species ids) for static dashboard dev. */
const OPPONENT_SPECIES = [
  'Calyrex-Shadow',
  'Miraidon',
  'Whimsicott',
  'Iron Hands',
  'Chien-Pao',
  'Farigiraf',
];

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
