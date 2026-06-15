# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron + Vite + React + TypeScript desktop app that assists with **Pokémon Champions VGC**
(`gen9championsvgc2026regma`, see `CURRENT_FORMAT` in `src/shared/types.ts`). Three flows:

- **Team Setup** — import a team via PokePaste/Showdown export, persisted to disk.
- **Detection** — drop a Nintendo Switch team-preview screenshot, perceptual-hash match the 6
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
npx vite-node scripts/buildIconHashes.ts          # regulation-independent icon hash table
npx vite-node scripts/buildChampionsLegality.ts   # regulation-specific legal/banned table
```

## Architecture

### Process model

- **Main** (`src/main.ts`, `src/main/*`): window lifecycle, disk persistence
  (`src/main/ipc/persistence.ts`), and macOS camera-permission prompting (`src/main/media.ts`).
  Nothing else — no Pokémon data or calc logic runs here.
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

### Detection pipeline — two-layer data architecture (`src/lib/detection/`, `src/data/`)

Opponent identification is pure perceptual-hash nearest-neighbor (no ML/OCR):

1. `imageSource.ts` (dropped screenshot) / `frameCapture.ts` (live capture) → `RgbaImage`.
2. `cropRegions.ts` slices it into 6 icons using normalized `NormalizedRect[]` (calibration).
3. `iconMatcher.ts` hashes each crop (`hash.ts`, blockhash) and finds top-N nearest entries in
   `src/data/iconHashes.json` → confidence scores; `AUTO_ACCEPT_THRESHOLD` decides auto-confirm
   vs. manual override.
4. `detectionPipeline.ts::detectOpponentTeam` wires 1–3 into an `OpponentTeam`.

The data files are **deliberately decoupled** because they change on different schedules:
- `src/data/iconHashes.json` — **regulation-independent**. Every real National Dex species'
  icon hash (built by `scripts/buildIconHashes.ts` from `@pkmn/dex` + the Showdown icon sheet).
  Only regenerate if `@pkmn/dex`'s base species data changes.
- `src/data/championsLegality.json` — **regulation-specific**. Maps each of those species ids to
  legal/banned status for the *current* Champions regulation (built by
  `scripts/buildChampionsLegality.ts`, which parses the live `champions` mod's
  `formats-data.ts` from `smogon/pokemon-showdown` via the TS compiler API — see
  `scripts/championsFormatsParser.ts`). **Regenerate on every regulation cutover** (e.g. the
  2026-06-17 Reg M-A → M-B change) and update `CURRENT_FORMAT` in `src/shared/types.ts`.
  Lookup logic lives in `src/lib/detection/championsLegality.ts`.

Both build scripts run via `vite-node` (Node context, not the renderer).

### Persistence

Hand-rolled JSON files in `app.getPath('userData')`, written via the main-process IPC handlers in
`src/main/ipc/persistence.ts` (`teams.json`, `settings.json`, `cache/usage-<format>-<month>.json`).
Chosen deliberately over `electron-store`. `OpponentTeam`/`BattleSession`/`FieldState`/detection
results are **never** persisted — renderer memory only, cleared on restart or "New Battle".

### Smogon usage data (`src/lib/smogon/usageData.ts`)

`fetchUsage(format, {refresh, now, fetchImpl})` fetches `https://data.pkmn.cc/stats/<format>.json`
directly from the renderer (native `fetch` works fine — no shim needed) and read-through caches
via `window.api.usage`. The endpoint serves "latest" only (not month-addressable); the month key
is used solely to partition the local disk cache. Offline/404 degrades to cached data or an
empty-but-valid `UsageData`, never throws.

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
    calc/{gen,damageCalc,speedTiers,typeMatchup}.ts
    detection/{frameCapture,imageSource,cropRegions,iconMatcher,hash,detectionPipeline,iconHashes,championsLegality}.ts
    smogon/usageData.ts
  shared/{types,ipc,fixtures}.ts
  data/{iconHashes.json, championsLegality.json}
scripts/{buildIconHashes,buildChampionsLegality,championsFormatsParser}.ts
```

## Conventions

- Match the existing Prettier config (single quotes, semicolons, trailing commas, 100-char width)
  and run `npm run lint` before considering a change done.
- Functional React components + hooks only; routing is the `nav` Zustand store, not a router.
- Sprites/icons always via `@pkmn/img` — never bundle custom art.
- Type colours alone never encode meaning in the UI — pair with text/labels.
