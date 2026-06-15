/**
 * Champions Reg M-A team-legality checks for Team Setup (R6).
 *
 * Combines all four legality layers behind one synchronous entry point,
 * `checkSetLegality`, so the renderer's parsePokepaste can validate an imported
 * set without async/IPC:
 *   - species  — championsLegality.json (full pool table, src/lib/detection)
 *   - item     — championsOverrides.json delta + vanilla `gen.items`
 *   - ability  — championsOverrides.json delta + vanilla `gen.abilities`
 *   - move ban — championsOverrides.json delta + vanilla `gen.moves`
 *   - movepool — championsLearnsets.json (pre-merged per-species movepools)
 *
 * The JSON data files are imported and indexed ONCE at module scope (mirrors
 * Detection/constants.ts), so callers pay the indexing cost a single time.
 */
import { gen } from '../calc/gen';
import {
  buildLegalityIndex,
  isChampionsLegal,
  type ChampionsLegalityTable,
} from '../detection/championsLegality';
import {
  isItemLegal,
  isMoveLegal,
  isAbilityLegal,
  type ChampionsOverridesTable,
} from './championsOverrides';
import {
  buildLearnsetIndex,
  canLearnMove,
  type ChampionsLearnsetsTable,
} from './championsLearnsets';
import legalityJson from '../../data/championsLegality.json';
import overridesJson from '../../data/championsOverrides.json';
import learnsetsJson from '../../data/championsLearnsets.json';
import type { PokemonSet } from '../../shared/types';

const SPECIES_INDEX = buildLegalityIndex(legalityJson as ChampionsLegalityTable);
const OVERRIDES = overridesJson as ChampionsOverridesTable;
const LEARNSET_INDEX = buildLearnsetIndex(learnsetsJson as ChampionsLearnsetsTable);

/** Minimal species shape checkSetLegality needs (subset of @pkmn/dex Species). */
export interface LegalitySpecies {
  id: string;
  name: string;
}

/**
 * Find every Champions Reg M-A legality violation in one resolved set. Returns a
 * (possibly empty) list of human-readable messages — one per distinct problem.
 * Non-blocking by design: callers keep the Pokémon and just surface these.
 */
export function checkSetLegality(set: PokemonSet, species: LegalitySpecies): string[] {
  const violations: string[] = [];
  const who = species.name;

  if (!isChampionsLegal(SPECIES_INDEX, species.id)) {
    violations.push(`${who} is not legal in Champions Reg M-A.`);
  }

  if (set.item) {
    const item = gen.items.get(set.item);
    if (!item?.exists) {
      violations.push(`${who}: unknown item "${set.item}".`);
    } else if (!isItemLegal(OVERRIDES, item.id, item.isNonstandard)) {
      violations.push(`${who}: item ${item.name} is banned in Champions Reg M-A.`);
    }
  }

  if (set.ability) {
    const ability = gen.abilities.get(set.ability);
    if (!ability?.exists) {
      violations.push(`${who}: unknown ability "${set.ability}".`);
    } else if (!isAbilityLegal(OVERRIDES, ability.id, ability.isNonstandard)) {
      violations.push(`${who}: ability ${ability.name} is banned in Champions Reg M-A.`);
    }
  }

  for (const moveText of set.moves ?? []) {
    if (!moveText) continue;
    const move = gen.moves.get(moveText);
    if (!move?.exists) {
      violations.push(`${who}: unknown move "${moveText}".`);
      continue;
    }
    if (!isMoveLegal(OVERRIDES, move.id, move.isNonstandard)) {
      violations.push(`${who}: move ${move.name} is banned in Champions Reg M-A.`);
      continue;
    }
    if (!canLearnMove(LEARNSET_INDEX, species.id, move.id)) {
      violations.push(`${who} cannot learn ${move.name} in Champions Reg M-A.`);
    }
  }

  return violations;
}
