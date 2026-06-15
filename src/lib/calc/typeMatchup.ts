/**
 * Type effectiveness lookups (plan §5 WS-A). Pure functions over the @pkmn/data
 * type chart exposed by the `gen` singleton. No mutation, no I/O.
 *
 * The @pkmn/data model: `gen.types.get(attackType).effectiveness` is a record
 * keyed by *defending* type → multiplier (0 | 0.5 | 1 | 2). The product of those
 * multipliers across a defender's type(s) is the combined matchup.
 */
import { gen } from './gen';

/** Multipliers a defender suffers, keyed by *attacking* type. Ability-agnostic. */
export type DefensiveProfile = Record<string, number>;

/**
 * Combined effectiveness of a single attacking type against a defender's
 * (one or two) types. Returns the product of per-type multipliers, e.g.
 * Water → ['Fire'] = 2, Electric → ['Water','Flying'] = 4, Normal → ['Ghost'] = 0.
 *
 * Unknown attack/defender types contribute a neutral ×1 (rather than throwing),
 * so callers can pass user-entered or partially-detected data safely.
 */
export function getMatchup(attackType: string, defenderTypes: string[]): number {
  const atk = gen.types.get(attackType);
  if (!atk) return 1;
  return defenderTypes.reduce((product, defType) => {
    const def = gen.types.get(defType);
    if (!def) return product;
    // effectiveness is keyed by attacking type → multiplier vs THIS defending type.
    const mult = atk.effectiveness[def.name] ?? 1;
    return product * mult;
  }, 1);
}

/** All canonical type names in this generation. */
export function allTypes(): string[] {
  const names: string[] = [];
  for (const t of gen.types) {
    // Skip the synthetic "???" type, which is not a real attacking type.
    if (t.name && t.name !== '???') names.push(t.name);
  }
  return names;
}

/**
 * For a species, the incoming damage multiplier from every attacking type.
 * e.g. defensiveProfile('Incineroar')['Water'] === 2.
 *
 * Purely type-chart based: does NOT account for abilities (Levitate, Water
 * Absorb, etc.) or Tera. Callers wanting ability-aware results layer that on top.
 */
export function defensiveProfile(species: string): DefensiveProfile {
  const sp = gen.species.get(species);
  const defenderTypes = sp ? [...sp.types] : [];
  const profile: DefensiveProfile = {};
  for (const attackType of allTypes()) {
    profile[attackType] = getMatchup(attackType, defenderTypes);
  }
  return profile;
}
