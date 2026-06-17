/**
 * Label-as-you-go capture — turn a confirmed (crop → species) pick into a stored
 * training exemplar. Mirrors the detection pipeline's preprocessing exactly
 * (segment off the red panel → CLIP embed) so the captured embedding lives in the
 * same space as the reference table and the augmentation in `exemplars.ts`.
 */
import { segmentToWhite } from '../../../lib/detection/segment';
import { embedCrop } from '../../../lib/detection/embedder';
import { EMBED_MODEL } from '../../../lib/detection/boxEmbeddings';
import { PREPROC_VERSION } from '../../../lib/detection/embedPreproc';
import type { RgbaImage } from '../../../lib/detection/image';
import { CURRENT_FORMAT, type DetectionLabel } from '../../../shared/types';

/** Encode an RgbaImage as a PNG data URL (the stored, re-embeddable crop). */
function rgbaToPngDataUrl(img: RgbaImage): string {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const data = img.data instanceof Uint8ClampedArray ? img.data : new Uint8ClampedArray(img.data);
  ctx.putImageData(new ImageData(data, img.width, img.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Build a {@link DetectionLabel} from a RAW slot crop + the confirmed species.
 * Segments + embeds the crop on the production path so the exemplar matches the
 * reference space. Async (one CLIP inference); callers fire-and-persist.
 */
export async function captureLabel(
  rawCrop: RgbaImage,
  speciesId: string,
  wasAutoTop1: boolean,
): Promise<DetectionLabel> {
  const segmented = segmentToWhite(rawCrop);
  const embedding = await embedCrop(segmented);
  return {
    id: `lbl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    speciesId,
    embedding,
    model: EMBED_MODEL,
    preprocVersion: PREPROC_VERSION,
    cropPng: rgbaToPngDataUrl(segmented),
    regulation: CURRENT_FORMAT,
    createdAt: Date.now(),
    wasAutoTop1,
  };
}
