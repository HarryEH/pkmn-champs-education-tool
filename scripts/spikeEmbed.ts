/**
 * De-risk spike (Option B): match real opponent crops against reference sprites
 * using CLIP image embeddings (cosine NN). Tests:
 *   - reference art: pokemondb HOME renders (newest/highest fidelity)
 *   - crop variants: raw crop  vs  segmented foreground composited on white
 *
 *   npx vite-node scripts/spikeEmbed.ts          # vs the 6 truth sprites
 *   npx vite-node scripts/spikeEmbed.ts --pool   # vs all legal species (slow; cached)
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { pipeline, RawImage } from '@huggingface/transformers';
import { cropRegions } from '../src/lib/detection/cropRegions';
import type { RgbaImage } from '../src/lib/detection/hash';
import legality from '../src/data/championsLegality.json';
import { JASON_FRAME_PATH, JASON_GROUND_TRUTH, JASON_RECTS } from '../src/lib/detection/__tests__/fixtures/jasonTeam';

// Reference art sources to A/B: HOME front-renders (newest/hi-fi) vs pokesprite
// gen-8 BOX icons (same chibi pose as the in-game team-preview crop).
const SOURCES = [
  { name: 'home', base: 'https://img.pokemondb.net/sprites/home/normal' },
  { name: 'box', base: 'https://raw.githubusercontent.com/msikma/pokesprite/master/pokemon-gen8/regular' },
] as const;
const SLUGS: Record<string, string> = {
  incineroar: 'incineroar', aerodactyl: 'aerodactyl', rotomwash: 'rotom-wash',
  garchomp: 'garchomp', excadrill: 'excadrill', tyranitar: 'tyranitar',
};
const MODEL = 'Xenova/clip-vit-base-patch32';
const CACHE = 'scripts/.embedcache.json';

function loadPng(path: string): RgbaImage {
  const p = PNG.sync.read(readFileSync(path));
  return { width: p.width, height: p.height, data: p.data };
}
async function fetchPng(url: string): Promise<RgbaImage | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const p = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  return { width: p.width, height: p.height, data: p.data };
}

// --- segmentation (same as classical spike) ----------------------------------
function borderBg(img: RgbaImage, ring = 4): [number, number, number] {
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (x >= ring && x < img.width - ring && y >= ring && y < img.height - ring) continue;
    const i = (y * img.width + x) * 4; rs.push(img.data[i]); gs.push(img.data[i + 1]); bs.push(img.data[i + 2]);
  }
  const med = (a: number[]) => a.sort((m, n) => m - n)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}
function cropMask(img: RgbaImage): Uint8Array {
  const { width: w, height: h } = img, bg = borderBg(img), raw = new Uint8Array(w * h), T = 55 * 55;
  for (let p = 0; p < w * h; p++) {
    const r = img.data[p * 4] - bg[0], g = img.data[p * 4 + 1] - bg[1], b = img.data[p * 4 + 2] - bg[2];
    raw[p] = r * r + g * g + b * b > T ? 1 : 0;
  }
  const seen = new Uint8Array(w * h); let best: number[] = []; const st: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!raw[s] || seen[s]) continue; const comp: number[] = []; st.push(s); seen[s] = 1;
    while (st.length) { const p = st.pop()!; comp.push(p); const x = p % w, y = (p / w) | 0;
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
        if (n >= 0 && raw[n] && !seen[n]) { seen[n] = 1; st.push(n); } }
    if (comp.length > best.length) best = comp;
  }
  const out = new Uint8Array(w * h); for (const p of best) out[p] = 1; return out;
}

// --- to RGB RawImage on white (optionally masking to FG) ----------------------
function toRaw(img: RgbaImage, mask?: Uint8Array): RawImage {
  const { width: w, height: h } = img, data = new Uint8ClampedArray(w * h * 3);
  for (let p = 0; p < w * h; p++) {
    const a = img.data[p * 4 + 3] / 255;
    const fg = mask ? mask[p] === 1 : true;
    // alpha-blend over white; non-FG -> white
    const r = img.data[p * 4], g = img.data[p * 4 + 1], b = img.data[p * 4 + 2];
    data[p * 3] = fg ? r * a + 255 * (1 - a) : 255;
    data[p * 3 + 1] = fg ? g * a + 255 * (1 - a) : 255;
    data[p * 3 + 2] = fg ? b * a + 255 * (1 - a) : 255;
  }
  return new RawImage(data, w, h, 3);
}

function l2norm(v: number[]): number[] {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) + 1e-8; return v.map((x) => x / n);
}
/** Subtract the pool mean (removes CLIP's dominant common direction), then re-normalize. */
function center(v: number[], mean: number[]): number[] {
  return l2norm(v.map((x, i) => x - mean[i]));
}
function cos(a: number[], b: number[]): number {
  let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d;
}

async function main() {
  const usePool = process.argv.includes('--pool');
  const ext = await pipeline('image-feature-extraction', MODEL, { dtype: 'fp32' });
  const embed = async (raw: RawImage): Promise<number[]> => {
    const t = await ext(raw, { pooling: 'mean', normalize: true });
    return Array.from(t.data as Float32Array);
  };

  const frame = loadPng(JASON_FRAME_PATH);
  const crops = cropRegions(frame, JASON_RECTS);
  const cropEmb = await Promise.all(crops.map((c) => embed(toRaw(c)))); // raw won at pool scale

  const cache: Record<string, number[]> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const refIds = usePool
    ? (legality as any).entries.filter((e: any) => e.legal).map((e: any) => e.speciesId)
    : [...JASON_GROUND_TRUTH];

  for (const src of SOURCES) {
    const refs: { id: string; emb: number[] }[] = [];
    let fetched = 0;
    for (const id of refIds) {
      const slug = SLUGS[id] ?? id;
      const key = `${src.name}:${slug}`;
      if (!(key in cache)) {
        const sp = await fetchPng(`${src.base}/${slug}.png`);
        cache[key] = sp ? await embed(toRaw(sp)) : []; // [] memoizes a 404 so we don't refetch
        if (++fetched % 30 === 0) { writeFileSync(CACHE, JSON.stringify(cache)); console.log(`  [${src.name}] embedded ${fetched}...`); }
      }
      if (cache[key].length) refs.push({ id, emb: cache[key] });
    }
    writeFileSync(CACHE, JSON.stringify(cache));

    const mean = new Array(refs[0].emb.length).fill(0);
    for (const r of refs) for (let i = 0; i < mean.length; i++) mean[i] += r.emb[i] / refs.length;
    const refsC = refs.map((r) => ({ id: r.id, emb: center(r.emb, mean) }));

    let top1 = 0, top3 = 0; const lines: string[] = [];
    for (let i = 0; i < crops.length; i++) {
      const truth = JASON_GROUND_TRUTH[i];
      const ce = center(cropEmb[i], mean);
      const ranked = refsC.map((r) => ({ id: r.id, s: cos(ce, r.emb) })).sort((a, b) => b.s - a.s);
      const rank = ranked.findIndex((r) => r.id === truth) + 1;
      if (rank === 1) top1++; if (rank >= 1 && rank <= 3) top3++;
      lines.push(`  slot ${i + 1} truth=${truth}: #${rank || '—'}  top3=[${ranked.slice(0, 3).map((r) => `${r.id}:${r.s.toFixed(3)}`).join(', ')}]`);
    }
    console.log(`\n[${src.name}] top1 ${top1}/6, top3 ${top3}/6 (pool=${refs.length})\n${lines.join('\n')}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
