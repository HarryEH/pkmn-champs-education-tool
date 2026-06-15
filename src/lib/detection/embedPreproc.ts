/**
 * CLIP preprocessing shared by the build script (Node) and the runtime embedder
 * (renderer) — the single source of truth for turning an `RgbaImage` into the RGB
 * pixels fed to CLIP. Build/run parity is sacred: if these two paths ever produce
 * different pixels, every match silently degrades. So the one bit of math that can
 * drift — alpha-compositing the (often transparent) box sprite over a white
 * background — lives here and is bumped via {@link PREPROC_VERSION}.
 *
 * Returns straight RGB bytes (3 channels) rather than a transformers `RawImage` so
 * this module pulls in no heavy ML deps; each caller wraps the bytes in
 * `new RawImage(bytes, width, height, 3)` itself.
 */
import type { RgbaImage } from './image';

/**
 * Bump whenever the compositing/pooling/normalization changes. Stamped into
 * boxEmbeddings.json at build time and asserted at runtime so a stale table can
 * never be matched against freshly-preprocessed crops.
 *
 * v1: straight-alpha blend over opaque white, RGB, then (in the embedder)
 *     CLIP mean-pool + L2-normalize.
 */
export const PREPROC_VERSION = 1;

/** RGB bytes for CLIP, tightly packed (length === width * height * 3). */
export interface RgbImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Alpha-blend an RGBA image over an opaque white background, dropping the alpha
 * channel. Transparent sprite pixels become white — matching how the in-game
 * opponent render reads against its panel and how the spike validated the
 * approach. Pure pixel math, no canvas/DOM, so build and runtime share it exactly.
 */
export function compositeOnWhite(img: RgbaImage): RgbImage {
  const { width, height } = img;
  const src = img.data;
  const out = new Uint8ClampedArray(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    const a = src[p * 4 + 3] / 255;
    const inv = 255 * (1 - a);
    out[p * 3] = src[p * 4] * a + inv;
    out[p * 3 + 1] = src[p * 4 + 1] * a + inv;
    out[p * 3 + 2] = src[p * 4 + 2] * a + inv;
  }
  return { width, height, data: out };
}
