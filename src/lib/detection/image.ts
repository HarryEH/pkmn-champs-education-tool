/**
 * Shared RGBA image type for the detection pipeline.
 *
 * Lives in its own module (not coupled to any hashing/embedding backend) so every
 * detection stage — crop, composite, embed — and the Node test harness can share
 * one structural type. Both a browser `ImageData` and a Node-decoded PNG
 * (`{ width, height, data }` with RGBA bytes) satisfy it, so the pure pixel math
 * runs identically in the renderer and under vitest.
 */

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
