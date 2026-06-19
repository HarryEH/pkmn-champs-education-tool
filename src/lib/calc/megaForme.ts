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

/** The (untyped-in-@pkmn) `isMega` flag present on genuine Mega formes. */
type MaybeMega = { isMega?: boolean };

/**
 * The Mega forme display names a species can assume, in dex order (e.g.
 * `['Charizard-Mega-X', 'Charizard-Mega-Y']`), or `[]` if it has none. Works
 * from either the base species or a Mega forme name. Filters `otherFormes` by
 * the dex's `isMega` flag so look-alike custom formes (e.g. `Lucario-Mega-Z`)
 * are excluded.
 */
export function megaFormesOf(speciesName: string): string[] {
  const species = gen.species.get(speciesName);
  if (!species?.exists) return [];
  const baseName = (species as MaybeMega).isMega ? species.baseSpecies : species.name;
  const base = gen.species.get(baseName);
  if (!base?.exists) return [];
  return (base.otherFormes ?? []).filter((forme) => {
    const f = gen.species.get(forme);
    return !!f?.exists && !!(f as MaybeMega).isMega;
  });
}

/**
 * The Mega forme to assume when the specific stone is unknown (e.g. an
 * opponent whose item we can't see): the species' first Mega forme, or `null`
 * if it can't Mega at all.
 */
export function defaultMegaForme(speciesName: string): string | null {
  return megaFormesOf(speciesName)[0] ?? null;
}

/**
 * The ability a Mega forme grants on evolution. A Mega forme's ability REPLACES
 * the base species' ability (e.g. Swampert's listed Damp/Torrent becomes Swift
 * Swim as Swampert-Mega), so callers modelling an active Mega must use this, not
 * the team-sheet ability. Mega formes carry a single ability (slot 0). Returns
 * `undefined` for a null/unknown forme.
 */
export function megaAbility(megaForme: string | null): string | undefined {
  if (!megaForme) return undefined;
  const species = gen.species.get(megaForme);
  return species?.exists ? species.abilities[0] : undefined;
}
