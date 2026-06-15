/**
 * Crop regions (WS-D) — renderer/pure.
 *
 * Applies the six normalized (0-1) calibration rects (Settings.calibrationRegions,
 * authored by WS-E's calibration UI) to a full-frame `ImageData`, yielding one
 * `ImageData` crop per opponent icon. Normalized coordinates are resolution- and
 * aspect-ratio-independent, which is exactly why calibration is stored that way
 * (see R3 memo: capture devices report varying frame sizes).
 *
 * This module is pure pixel math — no canvas, no DOM — so it runs in tests too.
 */
import type { NormalizedRect } from '../../shared/types';
import type { RgbaImage } from './image';

/**
 * Extract one rectangular crop from an RGBA image using a normalized rect.
 * Coordinates are clamped to the frame so a slightly-off calibration can't read
 * out of bounds. The result is a fresh, tightly-packed RGBA buffer.
 */
export function cropRegion(image: RgbaImage, rect: NormalizedRect): RgbaImage {
  const fw = image.width;
  const fh = image.height;

  // Convert normalized -> pixel, clamp, and guarantee at least 1px each side.
  const x0 = clamp(Math.round(rect.x * fw), 0, fw - 1);
  const y0 = clamp(Math.round(rect.y * fh), 0, fh - 1);
  const x1 = clamp(Math.round((rect.x + rect.w) * fw), x0 + 1, fw);
  const y1 = clamp(Math.round((rect.y + rect.h) * fh), y0 + 1, fh);

  const cw = x1 - x0;
  const ch = y1 - y0;
  const out = new Uint8ClampedArray(cw * ch * 4);

  for (let y = 0; y < ch; y++) {
    const srcRow = (y0 + y) * fw + x0;
    const dstRow = y * cw;
    for (let x = 0; x < cw; x++) {
      const si = (srcRow + x) * 4;
      const di = (dstRow + x) * 4;
      out[di] = image.data[si];
      out[di + 1] = image.data[si + 1];
      out[di + 2] = image.data[si + 2];
      out[di + 3] = image.data[si + 3];
    }
  }

  return { width: cw, height: ch, data: out };
}

/**
 * Apply an ordered list of normalized rects to a frame, producing one crop each.
 * Order is preserved so crop[i] maps to opponent slot i.
 */
export function cropRegions(image: RgbaImage, rects: NormalizedRect[]): RgbaImage[] {
  return rects.map((rect) => cropRegion(image, rect));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
