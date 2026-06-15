/**
 * Precompute CLIP embeddings of the six Jason team-preview crops so the detection
 * accuracy harness can assert the embedding matcher headlessly (no model download
 * in vitest). Mirrors the runtime embedder math exactly: compositeOnWhite ->
 * RawImage -> CLIP image-feature-extraction (fp32, mean-pool, normalize).
 *
 * Run: npx vite-node scripts/buildJasonCropEmbeddings.ts
 * Writes: src/lib/detection/__tests__/fixtures/jasonCropEmbeddings.json
 * Also prints the live top-1/top-3 of matchEmbedding vs the real table for a quick read.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pipeline, RawImage } from '@huggingface/transformers';
import { cropRegions } from '../src/lib/detection/cropRegions';
import { compositeOnWhite, PREPROC_VERSION } from '../src/lib/detection/embedPreproc';
import { segmentToWhite } from '../src/lib/detection/segment';
import { EMBED_MODEL, loadBoxEmbeddings } from '../src/lib/detection/boxEmbeddings';
import { matchEmbedding } from '../src/lib/detection/iconMatcher';
import { loadPng } from '../src/lib/detection/__tests__/helpers/loadPng';
import {
  JASON_FRAME_PATH,
  JASON_GROUND_TRUTH,
  JASON_RECTS,
} from '../src/lib/detection/__tests__/fixtures/jasonTeam';
import legality from '../src/data/championsLegality.json';

const OUT = resolve(
  'src/lib/detection/__tests__/fixtures/jasonCropEmbeddings.json',
);

async function main() {
  const extractor = await pipeline('image-feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
  const embed = async (img: { width: number; height: number; data: Uint8ClampedArray }) => {
    const raw = new RawImage(img.data, img.width, img.height, 3);
    const t = await extractor(raw, {
      pooling: 'mean',
      normalize: true,
    } as Parameters<typeof extractor>[1]);
    return Array.from(t.data as Float32Array);
  };

  const frame = loadPng(JASON_FRAME_PATH);
  const crops = cropRegions(frame, JASON_RECTS);
  // Production preprocessing: segment off the red panel, then composite-on-white.
  const embeddings: number[][] = [];
  for (const crop of crops) embeddings.push(await embed(compositeOnWhite(segmentToWhite(crop))));

  writeFileSync(
    OUT,
    JSON.stringify({
      model: EMBED_MODEL,
      preprocVersion: PREPROC_VERSION,
      dim: embeddings[0].length,
      groundTruth: JASON_GROUND_TRUTH,
      embeddings,
    }),
  );
  console.log(`wrote ${OUT} (${embeddings.length} crops, dim ${embeddings[0].length})`);

  // Live read against the real table, legal-only filtered.
  const table = loadBoxEmbeddings();
  const legalOnly = new Set(
    (legality as { entries: { speciesId: string; legal: boolean }[] }).entries
      .filter((e) => e.legal)
      .map((e) => e.speciesId),
  );
  let top1 = 0;
  let top3 = 0;
  for (let i = 0; i < embeddings.length; i++) {
    const ranked = matchEmbedding(embeddings[i], table, { legalOnly, topN: 5 });
    const rank = ranked.findIndex((c) => c.speciesId === JASON_GROUND_TRUTH[i]) + 1;
    if (rank === 1) top1++;
    if (rank >= 1 && rank <= 3) top3++;
    console.log(
      `slot ${i + 1} truth=${JASON_GROUND_TRUTH[i]}: #${rank || '—'}  ` +
        `top5=[${ranked.map((r) => `${r.speciesId}:${r.confidence.toFixed(3)}`).join(', ')}]`,
    );
  }
  console.log(`\ntop1 ${top1}/6, top3 ${top3}/6`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
