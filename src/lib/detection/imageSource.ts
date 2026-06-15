/**
 * Image source (E1a) — renderer only.
 *
 * Decodes a dropped/selected screenshot `File` into the same `RgbaImage` shape
 * `frameCapture.captureVideoFrame` produces from a `<video>` element, so
 * `detectionPipeline.detectOpponentTeam` can treat a static screenshot and a
 * live capture frame identically (mirrors frameCapture.ts).
 */
import type { RgbaImage } from './image';

/**
 * Decode an image `File` (e.g. a dropped Switch team-preview screenshot) to
 * its full-resolution pixels.
 *
 * @throws if the image cannot be decoded or the 2D context cannot be acquired.
 */
export async function loadImageFromFile(file: File): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('loadImageFromFile: could not acquire 2D canvas context');
    }
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
