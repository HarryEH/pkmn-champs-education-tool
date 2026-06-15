/**
 * Runtime CLIP embedder (R7) — renderer-only.
 *
 * Turns an opponent crop (`RgbaImage`) into a raw 512-d CLIP image embedding,
 * using the SAME model + preprocessing as the build script
 * (`scripts/buildBoxEmbeddings.ts`) so crop and reference vectors are comparable.
 * This is the runtime half of the build/run parity contract; the matcher
 * (`iconMatcher.ts`) centers + cosine-NNs these against `boxEmbeddings.json`.
 *
 * Parity invariants (a silent mismatch SILENTLY DESTROYS accuracy):
 *   - model id     === EMBED_MODEL  (from boxEmbeddings.ts)
 *   - preprocessing === compositeOnWhite (PREPROC_VERSION, from embedPreproc.ts)
 *   - pooling/normalize call === the build script's
 * The reference vectors carry `model`/`preprocVersion` stamps; the loader
 * (`assertTableCompatible`) cross-checks those against the same constants this
 * module embeds against, so a stale table can't be matched.
 *
 * Design: lazy singleton. The ~150MB CLIP model is downloaded on first use (or
 * via `preloadEmbedder()`) and reused for every subsequent crop. Concurrent
 * callers share the one in-flight init promise.
 *
 * IMPORTANT (process model): this MUST run in the renderer, never the main
 * process — see CLAUDE.md. transformers.js here uses the browser runtime
 * (`dist/transformers.web.js`, selected automatically by Vite's `exports`
 * resolution), so the model caches via the browser **Cache API**, which persists
 * under the Electron app's storage partition (≈ userData) across runs. First run
 * downloads from the HF hub; later runs read from cache and work offline.
 */
import { env, pipeline, RawImage } from '@huggingface/transformers';
import { EMBED_MODEL } from './boxEmbeddings';
import { compositeOnWhite, PREPROC_VERSION } from './embedPreproc';
import type { RgbaImage } from './image';

// --- transformers.js environment (renderer / browser-like Electron) -----------
// Download the model on first run and cache it for offline reuse. In the Electron
// renderer transformers.js uses the browser Cache API (persists across runs under
// the app's storage partition); we do NOT set the Node-only `env.cacheDir` here.
env.allowRemoteModels = true; // fetch from the HF hub on first run
env.allowLocalModels = false; // no bundled local model dir in the renderer

/**
 * The transformers `image-feature-extraction` pipeline instance. `unknown`-typed
 * because we only ever call it as `extractor(raw, opts)`; see `Extractor` below.
 */
type Extractor = (
  raw: RawImage,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ data: Float32Array }>;

/** Coarse lifecycle the Detection screen can surface ("loading model…"). */
export type EmbedderStatus = 'idle' | 'loading' | 'ready' | 'error';

let status: EmbedderStatus = 'idle';
let extractorPromise: Promise<Extractor> | null = null;

/** Current embedder lifecycle state (cheap; safe to poll from React). */
export function getEmbedderStatus(): EmbedderStatus {
  return status;
}

/** True once the model is downloaded/loaded and ready to embed. */
export function isModelReady(): boolean {
  return status === 'ready';
}

/**
 * Lazily initialize (download + load) the CLIP pipeline as a singleton. The first
 * caller kicks off the download; concurrent callers await the same promise. On
 * error the cached promise is cleared so a later call can retry.
 */
function getExtractor(): Promise<Extractor> {
  if (extractorPromise) return extractorPromise;
  status = 'loading';
  extractorPromise = (async () => {
    // fp32 matches the spike (scripts/spikeEmbed.ts) — keep dtype in lockstep
    // with the build script for byte-identical embeddings.
    const ext = await pipeline('image-feature-extraction', EMBED_MODEL, { dtype: 'fp32' });
    status = 'ready';
    // transformers@4.2.0's type for this pipeline omits pooling/normalize, which
    // the runtime accepts; cast through unknown to the call shape we rely on.
    return ext as unknown as Extractor;
  })();
  extractorPromise.catch(() => {
    status = 'error';
    extractorPromise = null; // allow a retry on the next call
  });
  return extractorPromise;
}

/**
 * Start downloading/loading the model early (e.g. when the Detection screen
 * mounts) so the first real crop isn't blocked on the ~150MB download. Idempotent
 * and non-throwing — surfaces failure via {@link getEmbedderStatus} (`'error'`).
 */
export function preloadEmbedder(): void {
  void getExtractor().catch(() => {
    /* status already flipped to 'error'; nothing to do here */
  });
}

/**
 * Embed a single crop into a raw (un-centered) 512-d CLIP vector.
 *
 * Mirrors the build script exactly: `compositeOnWhite` (PREPROC_VERSION v1) →
 * `RawImage(rgb, w, h, 3)` → mean-pooled, L2-normalized image features. Centering
 * (subtracting the table's pool mean) happens later in the matcher, NOT here.
 */
export async function embedCrop(img: RgbaImage): Promise<number[]> {
  // PREPROC_VERSION referenced so a compositing change that bumps it forces a
  // compile-time touch of this parity-critical path (and documents intent).
  void PREPROC_VERSION;
  const extractor = await getExtractor();
  const rgb = compositeOnWhite(img);
  const raw = new RawImage(rgb.data, rgb.width, rgb.height, 3);
  const result = await extractor(raw, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}
