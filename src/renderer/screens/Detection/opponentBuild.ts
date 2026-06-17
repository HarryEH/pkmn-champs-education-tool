/**
 * Opponent set helpers (E2) — derive a representative `SpeciesCombatant` and
 * top moves for a detected opponent from Smogon usage data (WS-B), so the
 * dashboard can run damage calc and speed comparisons without a confirmed set.
 */
import type { PokemonSet, SpeciesUsage, UsageData, UsageEntry } from '../../../shared/types';
import type { Combatant, SpeciesCombatant } from '../../../lib/calc/damageCalc';
import type { SpeedTierInput } from '../../../lib/calc/speedTiers';
import { gen } from '../../../lib/calc/gen';
import { megaFormesOf } from '../../../lib/calc/megaForme';

/** VGC is always Level 50. */
const LEVEL = 50;

const EV_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
type StatKey = (typeof EV_KEYS)[number];

const SPREAD_RE = /^(\w+):(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/;

export interface ParsedSpread {
  nature: string;
  evs: Record<StatKey, number>;
}

/** Parse a Smogon usage spread name, e.g. `"Adamant:236/0/4/0/116/156"`. */
export function parseSpread(spread: string): ParsedSpread | null {
  const m = SPREAD_RE.exec(spread);
  if (!m) return null;
  const [, nature, hp, atk, def, spa, spd, spe] = m;
  return {
    nature,
    evs: {
      hp: Number(hp),
      atk: Number(atk),
      def: Number(def),
      spa: Number(spa),
      spd: Number(spd),
      spe: Number(spe),
    },
  };
}

/** The highest-usage entry's name, or undefined if `entries` is empty/missing. */
function top(entries: UsageEntry[] | undefined): string | undefined {
  return entries?.[0]?.name;
}

/**
 * Build a representative opponent `SpeciesCombatant` from its most-common
 * item, ability, Tera type, and EV spread/nature (per Smogon usage). Any field
 * with no usage data is left undefined, and `calcDamage` falls back to
 * sensible defaults for it.
 */
export function buildOpponentCombatant(
  speciesId: string,
  usage: SpeciesUsage | undefined,
): SpeciesCombatant {
  const spread = parseSpread(top(usage?.spreads) ?? '');
  const teraType = top(usage?.teraTypes);
  return {
    kind: 'species',
    speciesId,
    item: top(usage?.items),
    ability: top(usage?.abilities),
    nature: spread?.nature,
    evs: spread?.evs,
    teraType,
    teraActivated: !!teraType,
  };
}

/**
 * Look up a species' usage entry in a full `UsageData` map by display name, with
 * a normalized-id fallback (mirrors the screens' `findUsage`).
 */
function lookupUsage(
  usageData: UsageData | null,
  name: string,
  speciesId: string,
): SpeciesUsage | undefined {
  if (!usageData) return undefined;
  if (usageData.species[name]) return usageData.species[name];
  for (const [key, value] of Object.entries(usageData.species)) {
    const keyId = gen.species.get(key)?.id ?? key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (keyId === speciesId) return value;
  }
  return undefined;
}

/**
 * A selectable "forme view" of a detected opponent: the base species plus each
 * Mega forme it can assume. In Champions, a Mega-capable mon is usually played
 * AS its Mega (e.g. Charizard is ~32% Mega-Y, ~0.1% base), so the dominant
 * variant by usage should drive the analysis — but the base stays available as a
 * "just in case" option (and some bases, e.g. Glimmora, actually outusage their
 * Mega).
 */
export interface UsageVariant {
  /** Forme id to feed calc/speed/icon (base id, or the Mega forme id). */
  speciesId: string;
  /** Display label, e.g. "Charizard-Mega-Y" or "Charizard (base)". */
  label: string;
  /** That forme's usage entry, if the format reports one. */
  usage: SpeciesUsage | undefined;
  isMega: boolean;
  /** Format usage fraction (0 when the forme has no entry) — drives the default. */
  usagePct: number;
}

/**
 * The usage variants for a detected base species: `[base, ...megaFormes]`. Single
 * entry (just the base) when the species can't Mega. Each carries its own usage
 * entry so the dashboard can switch the whole analysis between formes.
 */
export function usageVariants(baseSpeciesId: string, usageData: UsageData | null): UsageVariant[] {
  const species = gen.species.get(baseSpeciesId);
  const baseName = species?.exists ? species.name : baseSpeciesId;
  const baseId = species?.exists ? species.id : baseSpeciesId;
  const megaNames = species?.exists ? megaFormesOf(baseName) : [];

  const toVariant = (name: string, id: string, isMega: boolean): UsageVariant => {
    const usage = lookupUsage(usageData, name, id);
    return {
      speciesId: id,
      isMega,
      usage,
      usagePct: usage?.usage ?? 0,
      label: isMega ? name : megaNames.length ? `${baseName} (base)` : baseName,
    };
  };

  const variants = [toVariant(baseName, baseId, false)];
  for (const megaName of megaNames) {
    const mega = gen.species.get(megaName);
    variants.push(toVariant(megaName, mega?.exists ? mega.id : megaName, true));
  }
  return variants;
}

/**
 * The variant to show by default: the highest-usage one (so a dominant Mega
 * wins), falling back to the base when nothing has usage data.
 */
export function defaultVariant(variants: UsageVariant[]): UsageVariant | undefined {
  if (variants.length === 0) return undefined;
  return variants.reduce((best, v) => (v.usagePct > best.usagePct ? v : best), variants[0]);
}

/** The top-`n` most-used moves for a species (highest usage first). */
export function topMoves(usage: SpeciesUsage | undefined, n = 4): string[] {
  return (usage?.moves ?? []).slice(0, n).map((entry) => entry.name);
}

/**
 * The opponent combatant to calc with. When an exact `set` is known (PokePaste
 * source) it drives the calc directly — real item/ability/Tera/EVs — otherwise we
 * fall back to the usage-derived {@link buildOpponentCombatant}.
 */
export function opponentCombatant(
  speciesId: string,
  usage: SpeciesUsage | undefined,
  set?: PokemonSet,
): Combatant {
  if (set) return { kind: 'set', set };
  return buildOpponentCombatant(speciesId, usage);
}

/**
 * The opponent's moves for offense calc: the exact set's moves when known,
 * otherwise the top-`n` usage moves ({@link topMoves}).
 */
export function opponentMoves(
  usage: SpeciesUsage | undefined,
  set?: PokemonSet,
  n = 4,
): string[] {
  const setMoves = set?.moves?.filter((m): m is string => !!m) ?? [];
  if (setMoves.length) return setMoves.slice(0, n);
  return topMoves(usage, n);
}

/**
 * The opponent's Speed line as a {@link SpeedTierInput}: computed from the exact
 * set's spread/nature/level when known, otherwise the usage-likely line
 * ({@link likelySpeedInput}). `speciesId` is the forme to read base Speed from.
 */
export function opponentSpeedInput(
  speciesId: string,
  usage: SpeciesUsage | undefined,
  label: string,
  set?: PokemonSet,
): SpeedTierInput {
  if (!set) return likelySpeedInput(speciesId, usage, label);
  const species = gen.species.get(set.species ?? speciesId);
  if (!species?.exists) return { label, stat: 0 };
  const nature = gen.natures.get(set.nature ?? 'Serious') ?? undefined;
  const ev = set.evs?.spe ?? 0;
  const iv = set.ivs?.spe ?? 31;
  const stat = gen.stats.calc('spe', species.baseStats.spe, iv, ev, set.level ?? LEVEL, nature);
  return { label, stat };
}

/** Raw Speed stat for a `SpeciesCombatant` built by {@link buildOpponentCombatant}. */
export function opponentSpeedStat(c: SpeciesCombatant): number {
  const species = gen.species.get(c.speciesId);
  if (!species?.exists) return 0; // `gen` is ungated: a miss is {exists:false}, not undefined.
  const nature = gen.natures.get(c.nature ?? 'Serious') ?? undefined;
  const iv = c.ivs?.spe ?? 31;
  const ev = c.evs?.spe ?? 0;
  return gen.stats.calc('spe', species.baseStats.spe, iv, ev, c.level ?? LEVEL, nature);
}

/**
 * The opponent's *most-likely* Speed line as a single `SpeedTierInput`: the top
 * usage spread's parsed Speed EVs + nature, computed into a real stat (same path
 * as {@link opponentSpeedStat}). `speciesId` is passed by the caller — pass the
 * Mega forme id when the opponent is Mega'd so the forme's base Speed applies.
 * Falls back to the base stat (0 EVs, neutral nature) when no spread is known;
 * never throws.
 */
export function likelySpeedInput(
  speciesId: string,
  usage: SpeciesUsage | undefined,
  label: string,
): SpeedTierInput {
  const species = gen.species.get(speciesId);
  if (!species?.exists) return { label, stat: 0 }; // ungated miss → {exists:false}.

  const spread = parseSpread(top(usage?.spreads) ?? '');
  const nature = gen.natures.get(spread?.nature ?? 'Serious') ?? undefined;
  const ev = spread?.evs.spe ?? 0;
  const stat = gen.stats.calc('spe', species.baseStats.spe, 31, ev, LEVEL, nature);
  return { label, stat };
}
