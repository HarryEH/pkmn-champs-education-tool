/**
 * Opponent set helpers (E2) — derive a representative `SpeciesCombatant` and
 * top moves for a detected opponent from Smogon usage data (WS-B), so the
 * dashboard can run damage calc and speed comparisons without a confirmed set.
 */
import type { SpeciesUsage, UsageEntry } from '../../../shared/types';
import type { SpeciesCombatant } from '../../../lib/calc/damageCalc';
import { gen } from '../../../lib/calc/gen';

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

/** The top-`n` most-used moves for a species (highest usage first). */
export function topMoves(usage: SpeciesUsage | undefined, n = 4): string[] {
  return (usage?.moves ?? []).slice(0, n).map((entry) => entry.name);
}

/** Raw Speed stat for a `SpeciesCombatant` built by {@link buildOpponentCombatant}. */
export function opponentSpeedStat(c: SpeciesCombatant): number {
  const species = gen.species.get(c.speciesId);
  if (!species) return 0;
  const nature = gen.natures.get(c.nature ?? 'Serious') ?? undefined;
  const iv = c.ivs?.spe ?? 31;
  const ev = c.evs?.spe ?? 0;
  return gen.stats.calc('spe', species.baseStats.spe, iv, ev, c.level ?? LEVEL, nature);
}
