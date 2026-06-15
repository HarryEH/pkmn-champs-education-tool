/**
 * Node-only PNG -> RgbaImage loader for the detection accuracy harness.
 *
 * The renderer decodes frames via `createImageBitmap` + canvas (imageSource.ts),
 * which doesn't exist under Node/vitest. pngjs gives us the identical RGBA byte
 * layout (`{ width, height, data }`) the pure pipeline (cropRegions/hash) expects,
 * so tests can feed a real Switch screenshot through the exact production code.
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import type { RgbaImage } from '../../image';

export function loadPng(path: string): RgbaImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: png.data };
}
