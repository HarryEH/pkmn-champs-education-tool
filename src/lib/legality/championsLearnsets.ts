/**
 * Champions Reg M-A per-species movepool table types + lookup (R6).
 *
 * Unlike items/moves/abilities (small delta over vanilla, resolved at runtime via
 * the synchronous `gen.X.get()`), learnsets MUST be baked at build time: the
 * @pkmn/data learnset API (`gen.learnsets.get`) is async, and parsePokepaste is
 * synchronous (it runs in a React useMemo for live import preview). So
 * scripts/buildChampionsLearnsets.ts pre-computes the full prevo-merged movepool
 * for every species in the pool and writes it here.
 */

/** Top-level shape of src/data/championsLearnsets.json. */
export interface ChampionsLearnsetsTable {
  format: string;
  generatedAt: string;
  source: string;
  /** speciesId -> sorted list of every move id that species may legally carry. */
  learnsets: Record<string, string[]>;
}

/** Index a loaded table by speciesId -> Set of move ids for O(1) membership. */
export function buildLearnsetIndex(table: ChampionsLearnsetsTable): Map<string, Set<string>> {
  return new Map(
    Object.entries(table.learnsets).map(([id, moves]) => [id, new Set(moves)]),
  );
}

/**
 * Whether `speciesId` can legally carry `moveId`.
 *
 * Permissive on absence: a species with no entry in the table (shouldn't happen
 * for the legal pool, but guards against gaps) is treated as able to learn
 * anything, so we never surface a false-positive "illegal move" error for a
 * species we simply lack data for.
 */
export function canLearnMove(
  index: Map<string, Set<string>>,
  speciesId: string,
  moveId: string,
): boolean {
  const moves = index.get(speciesId);
  if (!moves) return true;
  return moves.has(moveId);
}
