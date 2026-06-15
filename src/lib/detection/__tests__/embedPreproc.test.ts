/**
 * Sanity checks for the build/run parity primitive used by the runtime embedder
 * (src/lib/detection/embedder.ts). The heavy CLIP model path needs an Electron
 * renderer and is verified manually via `npm start`; this covers only the pure
 * pixel-prep that must produce a w*h*3 RGB buffer for `RawImage`.
 */
import { describe, expect, it } from 'vitest';
import { compositeOnWhite } from '../embedPreproc';
import type { RgbaImage } from '../image';

describe('compositeOnWhite (embedder preprocessing parity)', () => {
  it('produces a tightly packed RGB buffer of length width*height*3', () => {
    const width = 4;
    const height = 3;
    const img: RgbaImage = {
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    };
    const out = compositeOnWhite(img);
    expect(out.width).toBe(width);
    expect(out.height).toBe(height);
    expect(out.data.length).toBe(width * height * 3);
  });

  it('alpha-blends over white: transparent → white, opaque → source', () => {
    // 2 px: [0] fully transparent black, [1] fully opaque red.
    const img: RgbaImage = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255]),
    };
    const out = compositeOnWhite(img);
    expect(Array.from(out.data.slice(0, 3))).toEqual([255, 255, 255]); // → white
    expect(Array.from(out.data.slice(3, 6))).toEqual([255, 0, 0]); // → red unchanged
  });
});
