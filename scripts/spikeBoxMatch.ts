/**
 * De-risk spike v2 (Option A, Step 1+2): match real opponent crops against
 * pokesprite gen-8 BOX sprites using the full proposed pipeline —
 *   segment FG off the red panel -> largest connected component -> bbox-normalize
 *   (kills scale/position drift) -> combined HOG (shape) + masked colour grid.
 *
 *   npx vite-node scripts/spikeBoxMatch.ts            # vs the 6 truth sprites
 *   npx vite-node scripts/spikeBoxMatch.ts --pool     # vs all legal box sprites
 */
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { cropRegions } from '../src/lib/detection/cropRegions';
import type { RgbaImage } from '../src/lib/detection/hash';
import legality from '../src/data/championsLegality.json';
import { JASON_FRAME_PATH, JASON_GROUND_TRUTH, JASON_RECTS } from '../src/lib/detection/__tests__/fixtures/jasonTeam';

const POKESPRITE = 'https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular';
const SLUGS: Record<string, string> = {
  incineroar: 'incineroar', aerodactyl: 'aerodactyl', rotomwash: 'rotom-wash',
  garchomp: 'garchomp', excadrill: 'excadrill', tyranitar: 'tyranitar',
};

function loadPng(path: string): RgbaImage {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: png.data };
}
async function fetchSprite(slug: string): Promise<RgbaImage | null> {
  const res = await fetch(`${POKESPRITE}/${slug}.png`);
  if (!res.ok) return null;
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  return { width: png.width, height: png.height, data: png.data };
}

// ---- segmentation -----------------------------------------------------------
function borderBg(img: RgbaImage, ring = 4): [number, number, number] {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      if (x >= ring && x < img.width - ring && y >= ring && y < img.height - ring) continue;
      const i = (y * img.width + x) * 4;
      rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
    }
  const med = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}
const T = 55 * 55;
/** FG mask off the red panel, cleaned to the largest connected component. */
function cropMask(img: RgbaImage): Uint8Array {
  const { width: w, height: h } = img;
  const bg = borderBg(img);
  const raw = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const r = img.data[p * 4] - bg[0], g = img.data[p * 4 + 1] - bg[1], b = img.data[p * 4 + 2] - bg[2];
    raw[p] = r * r + g * g + b * b > T ? 1 : 0;
  }
  return largestComponent(raw, w, h);
}
function alphaMask(img: RgbaImage): Uint8Array {
  const m = new Uint8Array(img.width * img.height);
  for (let p = 0; p < m.length; p++) m[p] = img.data[p * 4 + 3] > 30 ? 1 : 0;
  return m;
}
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp: number[] = [];
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!; comp.push(p);
      const x = p % w, y = (p / w) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const n of nb) if (n >= 0 && mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
    }
    if (comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(w * h);
  for (const p of best) out[p] = 1;
  return out;
}

// ---- bbox-normalize into a fixed DESxDES masked RGBA (letterboxed) ----------
const DES = 32;
interface Norm { rgb: Float32Array; mask: Uint8Array } // DES*DES
function normalize(img: RgbaImage, mask: Uint8Array): Norm {
  const { width: w, height: h } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const scale = (DES - 2) / Math.max(bw, bh); // fit longest side, 1px pad, preserve aspect
  const ox = (DES - bw * scale) / 2, oy = (DES - bh * scale) / 2;
  const rgb = new Float32Array(DES * DES * 3);
  const m = new Uint8Array(DES * DES);
  for (let dy = 0; dy < DES; dy++) for (let dx = 0; dx < DES; dx++) {
    const sx = x0 + Math.floor((dx - ox) / scale), sy = y0 + Math.floor((dy - oy) / scale);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    const sp = sy * w + sx;
    if (!mask[sp]) continue;
    const di = (dy * DES + dx);
    rgb[di * 3] = img.data[sp * 4]; rgb[di * 3 + 1] = img.data[sp * 4 + 1]; rgb[di * 3 + 2] = img.data[sp * 4 + 2];
    m[di] = 1;
  }
  return { rgb, mask: m };
}

// ---- descriptor: HOG (shape) + coarse masked colour grid --------------------
const HCELL = 4, HBIN = 9, CCELL = 6;
function describe(n: Norm): Float32Array {
  const gray = new Float32Array(DES * DES);
  for (let i = 0; i < DES * DES; i++) gray[i] = n.mask[i] ? 0.299 * n.rgb[i * 3] + 0.587 * n.rgb[i * 3 + 1] + 0.114 * n.rgb[i * 3 + 2] : 0;
  // HOG
  const hog = new Float32Array(HCELL * HCELL * HBIN);
  const at = (x: number, y: number) => gray[Math.min(DES - 1, Math.max(0, y)) * DES + Math.min(DES - 1, Math.max(0, x))];
  const cellPx = DES / HCELL;
  for (let y = 0; y < DES; y++) for (let x = 0; x < DES; x++) {
    const gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
    const mag = Math.hypot(gx, gy);
    if (mag < 1e-3) continue;
    let ang = (Math.atan2(gy, gx) * 180) / Math.PI; if (ang < 0) ang += 180;
    const bin = Math.min(HBIN - 1, Math.floor((ang / 180) * HBIN));
    const cx = Math.min(HCELL - 1, Math.floor(x / cellPx)), cy = Math.min(HCELL - 1, Math.floor(y / cellPx));
    hog[(cy * HCELL + cx) * HBIN + bin] += mag;
  }
  for (let c = 0; c < HCELL * HCELL; c++) {
    let s = 0; for (let b = 0; b < HBIN; b++) s += hog[c * HBIN + b] ** 2;
    s = Math.sqrt(s) + 1e-6; for (let b = 0; b < HBIN; b++) hog[c * HBIN + b] /= s;
  }
  // colour grid: per CCELL cell mean RGB over FG + coverage
  const col = new Float32Array(CCELL * CCELL * 4);
  const cpx = DES / CCELL;
  for (let y = 0; y < DES; y++) for (let x = 0; x < DES; x++) {
    const cx = Math.min(CCELL - 1, Math.floor(x / cpx)), cy = Math.min(CCELL - 1, Math.floor(y / cpx));
    const ci = (cy * CCELL + cx) * 4, i = y * DES + x;
    if (n.mask[i]) { col[ci] += n.rgb[i * 3]; col[ci + 1] += n.rgb[i * 3 + 1]; col[ci + 2] += n.rgb[i * 3 + 2]; col[ci + 3] += 1; }
  }
  for (let c = 0; c < CCELL * CCELL; c++) {
    const cov = col[c * 4 + 3];
    if (cov > 0) { col[c * 4] /= cov * 255; col[c * 4 + 1] /= cov * 255; col[c * 4 + 2] /= cov * 255; }
    col[c * 4 + 3] = cov / (cpx * cpx); // coverage 0..1
  }
  // concat (weight colour vs hog when comparing happens in distance)
  return Float32Array.from([...hog, ...col]);
}
const HOGLEN = HCELL * HCELL * HBIN;
function dist(a: Float32Array, b: Float32Array): number {
  let hogDot = 0; for (let i = 0; i < HOGLEN; i++) hogDot += a[i] * b[i];
  const hogDist = 1 - hogDot / (HCELL * HCELL); // cells unit-norm
  let colDist = 0; for (let i = HOGLEN; i < a.length; i++) colDist += (a[i] - b[i]) ** 2;
  colDist = Math.sqrt(colDist / (CCELL * CCELL));
  return 0.55 * hogDist + 0.45 * colDist;
}

async function main() {
  const usePool = process.argv.includes('--pool');
  const frame = loadPng(JASON_FRAME_PATH);
  const crops = cropRegions(frame, JASON_RECTS);

  let refIds: string[];
  if (usePool) refIds = (legality as any).entries.filter((e: any) => e.legal).map((e: any) => e.speciesId);
  else refIds = [...JASON_GROUND_TRUTH];

  const refs: { id: string; desc: Float32Array }[] = [];
  for (const id of refIds) {
    const slug = SLUGS[id] ?? id; // pool uses raw id as slug (rough; mapping is Step 4)
    const sprite = await fetchSprite(slug);
    if (!sprite) continue;
    refs.push({ id, desc: describe(normalize(sprite, alphaMask(sprite))) });
  }
  console.log(`refs: ${refs.length}${usePool ? ' (legal pool; unmapped slugs skipped)' : ''}`);

  let top1 = 0, top3 = 0;
  crops.forEach((crop, i) => {
    const truth = JASON_GROUND_TRUTH[i];
    const cd = describe(normalize(crop, cropMask(crop)));
    const ranked = refs.map((r) => ({ id: r.id, d: dist(cd, r.desc) })).sort((a, b) => a.d - b.d);
    const rank = ranked.findIndex((r) => r.id === truth) + 1;
    if (rank === 1) top1++; if (rank >= 1 && rank <= 3) top3++;
    console.log(`slot ${i + 1} truth=${truth}: rank #${rank || '—'}  top3=[${ranked.slice(0, 3).map((r) => `${r.id}:${r.d.toFixed(3)}`).join(', ')}]`);
  });
  console.log(`\ntop1: ${top1}/6, top3: ${top3}/6  (pool=${refs.length})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
