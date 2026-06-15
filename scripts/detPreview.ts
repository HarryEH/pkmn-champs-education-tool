/**
 * Throwaway dev tool: crop a rectangle out of a PNG and upscale it (nearest) so
 * small in-game icons can be eyeballed / ground-truthed. Not shipped, not tested.
 *
 *   npx vite-node scripts/detPreview.ts <pngPath> <x> <y> <w> <h> <scale> <outPath>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [, , pngPath, xs, ys, ws, hs, scs, outPath] = process.argv;
const [x, y, w, h, scale] = [xs, ys, ws, hs, scs].map((n) => parseInt(n, 10));

const src = PNG.sync.read(readFileSync(pngPath));
const out = new PNG({ width: w * scale, height: h * scale });
for (let oy = 0; oy < h * scale; oy++) {
  const sy = Math.min(src.height - 1, y + Math.floor(oy / scale));
  for (let ox = 0; ox < w * scale; ox++) {
    const sx = Math.min(src.width - 1, x + Math.floor(ox / scale));
    const si = (sy * src.width + sx) * 4;
    const di = (oy * out.width + ox) * 4;
    out.data[di] = src.data[si];
    out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2];
    out.data[di + 3] = 255;
  }
}
writeFileSync(outPath, PNG.sync.write(out));
console.log(`wrote ${outPath} (${w}x${h} @${scale}x from ${pngPath} src ${src.width}x${src.height})`);
