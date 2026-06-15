import { describe, it, expect } from 'vitest';
import type { NormalizedRect } from '../../../shared/types';
import { cropRegion, cropRegions } from '../cropRegions';
import type { RgbaImage } from '../image';

/**
 * Build a frame whose every pixel encodes its own coordinates in the R/G channels,
 * so a crop can be checked pixel-exactly: R = x (mod 256), G = y (mod 256).
 */
function coordFrame(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = x & 0xff;
      data[i + 1] = y & 0xff;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('cropRegion', () => {
  it('slices a synthetic ImageData by a NormalizedRect with correct size & pixels', () => {
    const frame = coordFrame(100, 80);
    // Crop the middle-ish region: x 0.2..0.5 (20..50 px), y 0.25..0.75 (20..60 px).
    const rect: NormalizedRect = { x: 0.2, y: 0.25, w: 0.3, h: 0.5 };
    const crop = cropRegion(frame, rect);

    expect(crop.width).toBe(30);
    expect(crop.height).toBe(40);

    // Top-left pixel of crop should be source pixel (20, 20).
    expect([crop.data[0], crop.data[1]]).toEqual([20, 20]);
    // Bottom-right pixel of crop should be source pixel (49, 59).
    const lastY = crop.height - 1;
    const lastX = crop.width - 1;
    const li = (lastY * crop.width + lastX) * 4;
    expect([crop.data[li], crop.data[li + 1]]).toEqual([49, 59]);
  });

  it('clamps out-of-range rects to frame bounds and keeps >= 1px', () => {
    const frame = coordFrame(50, 50);
    const rect: NormalizedRect = { x: 0.9, y: 0.9, w: 0.5, h: 0.5 };
    const crop = cropRegion(frame, rect);
    expect(crop.width).toBeGreaterThanOrEqual(1);
    expect(crop.height).toBeGreaterThanOrEqual(1);
    // Does not read beyond the frame.
    expect(crop.width).toBeLessThanOrEqual(50);
    expect(crop.height).toBeLessThanOrEqual(50);
  });

  it('a degenerate zero-size rect still yields a 1x1 crop (no crash)', () => {
    const frame = coordFrame(20, 20);
    const crop = cropRegion(frame, { x: 0.5, y: 0.5, w: 0, h: 0 });
    expect(crop.width).toBe(1);
    expect(crop.height).toBe(1);
  });
});

describe('cropRegions', () => {
  it('produces one crop per rect, preserving order', () => {
    const frame = coordFrame(120, 30);
    const rects: NormalizedRect[] = Array.from({ length: 6 }, (_, i) => ({
      x: i / 6,
      y: 0,
      w: 1 / 6,
      h: 1,
    }));
    const crops = cropRegions(frame, rects);
    expect(crops).toHaveLength(6);
    // Each crop's top-left x should advance by 20px (120/6).
    crops.forEach((crop, i) => {
      expect(crop.data[0]).toBe((i * 20) & 0xff);
    });
  });
});
