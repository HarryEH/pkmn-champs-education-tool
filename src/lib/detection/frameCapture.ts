/**
 * Frame capture (WS-D) — renderer only.
 *
 * Pulls a single still frame out of a live <video> element (the capture device
 * stream WS-E wires up) into an `ImageData`. Pure with respect to detection: it
 * neither opens nor owns the MediaStream — that is WS-E's responsibility. We just
 * turn "a playing video" into "pixels we can crop and hash".
 */

/**
 * Draw the current frame of a playing `<video>` onto an offscreen canvas and
 * return its pixels as `ImageData`.
 *
 * @throws if the video has no dimensions yet (stream not ready) or the 2D
 *         context cannot be acquired.
 */
export function captureVideoFrame(video: HTMLVideoElement): ImageData {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error(
      'captureVideoFrame: video has no dimensions yet (stream not ready / metadata not loaded)',
    );
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('captureVideoFrame: could not acquire 2D canvas context');
  }
  ctx.drawImage(video, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}
