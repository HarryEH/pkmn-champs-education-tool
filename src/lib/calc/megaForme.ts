/**
 * Mega-forme resolution (plan §5 WS-F). Champions revives Mega Evolution, so a
 * held Mega Stone determines which forme a species becomes when it Megas.
 *
 * `@smogon/calc` does NOT auto-Mega-evolve from a held stone — callers must
 * build the calc `Pokemon` with the forme name explicitly. This resolver maps a
 * (species, item) pair to that forme name; the forme then carries its own
 * stats/typing/ability automatically (e.g. Charizard-Mega-Y → Drought, SpA 159).
 *
 * The stone's `megaStone` field is a `{ baseSpeciesName: megaForme }` record,
 * e.g. `{ Charizard: 'Charizard-Mega-Y' }` or
 * `{ 'Floette-Eternal': 'Floette-Mega' }`. It is keyed by the base species'
 * display name, so we resolve the canonical name via `gen.species` first.
 */
import { gen } from './gen';

/** The (untyped-in-@pkmn) Mega-Stone field present on Mega Stone items. */
type MegaStoneItem = { megaStone?: Record<string, string> };

/**
 * Resolve the Mega forme `speciesName` becomes when holding `itemName`. Returns
 * the forme display name (e.g. `'Charizard-Mega-Y'`) or `null` when there is no
 * item, the item is not a Mega Stone, or the stone is for a different species.
 */
export function resolveMegaForme(speciesName: string, itemName: string | undefined): string | null {
  if (!itemName) return null;
  const item = gen.items.get(itemName);
  if (!item?.exists) return null; // `gen` is ungated: a miss is {exists:false}.
  const stone = (item as MegaStoneItem).megaStone;
  if (!stone) return null;
  // Match on the canonical base-species name (e.g. 'Floette-Eternal').
  const species = gen.species.get(speciesName);
  const key = species?.exists ? species.name : speciesName;
  return stone[key] ?? null;
}
