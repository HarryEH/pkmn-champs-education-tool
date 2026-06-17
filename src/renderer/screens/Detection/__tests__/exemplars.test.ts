/**
 * Exemplar augmentation: parity-matching labels are appended as reference entries
 * (with resolved name + base species), mismatches are dropped, and the augmented
 * table lets the matcher rank a real exemplar above the synthetic sprite.
 */
import { describe, it, expect } from 'vitest';
import { augmentTableWithLabels } from '../exemplars';
import { EMBED_MODEL, type BoxEmbeddingTable } from '../../../../lib/detection/boxEmbeddings';
import { PREPROC_VERSION } from '../../../../lib/detection/embedPreproc';
import { matchEmbedding } from '../../../../lib/detection/iconMatcher';
import type { DetectionLabel } from '../../../../shared/types';

function baseTable(): BoxEmbeddingTable {
  return {
    model: EMBED_MODEL,
    preprocVersion: PREPROC_VERSION,
    dim: 3,
    mean: [0, 0, 0],
    generatedAt: '',
    entries: [
      { speciesId: 'rotomwash', name: 'Rotom-Wash', baseSpeciesId: 'rotom', vector: [0, 1, 0] },
      { speciesId: 'garchomp', name: 'Garchomp', baseSpeciesId: 'garchomp', vector: [0, 0, 1] },
    ],
  };
}

function label(over: Partial<DetectionLabel>): DetectionLabel {
  return {
    id: 'l1',
    speciesId: 'rotomwash',
    embedding: [1, 0, 0],
    model: EMBED_MODEL,
    preprocVersion: PREPROC_VERSION,
    cropPng: '',
    regulation: 'gen9championsvgc2026regma',
    createdAt: 0,
    wasAutoTop1: false,
    ...over,
  };
}

describe('augmentTableWithLabels', () => {
  it('appends parity-matching labels with resolved name + base species', () => {
    const table = augmentTableWithLabels(baseTable(), [label({})]);
    expect(table.entries).toHaveLength(3);
    const added = table.entries[2];
    expect(added.speciesId).toBe('rotomwash');
    expect(added.baseSpeciesId).toBe('rotom');
    expect(added.vector).toEqual([1, 0, 0]);
  });

  it('drops labels whose model / preprocVersion / dim do not match', () => {
    const table = augmentTableWithLabels(baseTable(), [
      label({ model: 'other-model' }),
      label({ preprocVersion: 999 }),
      label({ embedding: [1, 0] }), // wrong dim
    ]);
    expect(table.entries).toHaveLength(2); // unchanged
  });

  it('lets a real exemplar out-rank the synthetic sprite for a query near it', () => {
    // A crop near [1,0,0]: no base sprite points that way, but the exemplar does.
    const augmented = augmentTableWithLabels(baseTable(), [label({})]);
    const ranked = matchEmbedding([1, 0, 0], augmented, { topN: 3 });
    expect(ranked[0].speciesId).toBe('rotomwash');
    // The exemplar and any other rotom evidence surface as ONE candidate.
    expect(ranked.filter((c) => c.speciesId === 'rotomwash')).toHaveLength(1);
  });
});
