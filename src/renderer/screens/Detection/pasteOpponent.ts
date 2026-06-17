/**
 * PokePaste → OpponentTeam (Detection input source).
 *
 * The third detection input alongside screenshot + video: when you already KNOW
 * the opponent's team (studying a known list, a VGCPastes entry, practice), a
 * paste skips the CLIP pipeline entirely and yields a fully-confirmed
 * `OpponentTeam`. Because a paste carries the exact set, we also return a
 * speciesId → `PokemonSet` map so the analysis can calc against the real
 * item/ability/Tera/EVs (see session `opponentSets` + `opponentCombatant`)
 * instead of usage averages.
 *
 * Pure + side-effect free (reuses the team store's `parsePokepaste`), so it is
 * unit-tested directly.
 */
import { parsePokepaste, type ImportError } from '../../store/teams';
import { gen } from '../../../lib/calc/gen';
import type { OpponentTeam, PokemonSet } from '../../../shared/types';

export interface PasteOpponentResult {
  /** Fully-confirmed opponent team (every parsed slot has a speciesId). */
  team: OpponentTeam;
  /** Exact parsed set per resolved speciesId, for calc that knows the real set. */
  sets: Record<string, PokemonSet>;
  /** Per-block parse/legality issues from `parsePokepaste` (non-blocking). */
  errors: ImportError[];
  /** Number of resolved slots (a valid VGC paste has 6). */
  count: number;
}

/** Showdown id for a set's species line (resolved via `gen`, with a raw fallback). */
function resolveSpeciesId(set: PokemonSet): string {
  const species = gen.species.get(set.species ?? '');
  if (species?.exists) return species.id;
  return (set.species ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parse an opponent PokePaste/Showdown export into a confirmed `OpponentTeam` +
 * exact-set map. Each slot is marked confirmed (`confidence: 1`) and seeded with
 * the paste's item/ability/Tera so the slot UI shows them immediately. Unresolved
 * blocks are dropped from the team and reported in `errors` (same policy as Team
 * Setup — never refuse the import).
 */
export function opponentTeamFromPaste(text: string, now: () => number = Date.now): PasteOpponentResult {
  const { pokemon, errors } = parsePokepaste(text);

  const sets: Record<string, PokemonSet> = {};
  const slots = pokemon.map((mon) => {
    const speciesId = resolveSpeciesId(mon.set);
    sets[speciesId] = mon.set;
    return {
      speciesId,
      candidates: [{ speciesId, confidence: 1 }],
      item: mon.set.item || undefined,
      ability: mon.set.ability || undefined,
      teraType: mon.set.teraType || undefined,
    };
  });

  return { team: { slots, detectedAt: now() }, sets, errors, count: slots.length };
}
