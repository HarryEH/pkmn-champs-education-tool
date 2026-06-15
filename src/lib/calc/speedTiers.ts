/**
 * Speed-stat calc + tier-list builder (plan §5 WS-A).
 *
 * Two layers:
 *   1. `calcSpeed(set)` — the raw Speed stat from a parsed set (level/EVs/IVs/
 *      nature), reusing the same `gen.stats.calc` path as fixtures.ts.
 *   2. A composable modifier pipeline so Flow C can model in-battle conditions
 *      (Tailwind, Choice Scarf, paralysis, Trick Room) without re-deriving math.
 *
 * Trick Room is special: it doesn't change a stat, it *reverses* the ordering.
 * We model it as a flag the sort respects, so callers compose it with the
 * multiplicative modifiers freely.
 */
import { gen } from './gen';
import type { PokemonSet } from '../../shared/types';

/** Multiplicative speed modifiers, applied in-game in this order. */
export interface SpeedModifiers {
  /** Tailwind on this Pokémon's side (×2). */
  tailwind?: boolean;
  /** Choice Scarf held (×1.5). */
  choiceScarf?: boolean;
  /** Paralyzed (×0.5 in Gen 7+). Quick Feet etc. not modelled here. */
  paralysis?: boolean;
  /** Extra stage boosts/drops (-6..+6), e.g. from Tailwind partner moves. */
  stages?: number;
}

/** An entry to place into a speed tier list. Provide a set OR a precomputed stat. */
export interface SpeedTierInput {
  label: string;
  set?: PokemonSet;
  /** Base (unmodified) speed stat, if already computed. */
  stat?: number;
  /** Per-entry modifiers (the opponent might be scarfed, you might not, etc.). */
  modifiers?: SpeedModifiers;
}

/** A resolved tier-list row, sorted by effective speed. */
export interface SpeedTierEntry {
  label: string;
  /** Unmodified base speed stat. */
  baseSpeed: number;
  /** Speed after applying the entry's modifiers. */
  effectiveSpeed: number;
  modifiers: SpeedModifiers;
}

const STAGE_MULTIPLIERS: Record<number, number> = {
  '-6': 2 / 8,
  '-5': 2 / 7,
  '-4': 2 / 6,
  '-3': 2 / 5,
  '-2': 2 / 4,
  '-1': 2 / 3,
  '0': 1,
  '1': 3 / 2,
  '2': 4 / 2,
  '3': 5 / 2,
  '4': 6 / 2,
  '5': 7 / 2,
  '6': 8 / 2,
};

/**
 * Raw Speed stat for a parsed set. IVs default to 31, EVs to 0, level to 50,
 * nature to Serious (neutral) — matching the fixtures' conventions.
 */
export function calcSpeed(set: PokemonSet): number {
  const species = gen.species.get(set.species ?? '');
  if (!species?.exists) return 0; // `gen` is ungated: a miss is {exists:false}, not undefined.
  const nature = gen.natures.get(set.nature ?? 'Serious') ?? undefined;
  const level = set.level ?? 50;
  const iv = set.ivs?.spe ?? 31;
  const ev = set.evs?.spe ?? 0;
  return gen.stats.calc('spe', species.baseStats.spe, iv, ev, level, nature);
}

/** Clamp a stage boost to the legal -6..+6 range. */
function clampStage(stage: number): number {
  return Math.max(-6, Math.min(6, Math.trunc(stage)));
}

/**
 * Apply multiplicative speed modifiers in canonical order:
 * stage boosts → Tailwind → Choice Scarf → paralysis. Game truncates
 * (floors) after each multiplicative step.
 */
export function applySpeedModifiers(baseSpeed: number, mods: SpeedModifiers = {}): number {
  let spe = baseSpeed;
  if (mods.stages) {
    spe = Math.floor(spe * STAGE_MULTIPLIERS[clampStage(mods.stages)]);
  }
  if (mods.tailwind) spe = Math.floor(spe * 2);
  if (mods.choiceScarf) spe = Math.floor(spe * 1.5);
  if (mods.paralysis) spe = Math.floor(spe * 0.5);
  return spe;
}

/**
 * Build a speed tier list, high→low by effective speed. Pass `trickRoom: true`
 * to reverse the ordering (slowest moves first) — the canonical TR view.
 *
 * Ties keep input order (stable sort), which is realistic: speed ties are
 * resolved randomly in-game, so neither ordering is "more correct".
 */
export function buildSpeedTiers(
  inputs: SpeedTierInput[],
  options: { trickRoom?: boolean } = {},
): SpeedTierEntry[] {
  const entries: SpeedTierEntry[] = inputs.map((input) => {
    const baseSpeed = input.stat ?? (input.set ? calcSpeed(input.set) : 0);
    const modifiers = input.modifiers ?? {};
    return {
      label: input.label,
      baseSpeed,
      effectiveSpeed: applySpeedModifiers(baseSpeed, modifiers),
      modifiers,
    };
  });
  // Stable sort: index-tagged to preserve input order on ties.
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const diff = options.trickRoom
        ? a.entry.effectiveSpeed - b.entry.effectiveSpeed
        : b.entry.effectiveSpeed - a.entry.effectiveSpeed;
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ entry }) => entry);
}
