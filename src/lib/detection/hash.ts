/**
 * Shared perceptual-hash core (WS-D).
 *
 * CRITICAL: this exact function is the single source of truth for hashing, used
 * BOTH at build-time (Node, scripts/buildIconHashes.ts) and at run-time (the
 * renderer, iconMatcher.ts). If the two paths ever disagree, every match breaks.
 * Therefore the normalization (32x32) and the blockhash invocation live here and
 * nowhere else.
 *
 * blockhash-core's `bmvbhash` accepts any `{ width, height, data }` object where
 * `data` is RGBA bytes, which is exactly what a renderer `ImageData` and a
 * Node-decoded PNG both provide — so the two environments share one code path.
 */
import { bmvbhash } from 'blockhash-core';

/**
 * Minimal structural type both a browser `ImageData` and a Node-decoded image
 * satisfy. Kept deliberately tiny so neither environment needs DOM lib types.
 */
export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA bytes, length === width * height * 4. */
  data: Uint8Array | Uint8ClampedArray | number[];
}

/**
 * Hash side length in blocks. The hash has `HASH_BITS_SIDE ** 2` bits, encoded
 * as a hex string of `(HASH_BITS_SIDE ** 2) / 4` chars.
 */
export const HASH_BITS_SIDE = 16;

/** Total bits in a hash (== max possible Hamming distance). */
export const HASH_MAX_BITS = HASH_BITS_SIDE * HASH_BITS_SIDE;

/** The square edge (px) every icon crop is normalized to before hashing. */
export const NORMALIZE_SIZE = 32;

/**
 * Compute the perceptual hash (hex string) of an RGBA image.
 *
 * Callers MUST pass an image already normalized to NORMALIZE_SIZE x NORMALIZE_SIZE
 * (renderer does this on a canvas; the build script does it via nearest-neighbour
 * resampling). `bmvbhash` is resolution-independent, but matching the normalized
 * size on both sides removes any sampling drift between build and run.
 */
export function hashImage(image: RgbaImage): string {
  return bmvbhash(image, HASH_BITS_SIDE);
}

/**
 * Hamming distance between two equal-length hex hash strings, in bits.
 * Returns HASH_MAX_BITS (worst case) if lengths differ, so a malformed entry
 * can never spuriously look like a good match.
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return HASH_MAX_BITS;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    // Each hex char is 4 bits; XOR then popcount the nibble.
    let nibble = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (nibble) {
      distance += nibble & 1;
      nibble >>= 1;
    }
  }
  return distance;
}

/**
 * Nearest-neighbour resample of an RGBA image to a square `size`. Pure, env-free
 * (no canvas), so the Node build script and tests can normalize identically to
 * how the renderer would. The renderer itself uses canvas `drawImage` scaling,
 * which for our coarse 16x16 blockhash is equivalent in practice.
 */
export function resampleNearest(src: RgbaImage, size: number = NORMALIZE_SIZE): RgbaImage {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / size));
    for (let x = 0; x < size; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / size));
      const si = (sy * src.width + sx) * 4;
      const di = (y * size + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { width: size, height: size, data: out };
}
