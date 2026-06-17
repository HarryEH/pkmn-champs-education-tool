/**
 * Video source (live capture) — renderer only.
 *
 * Grabs a still frame from a `<video>` element (an Elgato/USB capture stream) as
 * the canonical `RgbaImage` the detection pipeline consumes — the same shape
 * `imageSource.ts` produces from a dropped screenshot, so the CLIP pipeline runs
 * unchanged on a grabbed frame. Also returns a PNG data URL snapshot so the
 * calibration overlay can render the exact frame that was captured.
 */
import type { RgbaImage } from './image';

export interface GrabbedFrame {
  frame: RgbaImage;
  /** PNG data URL of the captured still, for the calibration overlay image. */
  snapshotUrl: string;
}

/**
 * Capture the current frame of a playing `<video>` to pixels + a snapshot URL.
 *
 * @throws if the video has no decoded frame yet, or the 2D context can't be got.
 */
export function grabVideoFrame(video: HTMLVideoElement): GrabbedFrame {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) {
    throw new Error('grabVideoFrame: the video has no frame yet — wait for the stream to start');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('grabVideoFrame: could not acquire 2D canvas context');
  }
  ctx.drawImage(video, 0, 0, width, height);
  return {
    frame: ctx.getImageData(0, 0, width, height),
    snapshotUrl: canvas.toDataURL('image/png'),
  };
}
