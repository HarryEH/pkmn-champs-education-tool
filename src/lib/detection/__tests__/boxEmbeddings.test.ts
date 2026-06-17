/**
 * Contract tests (R7 Step 0) for the box-embedding source-of-truth helpers:
 * centering/cosine math, the committed table's build/run-parity asserts, and the
 * embedding matcher's ranking + legal-only filtering. Uses a small hand-built
 * table so it stays fast and independent of the slow real CLIP build.
 */
import { describe, it, expect } from 'vitest';
import {
  EMBED_MODEL,
  assertTableCompatible,
  centerAndNormalize,
  cosine,
  l2normalize,
  loadBoxEmbeddings,
  type BoxEmbeddingTable,
} from '../boxEmbeddings';
import { PREPROC_VERSION } from '../embedPreproc';
import { cosineToConfidence, matchEmbedding } from '../iconMatcher';

/** A tiny 3-entry, low-dim table that exercises the same code paths as the real one. */
function tinyTable(): BoxEmbeddingTable {
  const entries = [
    { speciesId: 'incineroar', name: 'Incineroar', vector: [1, 0, 0] },
    { speciesId: 'garchomp', name: 'Garchomp', vector: [0, 1, 0] },
    { speciesId: 'tyranitar', name: 'Tyranitar', vector: [0, 0, 1] },
  ];
  const dim = 3;
  const mean = [0, 1, 2].map((i) => entries.reduce((a, e) => a + e.vector[i], 0) / entries.length);
  return { model: EMBED_MODEL, preprocVersion: PREPROC_VERSION, dim, mean, generatedAt: '', entries };
}

describe('boxEmbeddings math', () => {
  it('l2normalize yields a unit vector', () => {
    const u = l2normalize([3, 4]);
    expect(Math.hypot(u[0], u[1])).toBeCloseTo(1, 6);
  });

  it('centerAndNormalize subtracts the mean then normalizes', () => {
    const mean = [1, 1];
    const c = centerAndNormalize([2, 1], mean); // (1,0) -> unit
    expect(c[0]).toBeCloseTo(1, 6);
    expect(c[1]).toBeCloseTo(0, 6);
  });

  it('cosine of identical centered vectors is 1', () => {
    const v = centerAndNormalize([2, 0, 0], [0, 0, 0]);
    expect(cosine(v, v)).toBeCloseTo(1, 6);
  });

  it('cosineToConfidence maps [-1,1] -> [0,1] monotonically', () => {
    expect(cosineToConfidence(1)).toBeCloseTo(1, 6);
    expect(cosineToConfidence(-1)).toBeCloseTo(0, 6);
    expect(cosineToConfidence(0)).toBeCloseTo(0.5, 6);
  });
});

describe('assertTableCompatible', () => {
  it('accepts a matching model + preprocVersion', () => {
    expect(() => assertTableCompatible(tinyTable())).not.toThrow();
  });
  it('throws on model mismatch', () => {
    expect(() => assertTableCompatible({ ...tinyTable(), model: 'other' })).toThrow(/model/);
  });
  it('throws on preprocVersion mismatch', () => {
    expect(() => assertTableCompatible({ ...tinyTable(), preprocVersion: 999 })).toThrow(/preprocVersion/);
  });
});

describe('loadBoxEmbeddings (committed table)', () => {
  it('loads and passes the parity asserts', () => {
    const table = loadBoxEmbeddings();
    expect(table.model).toBe(EMBED_MODEL);
    expect(table.preprocVersion).toBe(PREPROC_VERSION);
    expect(table.mean).toHaveLength(table.dim);
    expect(table.entries.length).toBeGreaterThan(0);
    for (const e of table.entries) expect(e.vector).toHaveLength(table.dim);
  });
});

describe('matchEmbedding', () => {
  const table = tinyTable();

  it('ranks the matching reference top-1', () => {
    // Query equals the incineroar reference vector → should rank incineroar #1.
    const out = matchEmbedding([1, 0, 0], table, { topN: 3 });
    expect(out[0].speciesId).toBe('incineroar');
    expect(out).toHaveLength(3);
    // best-first
    expect(out[0].confidence).toBeGreaterThanOrEqual(out[1].confidence);
    expect(out[1].confidence).toBeGreaterThanOrEqual(out[2].confidence);
  });

  it('respects the legalOnly filter', () => {
    const out = matchEmbedding([1, 0, 0], table, {
      legalOnly: new Set(['garchomp', 'tyranitar']),
    });
    expect(out.map((c) => c.speciesId).sort()).toEqual(['garchomp', 'tyranitar']);
    expect(out.find((c) => c.speciesId === 'incineroar')).toBeUndefined();
  });

  it('confidence stays within [0,1]', () => {
    for (const c of matchEmbedding([0.5, 0.2, 0.9], table)) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('matchEmbedding forme-family collapse', () => {
  /** Two near-identical "rotom" formes plus a distinct species sharing the space. */
  function formeTable(): BoxEmbeddingTable {
    const entries = [
      { speciesId: 'rotomwash', name: 'Rotom-Wash', baseSpeciesId: 'rotom', vector: [1, 0, 0.02] },
      { speciesId: 'rotomfan', name: 'Rotom-Fan', baseSpeciesId: 'rotom', vector: [1, 0, -0.02] },
      { speciesId: 'garchomp', name: 'Garchomp', baseSpeciesId: 'garchomp', vector: [0, 1, 0] },
    ];
    const dim = 3;
    const mean = [0, 1, 2].map(
      (i) => entries.reduce((a, e) => a + e.vector[i], 0) / entries.length,
    );
    return {
      model: EMBED_MODEL,
      preprocVersion: PREPROC_VERSION,
      dim,
      mean,
      generatedAt: '',
      entries,
    };
  }

  it('pools formes under their base id, emitting one base candidate', () => {
    const out = matchEmbedding([1, 0, 0], formeTable(), { topN: 3, collapseFormes: true });
    // Both rotom formes collapse to a single "rotom" candidate; garchomp stays.
    expect(out.map((c) => c.speciesId)).toEqual(['rotom', 'garchomp']);
    expect(out).toHaveLength(2);
  });

  it('keeps formes separate without the flag', () => {
    const out = matchEmbedding([1, 0, 0], formeTable(), { topN: 3 });
    expect(out.map((c) => c.speciesId).sort()).toEqual(['garchomp', 'rotomfan', 'rotomwash']);
  });

  it('falls back to speciesId when baseSpeciesId is absent', () => {
    // tinyTable() entries have no baseSpeciesId — collapse must not drop them.
    const out = matchEmbedding([1, 0, 0], tinyTable(), { topN: 3, collapseFormes: true });
    expect(out.map((c) => c.speciesId).sort()).toEqual(['garchomp', 'incineroar', 'tyranitar']);
  });

  it('dedupes multiple exemplars of one species to a single best candidate', () => {
    // Two "incineroar" reference vectors (e.g. a sprite + a real-crop exemplar).
    const table: BoxEmbeddingTable = {
      model: EMBED_MODEL,
      preprocVersion: PREPROC_VERSION,
      dim: 3,
      mean: [0, 0, 0],
      generatedAt: '',
      entries: [
        { speciesId: 'incineroar', name: 'Incineroar', vector: [1, 0, 0] },
        { speciesId: 'incineroar', name: 'Incineroar', vector: [0.9, 0.1, 0] },
        { speciesId: 'garchomp', name: 'Garchomp', vector: [0, 1, 0] },
      ],
    };
    const out = matchEmbedding([1, 0, 0], table, { topN: 3 });
    // Incineroar appears once (best vector), not twice.
    expect(out.filter((c) => c.speciesId === 'incineroar')).toHaveLength(1);
    expect(out[0].speciesId).toBe('incineroar');
    expect(out.map((c) => c.speciesId)).toEqual(['incineroar', 'garchomp']);
  });
});
