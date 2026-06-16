# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron + Vite + React + TypeScript desktop app that assists with **Pokémon Champions VGC**
(`gen9championsvgc2026regma`, see `CURRENT_FORMAT` in `src/shared/types.ts`). Three flows:

- **Team Setup** — import a team via PokePaste/Showdown export, persisted to disk.
- **Detection** — drop a Nintendo Switch team-preview screenshot, CLIP image-embedding match the 6
  opponent icons, then show type matchups / speed tiers / damage calcs / common sets vs. your team.
- **In-Battle** — narrow Detection's output to the active 4v4 with field-state toggles (weather,
  Tailwind, Trick Room, Tera/Mega used, etc.) for live damage/speed recalculation.

The full design rationale, spec, and execution history live in `docs/` (read these for *why*,
not just *what*):
- `docs/2026-06-15-initial-spec.md` — original spec.
- `docs/2026-06-16-implementation-plan.md` — current architecture decisions + reality deltas from
  the spec (read this first when something seems to contradict the spec — the plan wins).
- `docs/2026-06-16-progress-report-1.md` — what's built vs. outstanding.

## Commands

```bash
npm start          # electron-forge start — runs the app (dev, with DevTools)
npm test           # vitest run — all unit tests
npm run typecheck  # tsc --noEmit
npm run lint       # eslint --ext .ts,.tsx .
npm run package    # electron-forge package
npm run make       # electron-forge make (platform installers)
```

Run a single test file or a filtered test:
```bash
npx vitest run src/lib/calc/__tests__/damageCalc.test.ts
npx vitest run -t "some test name"
```

Regenerate detection data (only when their inputs change, see "Detection data" below):
```bash
npx vite-node scripts/buildBoxEmbeddings.ts       # CLIP box-sprite reference embeddings (legal pool)
npx vite-node scripts/buildChampionsLegality.ts   # regulation-specific legal/banned table
npx vite-node scripts/buildChampionsLearnsets.ts  # regulation-specific learnset table (team legality)
npx vite-node scripts/buildChampionsOverrides.ts  # champions-mod per-species overrides (team legality)
npx vite-node scripts/buildJasonCropEmbeddings.ts # accuracy-harness crop-embedding fixture (after a table/preproc change)
```

## Architecture

### Process model

- **Main** (`src/main.ts`, `src/main/*`): window lifecycle, disk persistence
  (`src/main/ipc/persistence.ts`), the Smogon usage fetch + chaos normalization
  (`src/main/ipc/usage.ts` — here because the source has no CORS headers; see "Smogon usage data"),
  and macOS camera-permission prompting (`src/main/media.ts`). No Pokémon data or calc logic
  (no `gen`) runs here.
- **Preload** (`src/preload.ts`): exposes a typed `window.api` bridge via `contextBridge`. This is
  the *only* sanctioned IPC surface — never call `ipcRenderer.invoke('string')` directly elsewhere.
- **Renderer**: everything else — all `@pkmn`/`@smogon` calc, detection (canvas/image processing),
  and the React UI. Chosen so calc/detection have direct canvas + fetch access without IPC
  round-trips.

### Frozen cross-process contracts (`src/shared/`)

`types.ts` and `ipc.ts` are the domain/IPC contract every workstream was built against. Both are
marked **FROZEN** in code comments — widening them is a "broadcast" change, not a casual edit.
- `types.ts`: `MyTeam`/`MyPokemon` (the only persisted domain data), `OpponentTeam`/`OpponentSlot`
  (in-memory, detection output), `FieldState`/`BattleSession` (in-memory), `Settings`,
  `UsageData`, `CURRENT_FORMAT`.
- `ipc.ts`: `IPC` channel-name constants + the `Api` interface implemented by preload/main —
  `teams.*`, `settings.*`, `usage.*` (disk cache for Smogon stats), `media.requestCamera`.

### The `gen` singleton (`src/lib/calc/gen.ts`)

All Pokémon data and damage calc flows through one singleton:
```ts
export const gens = new Generations(Dex);
export const gen = gens.get(9);
export { calculate, Pokemon, Move, Field }; // re-exported from @smogon/calc
```
**Gotcha**: `@smogon/calc@0.11` has no `exports` map, so the documented `@smogon/calc/adaptable`
path doesn't resolve under Vite/TS bundler resolution. The real path is
`@smogon/calc/dist/adaptable`, and `gen.ts` is the *only* place that imports it — every other
module imports `calculate`/`Pokemon`/`Move`/`Field` from `lib/calc/gen`, never from
`@smogon/calc` directly.

### State (Zustand, `src/renderer/store/`)

- `teams.ts` — persisted (write-through to `window.api.teams`). Owns PokePaste parsing
  (`parsePokepaste`, `createTeam`, `computeStat`) and the active-team selection.
- `settings.ts` — persisted (write-through to `window.api.settings`). Capture device id,
  calibration rects, theme mode.
- `session.ts` — in-memory only, reset on "New Battle"/restart: detected `OpponentTeam`,
  `FieldState`, active-four selections.
- `nav.ts` — which of the three screens is active (no router; just an enum).

All three persisted stores hydrate from IPC on app boot (see `App.tsx`'s `useEffect`).

### Detection pipeline — CLIP box-embedding nearest-neighbour (`src/lib/detection/`, `src/data/`)

Opponent identification is CLIP image-embedding nearest-neighbour (R7; replaced the broken
blockhash pipeline, which scored 0/6 on real Switch frames — see the `detection-approach` memo):

1. `imageSource.ts` (dropped screenshot) → `RgbaImage` (`image.ts` owns the shared type). The
   pipeline is source-agnostic, so a future live-capture path can feed the same `RgbaImage`.
2. `cropRegions.ts` slices it into 6 crops using normalized `NormalizedRect[]` (calibration).
3. `segment.ts::segmentToWhite` removes the red opponent-panel background (the **primary**
   preprocessing — it lifts the real-frame score 4/6→5/6; without it the red bg dominates the
   embedding).
4. `embedder.ts::embedCrop` lazily runs CLIP ViT-B/32 (`@huggingface/transformers`,
   `Xenova/clip-vit-base-patch32`, downloaded on first run + browser-cached for offline reuse)
   over `compositeOnWhite(crop)` → a raw 512-d vector. `embedPreproc.ts` owns the composite step
   (build/runtime parity via `PREPROC_VERSION`).
5. `iconMatcher.ts::matchEmbedding` mean-centers the crop vector with the table's stored pool
   mean, cosine-ranks it against the **legal-only** entries → top-N + confidence;
   `AUTO_ACCEPT_THRESHOLD` + `AUTO_ACCEPT_MARGIN` decide auto-confirm vs. manual override.
6. `detectionPipeline.ts::detectOpponentTeam` (async) wires 2–5 into an `OpponentTeam`.

`boxEmbeddings.ts` is the single source of truth for the table shape + centering/cosine math
(the role the old `hash.ts` played). The regression gate is `__tests__/detectionAccuracy.test.ts`
(asserts ≥5/6 top-1 on the real Jason frame, headless via precomputed crop embeddings).

The data files are **deliberately decoupled** because they change on different schedules:
- `src/data/boxEmbeddings.json` — **regulation-specific reference embeddings**. One raw 512-d
  CLIP vector per legal Champions base-forme (pokesprite gen-8 box sprites, with Showdown gen5
  fallback for gen-9 species that lack a box icon), plus the pool `mean`. Built by
  `scripts/buildBoxEmbeddings.ts`. Regenerate when the legal pool changes (regulation cutover) or
  the model/preprocessing changes — and rerun `buildJasonCropEmbeddings.ts` to refresh the harness
  fixture. Loaded/validated by `boxEmbeddings.ts` (asserts `model`/`preprocVersion` parity).
- `src/data/championsLegality.json` — **regulation-specific**. Maps each of those species ids to
  legal/banned status for the *current* Champions regulation (built by
  `scripts/buildChampionsLegality.ts`, which parses the live `champions` mod's
  `formats-data.ts` from `smogon/pokemon-showdown` via the TS compiler API — see
  `scripts/championsModParser.ts`). **Regenerate on every regulation cutover** (e.g. the
  2026-06-17 Reg M-A → M-B change) and update `CURRENT_FORMAT` in `src/shared/types.ts`.
  Lookup logic lives in `src/lib/detection/championsLegality.ts`.

The build scripts run via `vite-node` (Node context). `buildBoxEmbeddings.ts` and the runtime
`embedder.ts` use the **same** CLIP model + `compositeOnWhite` preprocessing so build-time and
run-time embeddings are comparable — a `model`/`preprocVersion` mismatch silently destroys
accuracy, hence the parity asserts.

### Team legality (`src/lib/legality/`)

Validates an imported team against the *current* Champions regulation (used non-blocking by Team
Setup — flags issues, never refuses an import). `teamLegality.ts` is the entry point; it checks
species/item/ability/move + learnset against two regulation-specific tables built offline:
`championsOverrides.json` (per-species `champions` mod overrides, `buildChampionsOverrides.ts`) and
`championsLearnsets.json` (legal moves per species, `buildChampionsLearnsets.ts`). Both build
scripts share `championsModParser.ts` (parses the live `champions` mod via the TS compiler API) and
`championsSpeciesPool.ts` (the shared base-species pool). **Regenerate on every regulation cutover**
alongside `championsLegality.json`. Distinct from `detection/championsLegality.ts`, which only
answers the narrower "is this *species* legal" question for the detection pool.

### Persistence

Hand-rolled JSON files in `app.getPath('userData')`, written via the main-process IPC handlers in
`src/main/ipc/persistence.ts` (`teams.json`, `settings.json`, `cache/usage-<format>-<month>.json`).
Chosen deliberately over `electron-store`. `OpponentTeam`/`BattleSession`/`FieldState`/detection
results are **never** persisted — renderer memory only, cleared on restart or "New Battle".

### Smogon usage data (`src/lib/smogon/usageData.ts`)

The network fetch runs in **main**, not the renderer: the Champions format is published on
`smogon.com/stats/<month>/chaos/<format>-<cutoff>.json(.gz)` but is **not** mirrored to the
CORS-enabled `data.pkmn.cc`, and `smogon.com` sends no CORS headers — so a renderer (Chromium)
`fetch` would be blocked. `src/main/ipc/usage.ts` (registered via `registerUsageFetchHandler`,
behind the `usage.fetch` IPC channel) HEAD-probes the latest month + rating cutoff (1760 high-ladder
first, walking back ≤12 months), downloads the gzip, gunzips it, and normalizes the *chaos* shape
(`{info, data}`, weighted **counts** under capitalized `Moves`/`Items`/`Tera Types`/`Spreads` keys)
into our `UsageData` — dividing each count by the species' weighted set total (NOT `Raw count`, which
is the much larger unweighted battle count), sorting, capping, and dropping the uniform `nothing`
Tera entry (**Champions has Mega Evolution but no Terastallization**). It read-through caches via the
same `cache/usage-<format>-<month>.json` files the persistence handlers use, and never throws
(degrades to cache, then empty `UsageData`).

The renderer-side `fetchUsage(format, {refresh})` (`src/lib/smogon/usageData.ts`) is now a thin
`window.api.usage.fetch` caller plus a cosmetic pass that prettifies the Showdown ids main returns
(`fakeout` → "Fake Out") via `gen` — done renderer-side because main stays free of Pokémon data, and
the names round-trip cleanly through `@smogon/calc`. **Main is no longer "no network": it owns this
one external fetch + structural normalization; it still holds no Pokémon/calc data (no `gen`).**

### When does a fetch belong in main? (the IPC-vs-renderer rule)

The load-bearing distinction is **`fetch()` of bytes from a host that does NOT send CORS
headers** — that, and only that, must move to **main** behind the typed `window.api` bridge,
because a renderer (Chromium) `fetch` would be blocked. The Smogon usage fetch is the canonical
example and the migration template. Everything else that *looks* like external I/O is fine in the
renderer:

- **`<img>` / CSS `background: url(...)` of a remote asset** is a display load governed by
  `img-src`, **not** CORS/`connect-src` — never a `fetch`. The `@pkmn/img` sprites
  (`src/renderer/components/pokemonIcon.ts`, CSS background pointing at
  `play.pokemonshowdown.com`) stay in the renderer.
- **`fetch()` against a CORS-enabled host** is not blocked, so it can stay in the renderer. The
  CLIP model download (`embedder.ts`, transformers.js pulling from `huggingface.co`) is a real
  `fetch` of ~150 MB but HF serves CORS headers; it also runs *inference* per-crop in the
  renderer and must stay there per the process model.
- **Node-context `fetch` in `scripts/*`** (vite-node, build-time) has no CORS at all and is not a
  runtime concern; the rentime consumes the committed JSON artifacts as bundled imports.

When you DO migrate a non-CORS fetch into main, follow the usage pattern in dependency order:
**(1)** decide the split — network + dex-free *structural* shaping → main, anything touching
`gen`/calc stays renderer (this is why usage's id→name prettify stays in `usageData.ts`);
**(2)** widen the FROZEN `src/shared/ipc.ts` contract (append an `IPC` channel constant + an `Api`
method, additive only); **(3)** write `src/main/ipc/<name>.ts` as a pure, dependency-injectable
core (HEAD-probe → download → parse → normalize → read-through cache → never-throw) plus a
`register<Name>Handler()`, importing cache helpers from `persistence.ts`, never `gen`;
**(4)** wire it in `src/main.ts`'s top-level registration block; **(5)** add the thin
`ipcRenderer.invoke` wrapper in `src/preload.ts`; **(6)** slim the renderer module to a
lazy-bridge caller plus the dex-dependent cosmetic pass; **(7)** reuse `readJson`/`writeJson` + a
`*Path` helper from `persistence.ts` so cache files stay co-owned.

### Offline dev fixtures (`src/shared/fixtures.ts`)

`FIXTURE_MY_TEAM` (a full parsed 6-mon team) and `FIXTURE_OPPONENT_TEAM` (6 confirmed opponent
species) let UI/calc work proceed without running detection or having persisted data — used as
fallbacks throughout the Detection/In-Battle screens.

### File layout

```
src/
  main.ts, preload.ts, renderer.ts   # Forge entry points
  main/{ipc/persistence.ts, media.ts}
  renderer/
    App.tsx                          # left-nav shell, switches screens via store/nav
    screens/{TeamSetup,Detection,InBattle}/
    components/                      # PokemonCard, TypeMatchupGrid, SpeedTierList, DamageCalcTable
    ui/                               # design-system primitives (Button, Card, Tabs, Toggle, ...)
    theme/                            # tokens.css, types.ts (type→colour map), matchup.ts
    store/{teams,settings,session,nav}.ts
  lib/
    calc/{gen,damageCalc,speedTiers,typeMatchup,megaForme}.ts
    detection/{imageSource,image,cropRegions,segment,embedPreproc,embedder,boxEmbeddings,iconMatcher,detectionPipeline,championsLegality}.ts
    legality/{teamLegality,championsLearnsets,championsOverrides}.ts   # Team Setup import validation
    smogon/usageData.ts
  shared/{types,ipc,fixtures}.ts
  data/{boxEmbeddings.json, championsLegality.json, championsLearnsets.json, championsOverrides.json}
scripts/{buildBoxEmbeddings,buildJasonCropEmbeddings,buildChampionsLegality,buildChampionsLearnsets,buildChampionsOverrides,championsModParser,championsSpeciesPool}.ts
```

## Conventions

- Match the existing Prettier config (single quotes, semicolons, trailing commas, 100-char width)
  and run `npm run lint` before considering a change done.
- Functional React components + hooks only; routing is the `nav` Zustand store, not a router.
- Sprites/icons always via `@pkmn/img` — never bundle custom art.
- Type colours alone never encode meaning in the UI — pair with text/labels.
