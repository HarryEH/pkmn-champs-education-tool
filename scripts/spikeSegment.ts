/**
 * Spike: can we segment the Pokémon off the red opponent panel? Dumps each crop
 * with estimated background painted green, so foreground extraction is eyeballable
 * (Incineroar = red-on-red is the worst case).
 *   npx vite-node scripts/spikeSegment.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { cropRegions } from '../src/lib/detection/cropRegions';
import type { RgbaImage } from '../src/lib/detection/hash';
import { JASON_FRAME_PATH, JASON_GROUND_TRUTH, JASON_RECTS } from '../src/lib/detection/__tests__/fixtures/jasonTeam';

function loadPng(path: string): RgbaImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: png.data };
}

/** Median colour of the border ring (panel background estimate). */
function borderBg(img: RgbaImage, ring = 4): [number, number, number] {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (x >= ring && x < img.width - ring && y >= ring && y < img.height - ring) continue;
      const i = (y * img.width + x) * 4;
      rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
    }
  }
  const med = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

function dist2(r: number, g: number, b: number, c: [number, number, number]): number {
  return (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
}

const T = 55 * 55; // colour distance^2 threshold from background

function main() {
  const frame = loadPng(JASON_FRAME_PATH);
  const crops = cropRegions(frame, JASON_RECTS);
  crops.forEach((crop, i) => {
    const bg = borderBg(crop);
    const out = new PNG({ width: crop.width, height: crop.height });
    let fg = 0;
    for (let p = 0; p < crop.width * crop.height; p++) {
      const r = crop.data[p * 4], g = crop.data[p * 4 + 1], b = crop.data[p * 4 + 2];
      const isFg = dist2(r, g, b, bg) > T;
      if (isFg) fg++;
      out.data[p * 4] = isFg ? r : 0;
      out.data[p * 4 + 1] = isFg ? g : 255;
      out.data[p * 4 + 2] = isFg ? b : 0;
      out.data[p * 4 + 3] = 255;
    }
    // upscale 4x for viewing
    const sc = 4;
    const up = new PNG({ width: crop.width * sc, height: crop.height * sc });
    for (let y = 0; y < up.height; y++)
      for (let x = 0; x < up.width; x++) {
        const si = (Math.floor(y / sc) * crop.width + Math.floor(x / sc)) * 4;
        const di = (y * up.width + x) * 4;
        up.data[di] = out.data[si]; up.data[di + 1] = out.data[si + 1];
        up.data[di + 2] = out.data[si + 2]; up.data[di + 3] = 255;
      }
    writeFileSync(`/tmp/seg_${i + 1}.png`, PNG.sync.write(up));
    console.log(`slot ${i + 1} ${JASON_GROUND_TRUTH[i]}: bg=${bg.map(Math.round)} fg=${((fg / (crop.width * crop.height)) * 100).toFixed(0)}%`);
  });
}
main();
