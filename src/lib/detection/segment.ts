/**
 * Opponent-crop segmentation (R7) — renderer/pure.
 *
 * The team-preview crop sits on the red opponent panel; that background dominates
 * a raw CLIP embedding and pulls matches toward red-bodied species (e.g. raw crops
 * rank Incineroar behind Armarouge). Replacing the panel with white before
 * embedding measurably lifts accuracy on the real Jason frame (4/6 -> 5/6 top-1),
 * which is why this is the PRIMARY preprocessing now, not the diagnostic fallback
 * the early spike assumed (that finding predates the rotom-wash + gen-9 reference
 * additions; re-measured, segmentation wins).
 *
 * Approach (ported from scripts/spikeEmbed.ts): estimate the background colour from
 * the border ring (median), threshold every pixel's distance from it, keep the
 * largest connected foreground component, and composite that over white. Pure
 * pixel math (no canvas/DOM) so build, runtime, and tests share one path.
 */
import type { RgbaImage } from './image';

/** Median border colour — a robust estimate of the panel background. */
function borderBackground(img: RgbaImage, ring = 4): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (x >= ring && x < img.width - ring && y >= ring && y < img.height - ring) continue;
      const i = (y * img.width + x) * 4;
      rs.push(img.data[i]);
      gs.push(img.data[i + 1]);
      bs.push(img.data[i + 2]);
    }
  }
  const median = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  return [median(rs), median(gs), median(bs)];
}

/** Default colour-distance threshold (squared) separating foreground from panel. */
const FG_THRESHOLD = 55;

/**
 * Foreground mask: pixels far enough from the border background, restricted to the
 * single largest connected component (drops stray speckles / panel gradients).
 */
export function foregroundMask(img: RgbaImage, threshold = FG_THRESHOLD): Uint8Array {
  const { width: w, height: h } = img;
  const bg = borderBackground(img);
  const raw = new Uint8Array(w * h);
  const t2 = threshold * threshold;
  for (let p = 0; p < w * h; p++) {
    const r = img.data[p * 4] - bg[0];
    const g = img.data[p * 4 + 1] - bg[1];
    const b = img.data[p * 4 + 2] - bg[2];
    raw[p] = r * r + g * g + b * b > t2 ? 1 : 0;
  }

  // Largest connected component via iterative flood fill (4-connectivity).
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!raw[s] || seen[s]) continue;
    const comp: number[] = [];
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop() as number;
      comp.push(p);
      const x = p % w;
      const y = (p / w) | 0;
      const neighbours = [
        x > 0 ? p - 1 : -1,
        x < w - 1 ? p + 1 : -1,
        y > 0 ? p - w : -1,
        y < h - 1 ? p + w : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && raw[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }

  const out = new Uint8Array(w * h);
  for (const p of best) out[p] = 1;
  return out;
}

/**
 * Composite the segmented foreground over an opaque white background, returning an
 * RGBA image (alpha 255 everywhere) so it can flow straight into the standard
 * embedder (whose composite-on-white step is then a no-op). Background pixels
 * become white; foreground keeps its original colour. If segmentation finds almost
 * nothing (degenerate crop), the original image is returned unchanged so a bad mask
 * never blanks the whole crop.
 */
export function segmentToWhite(img: RgbaImage, threshold = FG_THRESHOLD): RgbaImage {
  const { width: w, height: h } = img;
  const mask = foregroundMask(img, threshold);

  let fgCount = 0;
  for (let p = 0; p < w * h; p++) fgCount += mask[p];
  // Guard: a near-empty mask (e.g. <2% foreground) means segmentation failed; fall
  // back to the raw crop rather than embedding a blank white square.
  if (fgCount < w * h * 0.02) {
    return { width: w, height: h, data: img.data };
  }

  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const fg = mask[p] === 1;
    out[p * 4] = fg ? img.data[p * 4] : 255;
    out[p * 4 + 1] = fg ? img.data[p * 4 + 1] : 255;
    out[p * 4 + 2] = fg ? img.data[p * 4 + 2] : 255;
    out[p * 4 + 3] = 255;
  }
  return { width: w, height: h, data: out };
}
