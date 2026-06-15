/**
 * Champions Reg M-A species-legality table types + lookup (R5).
 *
 * The table maps every species id in src/data/iconHashes.json's pool (the full,
 * regulation-INDEPENDENT National Dex — see iconHashes.ts) to its legality under
 * the CURRENT Champions regulation. Generated offline by
 * scripts/buildChampionsLegality.ts from the `champions` mod's formats-data.ts
 * (smogon/pokemon-showdown) merged onto @pkmn/dex's ungated species data.
 *
 * This is the second layer of the two-layer architecture: match a detected
 * icon against iconHashes.json to get a speciesId, then look that id up here
 * to find out if it's legal/banned this regulation.
 */

/** Per-species override fields the `champions` mod's formats-data.ts may set. */
export interface ChampionsFormatOverride {
  isNonstandard?: string;
  tier?: string;
}

/** Minimal species shape {@link deriveLegality} needs (subset of @pkmn/dex Species). */
export interface LegalitySpeciesInput {
  id: string;
  name: string;
  tier: string;
  isNonstandard: string | null;
  tags: readonly string[];
}

/** Tier values that mean "not part of the champions mod's species pool". */
export const ILLEGAL_TIERS: ReadonlySet<string> = new Set(['Illegal', 'CAP', 'Unreleased']);

/** Flat Rules banlist (champions/rulesets.ts `flatrules.banlist`): always banned. */
export const BANNED_TAGS: ReadonlySet<string> = new Set(['Mythical', 'Restricted Legendary']);

/** One species' derived Champions Reg M-A legality. */
export interface ChampionsLegalityEntry {
  speciesId: string;
  name: string;
  /** Whether this species is part of the Reg M-A legal pool. */
  legal: boolean;
  /** Effective tier: the champions override's `tier`, or the base dex tier. */
  tier: string;
  /** Effective isNonstandard: the champions override's value, or the base dex value. */
  isNonstandard: string | null;
}

/** Top-level shape of src/data/championsLegality.json. */
export interface ChampionsLegalityTable {
  /** The regulation this table was generated for, e.g. "gen9championsvgc2026regma". */
  format: string;
  /** ISO date the table was generated. */
  generatedAt: string;
  /** Source URL the champions mod overrides were fetched from. */
  source: string;
  entries: ChampionsLegalityEntry[];
}

/**
 * Derive one species' Champions Reg M-A legality from its base dex data plus
 * any per-species override the `champions` mod's formats-data.ts provides.
 *
 * Rules (reproduces the worked examples: Lopunny legal incl. Mega, Flutter Mane
 * banned):
 *  - If the champions mod overrides `isNonstandard` (used for alternate/cosmetic
 *    formes it demotes, e.g. Arceus-Bug, Squawkabilly-Blue), the species is
 *    illegal regardless of tier — champions is explicitly saying "not a distinct
 *    pick in this game", independent of @pkmn/dex's SV-regional-dex `isNonstandard`
 *    (which marks pre-SV species like Lopunny as "Past" even though champions
 *    legalizes them).
 *  - Otherwise, legality follows the effective tier (the override's `tier`,
 *    falling back to the base dex tier): Illegal/CAP/Unreleased = banned.
 *  - Mythical / Restricted Legendary species are always banned (Flat Rules),
 *    independent of tier — checked via @pkmn/dex's `tags`.
 */
export function deriveLegality(
  species: LegalitySpeciesInput,
  override: ChampionsFormatOverride | undefined,
): ChampionsLegalityEntry {
  const tier = override?.tier ?? species.tier;
  const isNonstandard = override?.isNonstandard ?? species.isNonstandard;
  const demotedByChampions = override?.isNonstandard != null;
  const legal =
    !demotedByChampions &&
    !ILLEGAL_TIERS.has(tier) &&
    !species.tags.some((tag) => BANNED_TAGS.has(tag));
  return { speciesId: species.id, name: species.name, legal, tier, isNonstandard };
}

/** Index a loaded table by speciesId for O(1) lookups. */
export function buildLegalityIndex(
  table: ChampionsLegalityTable,
): Map<string, ChampionsLegalityEntry> {
  return new Map(table.entries.map((entry) => [entry.speciesId, entry]));
}

/**
 * Whether a species is legal under the current regulation. Species absent from
 * the table (i.e. outside iconHashes.json's pool entirely) are treated as
 * illegal — the table is a superset of every detectable/pickable species, so
 * absence means "not part of the champions roster at all".
 */
export function isChampionsLegal(
  index: Map<string, ChampionsLegalityEntry>,
  speciesId: string,
): boolean {
  return index.get(speciesId)?.legal ?? false;
}
