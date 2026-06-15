/**
 * Icon-hash table types + loader (WS-D).
 *
 * The table maps each legal species id to its precomputed perceptual hash,
 * generated offline by scripts/buildIconHashes.ts and stored in
 * src/data/iconHashes.json. Shape is shared by build and run paths.
 */
import { HASH_BITS_SIDE, NORMALIZE_SIZE } from './hash';

/** A single precomputed icon hash entry. */
export interface IconHashEntry {
  speciesId: string;
  /** Human-readable species name (for debugging/UX), e.g. "Ogerpon-Wellspring". */
  name: string;
  /** Hex perceptual hash from hashImage(). */
  hash: string;
}

/** Top-level shape of src/data/iconHashes.json. */
export interface IconHashTable {
  /**
   * Format active when this table was generated. Provenance only (R5): this
   * table covers the full National Dex and is regulation-INDEPENDENT, so this
   * field does not indicate staleness — see src/data/championsLegality.json
   * for regulation-specific legality.
   */
  format: string;
  /** ISO date the table was generated. */
  generatedAt: string;
  /** blockhash side length used (must equal HASH_BITS_SIDE at runtime). */
  hashBitsSide: number;
  /** Normalize edge length used (must equal NORMALIZE_SIZE at runtime). */
  normalizeSize: number;
  /** Sprite sheet source URL the icons were cropped from. */
  spriteSheetUrl: string;
  entries: IconHashEntry[];
}

/**
 * Validate that a loaded table was produced with the same hashing parameters the
 * runtime uses. A mismatch means build/run parity is broken — refuse rather than
 * silently return garbage matches.
 */
export function assertTableCompatible(table: IconHashTable): void {
  if (table.hashBitsSide !== HASH_BITS_SIDE || table.normalizeSize !== NORMALIZE_SIZE) {
    throw new Error(
      `iconHashes.json was built with incompatible params ` +
        `(bitsSide=${table.hashBitsSide}, normalize=${table.normalizeSize}); ` +
        `runtime expects bitsSide=${HASH_BITS_SIDE}, normalize=${NORMALIZE_SIZE}. ` +
        `Regenerate with: npx tsx scripts/buildIconHashes.ts`,
    );
  }
}
