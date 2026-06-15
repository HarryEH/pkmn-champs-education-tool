/**
 * The regulation-INDEPENDENT base species pool shared by every build script
 * (buildIconHashes.ts, buildChampionsLegality.ts, buildChampionsLearnsets.ts):
 * every real, battle-capable, non-CAP/Custom/Future/LGPE National Dex species,
 * from @pkmn/dex's ungated `Dex.species`.
 *
 * Kept here so the three build outputs stay in lock-step (R5 two-layer
 * architecture: the icon table, legality table, and learnset table must all key
 * off the same species set).
 */
import { Dex } from '@pkmn/dex';

export function championsSpeciesPool() {
  return Dex.species
    .all()
    .filter(
      (s) => s.num > 0 && !s.battleOnly && (s.isNonstandard === null || s.isNonstandard === 'Past'),
    );
}
