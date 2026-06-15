/**
 * Damage calculation (plan §5 WS-A): a thin, typed wrapper over @smogon/calc's
 * `calculate()`. It builds `Pokemon`/`Move`/`Field` instances from our domain
 * shapes and maps `FieldState` onto the calc `Field`.
 *
 * Two attacker/defender flavours:
 *   - A fully-known side built from a parsed `PokemonSet` (your own team).
 *   - An opponent built from a `speciesId` plus optional overrides (item,
 *     ability, nature, EVs, tera, …) — the calc fills sensible defaults.
 */
import { calculate, Pokemon, Move, Field, gen } from './gen';
import { resolveMegaForme } from './megaForme';
import type { FieldState, PokemonSet, SideState } from '../../shared/types';

/**
 * @smogon/calc options use branded string types (ItemName, MoveName, …) that our
 * plain `string` domain data won't satisfy structurally. The calc resolves these
 * by id at runtime, so a single boundary cast is correct and contained here.
 */
type PokemonOptions = NonNullable<ConstructorParameters<typeof Pokemon>[2]>;
type FieldOptions = NonNullable<ConstructorParameters<typeof Field>[0]>;

/** A combatant specified fully by a parsed Showdown set. */
export interface SetCombatant {
  kind: 'set';
  set: PokemonSet;
  /** Tera activated this turn? Applies the set's teraType if true. */
  teraActivated?: boolean;
  /** Mega evolved this turn? Builds the Mega forme of the set's held stone. */
  megaActivated?: boolean;
}

/** A combatant specified by species id plus optional revealed details. */
export interface SpeciesCombatant {
  kind: 'species';
  speciesId: string;
  level?: number;
  item?: string;
  ability?: string;
  nature?: string;
  teraType?: string;
  teraActivated?: boolean;
  evs?: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;
  ivs?: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;
  boosts?: Partial<Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>;
  /** Mega evolved this turn? Builds the Mega forme of the held stone (`item`). */
  megaActivated?: boolean;
  /**
   * Explicit Mega forme to build when `megaActivated` (e.g. an opponent whose
   * item we can't see). Overrides item-based resolution; falls back to it when
   * unset.
   */
  megaForme?: string;
}

export type Combatant = SetCombatant | SpeciesCombatant;

/** Result of a damage roll, normalised to percentages of the defender's HP. */
export interface DamageResult {
  /** Minimum roll as a % of the defender's max HP (0–100+). */
  minPct: number;
  /** Maximum roll as a % of the defender's max HP. */
  maxPct: number;
  /** KO chance 0–1 (e.g. guaranteed OHKO = 1), or undefined if unknown. */
  koChance: number | undefined;
  /** Human-readable description from the calc (e.g. "... 95.5 - 112.8% ..."). */
  desc: string;
}

const DEFAULT_LEVEL = 50;

function buildSetPokemon(c: SetCombatant): Pokemon {
  const set = c.set;
  // When Mega is active and the held stone resolves a forme, build that forme
  // so its stats/typing apply, and drop the base ability so the Mega forme's
  // own ability (e.g. Drought) takes over.
  const megaForme = c.megaActivated ? resolveMegaForme(set.species ?? '', set.item || undefined) : null;
  const options = {
    level: set.level ?? DEFAULT_LEVEL,
    item: set.item || undefined,
    ability: megaForme ? undefined : set.ability || undefined,
    nature: set.nature || undefined,
    evs: set.evs,
    ivs: set.ivs,
    moves: set.moves,
    teraType: c.teraActivated && set.teraType ? set.teraType : undefined,
  };
  return new Pokemon(gen, megaForme ?? set.species ?? '', options as PokemonOptions);
}

function buildSpeciesPokemon(c: SpeciesCombatant): Pokemon {
  const sp = gen.species.get(c.speciesId);
  const baseName = sp?.name ?? c.speciesId;
  const megaForme = c.megaActivated
    ? (c.megaForme ?? resolveMegaForme(baseName, c.item || undefined))
    : null;
  const options = {
    level: c.level ?? DEFAULT_LEVEL,
    item: c.item || undefined,
    ability: megaForme ? undefined : c.ability || undefined,
    nature: c.nature || undefined,
    evs: c.evs,
    ivs: c.ivs,
    boosts: c.boosts,
    teraType: c.teraActivated && c.teraType ? c.teraType : undefined,
  };
  return new Pokemon(gen, megaForme ?? baseName, options as PokemonOptions);
}

/** Construct a calc `Pokemon` from either combatant flavour. */
export function buildPokemon(c: Combatant): Pokemon {
  return c.kind === 'set' ? buildSetPokemon(c) : buildSpeciesPokemon(c);
}

/** Map our per-side state onto a calc `Side` literal. */
function toSide(side: SideState | undefined): Record<string, boolean> {
  return {
    isTailwind: !!side?.tailwind,
    isReflect: !!side?.reflect,
    isLightScreen: !!side?.lightScreen,
    isAuroraVeil: !!side?.auroraVeil,
  };
}

const WEATHER_MAP: Record<NonNullable<FieldState['weather']>, string> = {
  sun: 'Sun',
  rain: 'Rain',
  sand: 'Sand',
  snow: 'Snow',
};

const TERRAIN_MAP: Record<NonNullable<FieldState['terrain']>, string> = {
  electric: 'Electric',
  grassy: 'Grassy',
  misty: 'Misty',
  psychic: 'Psychic',
};

/** Build a calc `Field` (always Doubles for VGC) from our `FieldState`. */
export function buildField(field: FieldState = {}): Field {
  const options = {
    gameType: 'Doubles',
    weather: field.weather ? WEATHER_MAP[field.weather] : undefined,
    terrain: field.terrain ? TERRAIN_MAP[field.terrain] : undefined,
    isGravity: false,
    attackerSide: toSide(field.attackerSide),
    defenderSide: toSide(field.defenderSide),
  };
  return new Field(options as FieldOptions);
}

/**
 * Calculate damage for `move` from `attacker` to `defender` under `field`.
 * Percentages are relative to the defender's max HP.
 */
export function calcDamage(
  attacker: Combatant,
  defender: Combatant,
  move: string,
  field: FieldState = {},
): DamageResult {
  const atk = buildPokemon(attacker);
  const def = buildPokemon(defender);
  const mv = new Move(gen, move);
  const result = calculate(gen, atk, def, mv, buildField(field));

  const maxHP = def.maxHP();
  const [minDmg, maxDmg] = result.range();
  const ko = result.kochance();

  return {
    minPct: round1((minDmg / maxHP) * 100),
    maxPct: round1((maxDmg / maxHP) * 100),
    koChance: ko.chance,
    desc: result.desc(),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
