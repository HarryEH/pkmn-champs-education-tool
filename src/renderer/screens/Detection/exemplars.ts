/**
 * Exemplar augmentation — fold the user's label-as-you-go crops into the matcher.
 *
 * The committed box-embedding table is all SYNTHETIC pokesprite references, which
 * leaves a domain gap to real Switch renders (the Rotom-Wash / grey-ghost
 * confusions). Each confirmed real crop the user labels is a few-shot exemplar in
 * the SAME embedding space, so appending them as extra reference entries lets the
 * matcher's max-cosine 1-NN snap to a real example when one exists — self-improving
 * locally as you play. Species without exemplars keep falling back to the sprite.
 *
 * Centering is unchanged: exemplars are stored RAW and centered at match time with
 * the table's existing pool `mean` (same as every other entry), so we never
 * recompute the mean over the augmented set.
 */
import { gen } from '../../../lib/calc/gen';
import type { BoxEmbeddingTable } from '../../../lib/detection/boxEmbeddings';
import type { DetectionLabel } from '../../../shared/types';

/**
 * Return a table with the parity-matching labels appended as reference entries.
 * Labels whose model / preprocVersion / dim don't match the base table are
 * dropped (a stale embedding would poison cosine) — they remain on disk and can
 * be re-embedded from their stored crop later. Returns the base table unchanged
 * when nothing usable is present.
 */
export function augmentTableWithLabels(
  base: BoxEmbeddingTable,
  labels: DetectionLabel[],
): BoxEmbeddingTable {
  const usable = labels.filter(
    (l) =>
      l.model === base.model &&
      l.preprocVersion === base.preprocVersion &&
      l.embedding.length === base.dim,
  );
  if (usable.length === 0) return base;

  const extra = usable.map((l) => {
    const sp = gen.species.get(l.speciesId);
    const baseSpeciesId = sp?.exists
      ? (gen.species.get(sp.baseSpecies)?.id ?? l.speciesId)
      : l.speciesId;
    return {
      speciesId: l.speciesId,
      name: sp?.exists ? sp.name : l.speciesId,
      baseSpeciesId,
      vector: l.embedding,
    };
  });

  return { ...base, entries: [...base.entries, ...extra] };
}
