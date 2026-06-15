# Pokémon Champions Battle Assistant — Implementation Plan

> Companion to [`2026-06-15-initial-spec.md`](./2026-06-15-initial-spec.md). The spec defines
> _what_ to build; this document defines _how_ to build it, in what order, and **how to split
> the work across a team of parallel subagents** without merge conflicts or blocked hand-offs.

> **🟢 Execution status (2026-06-16):** **Phase 0 (Foundation) and Wave 1 (M1) are
> COMPLETE** — see [`2026-06-16-progress-report-1.md`](./2026-06-16-progress-report-1.md)
> for the full snapshot. Whole-repo health: `tsc` clean · 67/67 tests pass · 0 lint
> errors · renderer builds. **Remaining: Wave 2 (WS-E), Wave 3 (WS-F), Wave 4 (polish).**
> Completed items below are marked **✅ DONE**; reality discoveries are folded in inline.
>
> **🟢 R5 follow-up spike DONE (2026-06-15):** `gen.species`-based enumeration was
> found to be the wrong base entirely (missing legal species like Lopunny, and not
> a superset once Mega Evolution is in play). Resolved via a **decoupled two-layer
> architecture** — see §5 WS-D and §7. `iconHashes.json` regenerated (852 → 1259,
> now regulation-independent); new `championsLegality.json` (regulation-specific,
> 253/1285 legal under Reg M-A) added.
>
> **🟢 R6 follow-up spike DONE (2026-06-15):** Team Setup legality extended beyond
> species to **items, abilities, moves, and per-species learnsets** under Champions
> Reg M-A. New regulation-specific data (`championsOverrides.json`,
> `championsLearnsets.json`), lookups in `lib/legality/*`, wired non-blocking into
> `parsePokepaste`. See §5 WS-C and §7 R6.
>
> **🟡 Detection re-scoped (2026-06-15):** WS-E (Wave 2) now ships a
> **screenshot-drop detection path first** (E1a), before live capture-device input
> (E1b) — see §5 WS-E and §7 risk-spike R3 note. Risk-spike memos previously in
> `docs/spikes/` have been folded into this plan (§7) and removed.
>
> **🔴 Detection matcher REWORKED (2026-06-15, R7) — supersedes WS-D's matching layer:**
> the original **perceptual-hash** approach (blockhash of crops vs the Showdown icon
> sheet) was validated against a **real Switch team-preview frame** and scored **0/6
> top-1 and 0/6 top-3** (true species ranked #58–#774). Three compounding causes: wrong
> art domain (Showdown menu sprites vs Nintendo box-icon renders), the red opponent-panel
> background contaminating the hash, and no legal-only candidate filtering. **Replaced by
> CLIP image-embedding nearest-neighbour against pokesprite box sprites** → **5/6 top-1**
> on the same frame. The model is **downloaded on first run** (cached, not bundled). The
> crop→`OpponentTeam` contract and the manual-override UI are unchanged. Full design in
> §5 WS-D and §7 R7.

---

## 1. Current state vs. spec assumptions (read this first)

The spec assumed an `electron-vite` template. The repo is actually **Electron Forge + `@electron-forge/plugin-vite`**, which changes a few structural things. Agents must code against _reality_, not the spec's assumed layout.

> **✅ All Phase-0 actions in this table are DONE.** Notable outcomes: TS bumped to
> **5.4.5**; React **19** + `@vitejs/plugin-react@4` (v6 needs Vite 8, Forge is on
> Vite 5); persistence is **hand-rolled JSON via IPC** (chosen over `electron-store`);
> `@smogon/calc@0.11` has **no `exports` map**, so the entry path is
> `@smogon/calc/dist/adaptable`, not `@smogon/calc/adaptable` (see §2).

| Area | Spec assumed | Repo reality | Action |
| --- | --- | --- | --- |
| Scaffold | `electron-vite` | `electron-forge` 7.11 + `plugin-vite` | Keep Forge; adapt file layout (below) |
| Entry points | `src/main/index.ts`, `src/renderer/App.tsx` | `src/main.ts`, `src/renderer.ts`, `src/preload.ts` | Keep these as the **entry** files; nest feature code under them |
| Renderer | React | Vanilla TS, `index.html` → `renderer.ts` | **Add React** (Phase 0) |
| State | Zustand | none | **Add Zustand** (Phase 0) |
| Domain libs | `@pkmn/*`, `@smogon/calc` | none installed | **Install** (Phase 0) |
| TypeScript | — | `4.5.5`, `module: commonjs`, no `jsx` | **Bump to TS 5.x**, add `jsx: react-jsx`; verify `@pkmn` typings |
| Persistence | `electron-store` or IPC JSON | none | Decide in Phase 0 (recommend hand-rolled JSON via IPC for control) |

### File layout we will actually use (Forge-compatible)

```
src/
  main.ts                     # Forge main entry (existing) — registers IPC, creates window
  preload.ts                  # Forge preload entry (existing) — exposes typed window.api bridge
  renderer.ts                 # Forge renderer entry (existing) — mounts React into #root
  main/
    ipc/persistence.ts        # team/settings/cache read-write handlers
    media.ts                  # askForMediaAccess('camera') etc.
  renderer/
    App.tsx                   # screen router (Setup / Detection / Battle)
    screens/{TeamSetup,Detection,InBattle}/
    components/               # PokemonCard, TypeMatchupGrid, SpeedTierList, DamageCalcTable, FieldStateToggles
    ui/                       # design-system primitives (Button, Card, Tabs, Toggle, TypeBadge…)
    theme/                    # tokens.css, types.ts (type→colour map)
    store/{teams.ts,session.ts,settings.ts}
  lib/
    calc/{gen.ts,damageCalc.ts,speedTiers.ts,typeMatchup.ts}
    detection/{frameCapture.ts,imageSource.ts,cropRegions.ts,segment.ts,
               embedder.ts,iconMatcher.ts,boxEmbeddings.ts,detectionPipeline.ts,
               championsLegality.ts}
                                       # R7: embedder.ts (CLIP via transformers.js, lazy/first-run
                                       #   download), iconMatcher.ts (centered-cosine NN),
                                       #   boxEmbeddings.ts (ref-vector table + loader),
                                       #   segment.ts (red-panel FG extraction).
                                       #   REMOVED: hash.ts/iconHashes.ts (blockhash, R7).
    legality/{championsOverrides.ts,championsLearnsets.ts,teamLegality.ts}  # R6 — Team Setup legality
    smogon/usageData.ts
  shared/
    types.ts                  # the cross-process domain contract
    ipc.ts                    # IPC channel names + payload types (single source of truth)
    fixtures.ts               # mock team + mock opponent for offline/parallel dev
  data/
    boxEmbeddings.json        # R7 — regulation-independent — CLIP embedding per base-forme box sprite
                              #   (+ pool mean for centering, model id). Replaces iconHashes.json.
    championsLegality.json    # regulation-specific (R5) — Reg M-A legal/banned per species
    championsOverrides.json   # regulation-specific (R6) — banned/un-banned items, moves, abilities
    championsLearnsets.json   # regulation-specific (R6) — per-species champions movepools (prevo-merged)
scripts/
  buildBoxEmbeddings.ts       # R7 — maps legal base-forme species → pokesprite slugs, CLIP-embeds, centers
  buildChampionsLegality.ts
  buildChampionsOverrides.ts  # R6 — item/move/ability isNonstandard deltas
  buildChampionsLearnsets.ts  # R6 — per-species movepools (champions override + vanilla fallback)
  championsModParser.ts       # R6 — generic mod-table parser (handles string AND `null` literals)
  championsSpeciesPool.ts     # R6 — shared base species pool filter (was duplicated)
```

---

## 2. Architecture decisions (locked in Phase 0)

These are decided once so every agent shares the same assumptions.

- **UI framework**: React 18 + `@vitejs/plugin-react`. Functional components + hooks only.
- **Routing**: lightweight — a `screen` enum in a Zustand store, not React Router (3 screens, no URLs needed). `App.tsx` switches on it.
- **State**: Zustand. Three stores — `teams` (persisted-backed), `settings` (persisted-backed), `session` (in-memory, reset on "New Battle"/restart). Persisted stores hydrate from IPC on boot and write-through on change.
- **Process model**: renderer does all calc/detection (it has `@pkmn`/`@smogon` + canvas). Main process owns only: window lifecycle, disk persistence, media-access permission, and `@pkmn/smogon` network fetch (to keep `fetch`/CORS predictable). Communication via a **typed preload bridge** `window.api`.
- **IPC contract**: defined once in `src/shared/ipc.ts` (channel name constants + request/response types). Preload implements typed wrappers; main implements handlers. No raw `ipcRenderer.invoke('string')` anywhere else.
- **Persistence**: hand-rolled JSON files in `app.getPath('userData')` via IPC (`teams.json`, `settings.json`, `cache/usage-<format>-<month>.json`). Chosen over `electron-store` for explicit control and easy testing. (If an agent finds `electron-store` materially simpler, that's a Phase-0 callout, not a mid-stream change.)
- **Calc entry**: always the adaptable build, driven by the single `gen` from `lib/calc/gen.ts`. **Reality:** `@smogon/calc@0.11` ships no `exports` map, so the documented `@smogon/calc/adaptable` path does NOT resolve under Node/Vite/TS bundler resolution — the working path is **`@smogon/calc/dist/adaptable`**, imported _only_ in `gen.ts` and re-exported (`calculate`, `Pokemon`, `Move`, `Field`). No other `@smogon/calc` import path anywhere.

---

## 3. Parallelization strategy — contract-first fan-out

Multi-agent throughput lives or dies on two things: **frozen interfaces** and **disjoint file ownership**. The plan is therefore split into a sequential foundation that nobody can skip, then a wide parallel phase where each agent owns its own directories.

```
        ┌──────────────────────────────────────────────┐
        │ PHASE 0 — FOUNDATION (one agent, or me)        │
        │ deps · React · types.ts · ipc.ts · gen.ts ·    │  ← BLOCKS EVERYTHING
        │ theme tokens · ui primitive stubs · app shell ·│
        │ store stubs · fixtures.ts                      │
        └──────────────────────────────────────────────┘
                 │ (contracts frozen)
   ┌─────────────┼───────────────┬──────────────┬──────────────┐
   ▼             ▼               ▼              ▼              ▼
┌──────┐   ┌──────────┐   ┌───────────┐  ┌───────────┐  ┌──────────┐
│ WS-A │   │  WS-B    │   │   WS-C    │  │   WS-D    │  │  WS-G    │
│ calc │   │ smogon   │   │ TeamSetup │  │ detection │  │ design   │
│engine│   │ usage    │   │ (Flow A)  │  │ pipeline  │  │ system   │
└──────┘   └──────────┘   └───────────┘  └───────────┘  └──────────┘
   │             │                              │
   └──────┬──────┘                              │
          ▼                                     ▼
     ┌──────────────────┐              (D feeds E's detect step,
     │  WS-E Detection  │               but E builds on fixtures first)
     │  screen (Flow B) │◄─────────────────────────────────┘
     └──────────────────┘
          │
          ▼
     ┌──────────────────┐
     │  WS-F In-Battle  │  (reuses WS-A calc + dashboard components from WS-E)
     │  screen (Flow C) │
     └──────────────────┘
```

**The decoupling trick**: `src/shared/fixtures.ts` ships a hardcoded valid `MyTeam` and a hardcoded `OpponentTeam` (6 confirmed species). Every UI/calc agent develops against fixtures, so WS-C/E/F do **not** wait for WS-D (detection) to exist. This mirrors the spec's own build order (step 3 uses a hardcoded opponent before step 4 wires detection).

### Ownership map (no two agents write the same file)

| WS | Agent owns (write) | Reads / depends on (no write) |
| --- | --- | --- |
| **0 Foundation** | configs, entries, `shared/*`, `gen.ts`, `theme/*`, `ui/*` stubs, store stubs, `App.tsx` shell | — |
| **A Calc** | `lib/calc/{damageCalc,speedTiers,typeMatchup}.ts` + their tests | `gen.ts`, `shared/types.ts` |
| **B Smogon** | `lib/smogon/usageData.ts`, `main/ipc` cache handler + channel | `shared/{types,ipc}.ts`, `gen.ts` |
| **C TeamSetup** | `screens/TeamSetup/*`, `components/PokemonCard.tsx`, `store/teams.ts`, persistence IPC handler | types, gen, ui, theme |
| **D Detection lib** | `lib/detection/*`, `scripts/{buildIconHashes,buildChampionsLegality,championsModParser}.ts`, `data/{iconHashes,championsLegality}.json` | types, `@pkmn/img`, `@pkmn/dex` |
| **C+ Legality (R6)** | `lib/legality/*`, `scripts/{buildChampionsOverrides,buildChampionsLearnsets,championsModParser,championsSpeciesPool}.ts`, `data/{championsOverrides,championsLearnsets}.json` | `gen.ts`, `championsLegality.ts`, types |
| **E Detection screen** | `screens/Detection/*`, `components/{TypeMatchupGrid,SpeedTierList,DamageCalcTable}.tsx`, `store/settings.ts` (capture/calibration parts) | A, B, D, fixtures, ui, theme |
| **F InBattle** | `screens/InBattle/*`, `components/FieldStateToggles.tsx`, `store/session.ts` | A, ui, theme, reuses E's dashboard components |
| **G Design system** | fills out `ui/*` primitives + `theme/*` beyond Phase-0 stubs | theme tokens only |
| **R Risk spikes** | ✅ done — findings folded into §7 below (no separate memo files) | everything (read) |

> Shared-component risk: `components/{TypeMatchupGrid,SpeedTierList,DamageCalcTable}` are authored by **E** and consumed by **F**. To avoid a write-collision, **E owns the files; F consumes them**. If F needs a prop F adds it via a documented PR hand-off, not a parallel edit. The `ui/` primitives are owned by **G**, but Phase 0 ships **typed stubs** so E/F/C can import them immediately.

---

## 4. Phase 0 — Foundation (sequential, blocks everything) — ✅ DONE

Done as one focused pass before fanning out. Definition of done met: the React app shell with three navigable screens is themed and runs; `npm run lint`/typecheck pass. All 12 steps below are complete. Two reality notes folded in: the `usage:*` cache **handlers were implemented here in Phase 0** (so WS-B only needed the renderer-side fetch lib), and a small `store/nav.ts` was added for the screen-enum routing.

1. **Dependencies.** Add and pin:
   - runtime: `react`, `react-dom`, `zustand`, `@pkmn/dex`, `@pkmn/data`, `@pkmn/sets`, `@pkmn/img`, `@pkmn/smogon`, `@smogon/calc`, `blockhash-core` (or chosen pHash lib).
   - dev: `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, bump `typescript` → `^5.4`.
2. **Build config.** Add React plugin to `vite.renderer.config.ts`; set `tsconfig` `jsx: "react-jsx"`, `module: "ESNext"` for renderer side, `skipLibCheck` stays on. Verify `@pkmn` packages resolve under Forge's Vite (they're ESM — may need `optimizeDeps`/`ssr.noExternal` tweaks; capture any in a code comment).
3. **`src/shared/types.ts`** — transcribe the spec §2 types verbatim (`MyPokemon`, `MyTeam`, `OpponentSlot`, `OpponentTeam`, `FieldState`, `BattleSession`). This is the contract; freeze it. Any change after fan-out is a broadcast event.
4. **`src/shared/ipc.ts`** — channel-name constants + request/response types for: `teams:load/save/delete`, `settings:load/save`, `usage:read/write/clear` (cache), `media:requestCamera`. Preload bridge type `Window['api']`.
5. **`src/lib/calc/gen.ts`** — the `Generations(Dex)` + `gen = gens.get(9)` singleton exactly as spec §1.
6. **`src/preload.ts`** — implement the typed `window.api` from the ipc contract (thin wrappers over `ipcRenderer.invoke`).
7. **`src/main.ts` + `src/main/ipc/persistence.ts`** — register handlers (read/write JSON in `userData`), call `askForMediaAccess('camera')` on macOS before window creation, widen window to a sensible default (e.g. 1280×800), keep DevTools in dev only.
8. **Theme tokens** — `src/renderer/theme/tokens.css` + `src/renderer/theme/types.ts` (see §6). Pokémon-coloured design system foundation.
9. **`ui/` primitive stubs** — `Button`, `Card`, `Tabs`, `Toggle`, `Select`, `TypeBadge`, `Stat` with real prop types but minimal styling (G fleshes out). This lets every UI agent import stable components on day one.
10. **`store/` stubs** — `teams.ts`, `settings.ts`, `session.ts` with typed Zustand stores + hydrate-from-IPC actions (bodies can be thin; C/E/F deepen their own).
11. **`renderer.ts` + `App.tsx`** — mount React, render the themed shell with a left nav switching the three screens (placeholder bodies).
12. **`src/shared/fixtures.ts`** — one valid PokePaste + parsed `MyTeam`, and a 6-mon confirmed `OpponentTeam`, for offline parallel dev.

---

## 5. Parallel workstreams (detailed)

Each is sized to ~one focused agent. Each lists deliverables, the interface it must honour, and its definition of done (DoD).

### WS-A — Calc engine (`lib/calc/`) — ✅ DONE (16 tests)
Pure, dependency-light, highly testable — ideal first parallel task.
- `typeMatchup.ts`: `getMatchup(attackType, defenderTypes) → multiplier`; `defensiveProfile(species) → Record<type, mult>`. Pure lookups from `gen.types`.
- `speedTiers.ts`: compute Speed stat from a set; produce a sorted tier list given an array of `{label, set|stat}`; apply modifiers (Tailwind ×2, Trick Room reverse, paralysis ×0.5, Choice Scarf ×1.5) as composable functions for Flow C reuse.
- `damageCalc.ts`: thin wrapper over `calculate()` from `@smogon/calc/adaptable` — `calcDamage(attacker, defender, move, field) → { minPct, maxPct, koChance, desc }`. Build `Pokemon`/`Move`/`Field` from our domain types.
- **DoD**: unit tests (against fixtures) for a known matchup, a known speed order, and a known damage roll matching Showdown's calculator within rounding.

### WS-B — Smogon usage data (`lib/smogon/`) — ✅ DONE (10 tests)
- `usageData.ts`: `fetchUsage(format, {refresh, now, fetchImpl})` → common sets/items/abilities/spreads/Tera/moves by usage %. Read-through cache via `window.api.usage` (the `usage:*` IPC handlers were **already built in Phase 0** — WS-B only owns the renderer fetch lib). `window` is lazy-accessed so the module imports cleanly under vitest's node env.
- **Reality (R4):** the upstream stats endpoint (`https://data.pkmn.cc/stats/<format>.json`) serves "latest", **not month-addressable** — the month key only keys our _disk_ cache. `gen9championsvgc2026regma` currently **404s** upstream (Reg M-A just arriving); offline/404 returns cached data or an empty-but-valid `UsageData`, never throws.
- **DoD met:** cache miss → fetch+write; second call → cache; refresh re-fetches; offline graceful (validated against a live `gen9vgc2024` report + mocked target format).

### WS-C — Team Setup screen (Flow A) — ✅ DONE (9 tests; +R6 legality, see §7)
- `screens/TeamSetup/`: textarea import → `split(/\n\s*\n/)` → `Sets.importSet` → validate vs `gen.species.get`. Error surfacing for illegal/typo species. Live preview parses on each keystroke.
- **R6 (new):** `parsePokepaste` now also runs full Champions Reg M-A legality (`lib/legality/teamLegality.ts::checkSetLegality`) over each resolved set — banned **species/item/ability/move** and **un-learnable moves** each surface as a non-blocking `ImportError` (the Pokémon stays in the gallery). Reuses the existing `ImportErrors` UI unchanged. See §7 R6.
- `components/PokemonCard.tsx`: icon via `@pkmn/img` `Icons.getPokemon` (returns a sprite-sheet `background-position` CSS string, parsed into a React style object), name/item/ability/Tera/nature/EVs, computed stats with **Speed highlighted** via `Stat` `emphasis`.
- `store/teams.ts`: deepened with `parsePokepaste`/`createTeam`/`computeStat` (pure, testable); CRUD over `MyTeam[]`, write-through to persistence IPC, "active team" selection. Store API kept stable.
- Team picker (dropdown); edit/delete/re-paste-to-update.
- **DoD met:** fixture paste → 6 cards with correct stats (Speed emphasised) → save → active/edit/delete; save path verified to call `window.api.teams.save` with the full `MyTeam[]` (app-restart persistence to be confirmed in manual `npm start` testing).

### WS-D — Detection pipeline (`lib/detection/` + script) — 🔴 MATCHER REWORKED (R7)
Independent of UI; ran fully in parallel. **The frame→crop→`OpponentTeam` scaffold and
the legality layer stand; the *matching layer* was replaced** — the original blockhash
approach scored **0/6** on a real Switch frame (see R7, §7). Status of the parts:

**✅ Standing (unchanged):**
- `frameCapture.ts` (video frame → `RgbaImage`), `imageSource.ts` (dropped PNG → `RgbaImage`),
  `cropRegions.ts` (apply `NormalizedRect[]` → 6 crops), `detectionPipeline.ts`
  (6 crops → `OpponentTeam` with top-3 candidates + auto-accept). The pipeline's
  source-agnostic `RgbaImage` + `NormalizedRect[]` signature is **frozen** — both the
  matcher swap and WS-E feed it unchanged.
- **R5 legality** — `scripts/buildChampionsLegality.ts` + `scripts/championsModParser.ts`
  parse the live `champions` mod's `formats-data.ts` (TS compiler API, no `eval`), merge
  onto the 1285-species base pool, derive Reg M-A legality → **`src/data/championsLegality.json`**
  (253/1285 legal). `isChampionsLegal` lookup in `lib/detection/championsLegality.ts`.
  Regulation-specific — regenerate on cutover (`npx vite-node scripts/buildChampionsLegality.ts`).

**🔴 Replaced (R7 — was blockhash, now CLIP embeddings):**
- **Reference art = pokesprite gen-8 BOX sprites**, not the Showdown icon sheet. Spiked
  empirically on a real frame: box sprites (same chibi ¾ pose as the in-game team-preview
  icon) beat pokemondb HOME front-renders **5/6 vs 3/6 top-1** — *closest pose* matters
  more than *newest/hi-fi*. Only **base formes** are needed: VGC team preview shows the
  base forme (Mega is an in-battle reveal), so the "no external sprite for Mega Floette /
  Champions-exclusive Megas" problem does **not** apply at detection time — those are
  handled by the In-Battle "Mega used" toggle.
- `scripts/buildBoxEmbeddings.ts` (build-time, Node): map each **legal base-forme** species
  → its pokesprite slug (via pokesprite's own `data/pokemon.json`, so regional formes /
  Rotom-Wash / Ogerpon masks / Tauros-Paldea resolve), fetch the box sprite, composite on
  white, embed with **CLIP ViT-B/32** (`@huggingface/transformers`,
  `Xenova/clip-vit-base-patch32`, image-feature-extraction, mean-pooled), **mean-center the
  pool** (removes CLIP anisotropy — without it one sprite wins everything), write
  **`src/data/boxEmbeddings.json`** (one centered vector per species + the pool mean +
  model id for parity). Regulation-**independent** — regenerate only when `@pkmn/dex` base
  species change, *not* on regulation cutover (legal-only filtering is applied at runtime).
- `embedder.ts` (renderer): lazily loads the **same** CLIP model via transformers.js /
  onnxruntime-web (WASM/WebGPU). **Downloaded on first run** and cached (transformers.js
  HF cache, persisted under `userData`); **not bundled** — first detection needs network
  once, thereafter offline. Build- and run-paths share the model id from `boxEmbeddings.json`
  so embeddings are comparable (the parity invariant the old `assertTableCompatible` guarded).
- `iconMatcher.ts` (rewritten): embed a crop → mean-center with the pool mean → **cosine
  nearest-neighbour** over the legal-filtered reference vectors → top-3 + confidence. Crop
  is embedded **raw** (raw beat segmented-on-white at pool scale); `segment.ts` (red-panel
  border-median bg + largest-connected-component FG) is retained for templating/diagnostics
  and as a fallback knob.
- `boxEmbeddings.ts`: table types + loader + the cosine/centering helpers (shared math, the
  build/run single source of truth — the role `hash.ts` used to play).

**Regression gate (NEW — the old pipeline had none):** `__tests__/detectionAccuracy.test.ts`
runs the real crop→match path over a committed real Switch frame
(`fixtures/teampreview-jason.png`, 1280×720, 6 confirmed species, hand-tuned rects) and
reports top-1/top-3. Baseline (blockhash) **0/6**; reworked target ratcheted up as it lands.

- **Dev/runtime deps:** `pngjs` + `@types/pngjs` (Node build scripts) and `typescript`
  (champions mod parser) stay Node-only. **NEW runtime dep `@huggingface/transformers`**
  (+ onnxruntime-web) ships in the renderer; the CLIP weights are fetched on first run.
- **REMOVED:** `hash.ts`, `iconHashes.ts`, `scripts/buildIconHashes.ts`, `blockhash-core`,
  and `src/data/iconHashes.json` (all blockhash-era).
- **DoD (revised):** drop a real Switch frame → all 6 slots resolve to the correct legal
  species at acceptable confidence, measured by the accuracy harness, with the model fetched
  on first run.

### WS-E — Detection screen (Flow B) — ⏭️ NEXT (Wave 2)
The largest UI surface; can be split into **E1 (capture/calibration/detect)** and **E2 (analysis dashboard)** if two agents are available. All dependencies (WS-A/B/D libs, WS-G primitives, fixtures) are ready.
> **Hand-off:** E **authors** `TypeMatchupGrid/SpeedTierList/DamageCalcTable`; F **consumes** them — so accept "my mons" + "opponent mons" as props (don't hard-code 6) to support F's active-4 filter. Consume `matchupTint` (WS-G) for grid cells, `buildSpeedTiers`/`calcDamage`/`typeMatchup` (WS-A), and `fetchUsage` (WS-B).

> **🟡 Re-sequenced (2026-06-15):** ship detection against a **dropped-in
> screenshot first** (no capture hardware required), then add the live capture
> device on top. `detectionPipeline.detectOpponentTeam` (WS-D) already takes a
> source-agnostic `RgbaImage` + `NormalizedRect[]` — both the screenshot path and
> the video path feed it the same shape, so the calibration UI, slot UI, and
> dashboard hand-off are shared and built once.

- **E1a — Screenshot-drop detect (build this first):**
  - New `lib/detection/imageSource.ts` (renderer, mirrors `frameCapture.ts`):
    `loadImageFromFile(file: File): Promise<RgbaImage>` — decode a dropped/
    selected image via `<img>`/`createImageBitmap` + offscreen canvas
    `getImageData`, same `RgbaImage` shape `captureVideoFrame` produces from
    video.
  - Drop-zone / file-picker in `screens/Detection/`. Once an image loads, reuse
    the one-time calibration UI (drag 6 rects, stored normalized in
    `store/settings.ts`) against the static image, then "Detect" →
    `detectionPipeline.detectOpponentTeam` (WS-D) → slot UI with confidence +
    override dropdowns; auto-accept high-confidence.
  - The target screenshot is a Nintendo Switch team-preview capture at a fixed,
    known resolution — pre-seed a default calibration rect set for that
    resolution so first-run needs little/no manual calibration (still
    user-adjustable).
  - **DoD**: drop a real Switch team-preview screenshot → "Detect" → all 6
    opponent slots populate with the correct species at acceptable confidence,
    with no capture device connected.
- **E1b — Live capture device (after E1a, when capture hardware is on hand):**
  - device enumeration + picker (persist `deviceId` in settings), `getUserMedia`
    → `<video>`, `frameCapture.captureVideoFrame` feeding the **same**
    `detectionPipeline` call and slot UI as E1a (R3 capture-device findings
    apply here — HD60X enumerates as a normal UVC `videoinput`, no
    `desktopCapturer` needed).
  - **DoD**: "Detect" on a paused live video frame populates the same slot UI as
    E1a.
- E2 (the dashboard, spec §4.3 — bulk of the UI): tabbed/accordion, one tab per opponent mon, each with:
  - `TypeMatchupGrid.tsx` (offensive/defensive vs your 6 — WS-A `typeMatchup`),
  - common sets from WS-B with manual "refresh data",
  - `SpeedTierList.tsx` (WS-A `speedTiers`, plausible spreads + your 6, sorted, flag out/under-speed),
  - `DamageCalcTable.tsx` (WS-A `damageCalc`, your moves vs common defensive spread and vice versa).
- **DoD**: against `fixtures.opponentTeam`, the full dashboard renders for all 6 (no detection needed); then swapping in E1a/E1b output populates the same dashboard.

### WS-F — In-Battle screen (Flow C) — ✅ DONE
- `screens/InBattle/index.tsx`: explicit **two-step on-field selection per side** — bring 4 (→ `myActiveFour` / `opponentActiveFour`), then mark who's *currently in* (→ `myOnField` / `opponentOnField`, capped at 2), updated live as switches happen. `screens/InBattle/battleBuild.ts` holds the pure combatant/speed builders.
- `components/FieldStateToggles.tsx`: weather / terrain / Trick Room / per-side Tailwind + screens (Reflect/Light Screen/Aurora Veil) → patches `FieldState` (convention: `attackerSide` = you, `defenderSide` = opponent; the their-moves table swaps sides).
- **Per-mon Mega + Tera toggles on both sides.** Champions revives Mega Evolution, so the user manually controls their *own* Megas too. Mega is wired through the calc engine: `lib/calc/megaForme.ts::resolveMegaForme(species, item)` maps a held stone to its forme via `gen.items.get(stone).megaStone`; `damageCalc`/`speedTiers` gained a `megaActivated` flag that rebuilds the calc `Pokemon`/Speed as the forme (stats/typing/ability follow). Your side's per-mon toggle state is in-memory-only on the session store (`myBattleState`) to avoid widening the FROZEN `types.ts`; the opponent reuses `OpponentSlot.megaActivated/teraActivated`.
- Opponent speed is shown as a **range** (0-EV neutral → max-invest via `speedTiers::speedBounds`) plus a Choice-Scarf "possibility" row, since their spread is unknown. Your mons use their exact set.
- On every toggle/selection: recompute speed order + both damage matrices (your moves vs their active; their common moves vs yours), restricted to the on-field sets, via WS-A `calcDamage`/`buildSpeedTiers` with a `Field` built from toggles.
- Large readable type for the "during the timer countdown" use case (theme `--font-battle` scale on mon names/results).
- **DoD met**: select on-field mons per side, flip Mega/Tera/weather/Tailwind/Trick Room → speed order and damage rolls update live and correctly (verified: Mega Charizard-Y damage > base; Mega Manectric rises / Mega Garchomp drops in the speed order).
- Deferred follow-ups: auto-suggesting a base+stone mon's Mega stats by default (vs the manual toggle); the opponent Mega toggle only appears when their *likely usage* item resolves a stone (a held stone outside top usage won't surface it yet).

### WS-G — Design system (`ui/` + `theme/`) — ✅ DONE
- Fleshed out Phase-0 stubs into a clean Pokémon-coloured library (§6). Real interaction states via `theme/ui.css` (`@import`-ed from `tokens.css`) using `.pk-*` classes layered over the existing inline-style call sites — public API unchanged (only additive optional props: `Card.interactive`, `Stat.tone`).
- Added `theme/matchup.ts` (`matchupTint(multiplier) → {bg, fg, label}`) for WS-E's matchup grid, and `ui/Gallery.tsx` (self-contained showcase, not yet wired into nav).
- **DoD met:** `Gallery` renders every primitive in light/battle modes with all 18 type badges, matchup tints, and speed-flag chips.

### WS-R — Risk spikes (research only) — ✅ DONE
Ran in parallel with Wave 1 (R1–R4) plus a Wave-1 follow-up (R5). Findings folded directly into the §7 table below; no separate memo files are kept.

---

## 6. Pokémon-themed UI — design system spec

Goal: **clean, modern, unmistakably Pokémon** — not cluttered fan-art. Think "official competitive tool": white/near-white canvas, Pokéball-red primary accents, the 18 type colours used _functionally_ (badges, matchup cells, speed flags), generous spacing, rounded cards, crisp Showdown sprites.

### Core palette (`theme/tokens.css`)
```css
:root {
  /* Pokéball brand */
  --poke-red:      #EE1515;   /* primary action / accent */
  --poke-red-dark: #C50E0E;   /* hover/active */
  --poke-black:    #1A1A1A;   /* the band / primary text */
  --poke-white:    #FFFFFF;
  --gold:          #B3A125;   /* league/champion accent, sparing */

  /* Neutral canvas (clean, slightly cool) */
  --bg:        #F7F8FA;
  --surface:   #FFFFFF;
  --surface-2: #EEF1F5;
  --border:    #DfE3E8;
  --text:      #1A1A1A;
  --text-mut:  #5B6470;

  /* Status */
  --ok:   #2E9E5B;  /* outspeed / favourable */
  --warn: #E8A33D;  /* speed-tie / neutral risk */
  --bad:  #D64545;  /* outsped / unfavourable */

  --radius: 12px;
  --radius-sm: 8px;
  --shadow: 0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.06);
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-battle: clamp(18px, 2.2vw, 28px); /* Flow C readability */
}

/* Battle / dark mode for Flow C (optional toggle) */
[data-mode='battle'] {
  --bg: #14161A; --surface: #1E2127; --surface-2:#262A31;
  --border:#333842; --text:#F2F4F7; --text-mut:#9AA4B2;
}
```

### Official type colours (`theme/types.ts`)
Used for `TypeBadge`, matchup-grid cells, and speed-tier flags. Canonical hexes:
```ts
export const TYPE_COLORS: Record<string, string> = {
  Normal:'#A8A77A', Fire:'#EE8130', Water:'#6390F0', Electric:'#F7D02C',
  Grass:'#7AC74C', Ice:'#96D9D6', Fighting:'#C22E28', Poison:'#A33EA1',
  Ground:'#E2BF65', Flying:'#A98FF3', Psychic:'#F95587', Bug:'#A6B91A',
  Rock:'#B6A136', Ghost:'#735797', Dragon:'#6F35FC', Dark:'#705746',
  Steel:'#B7B7CE', Fairy:'#D685AD',
};
```

### Component & layout conventions
- **TypeBadge**: pill, type colour background, white text, subtle inner shadow. The single most-reused atom.
- **PokemonCard**: white surface, rounded `--radius`, sprite top-left, name + type badges, stat row with **Speed emphasised** (bold + coloured chip).
- **Matchup grid cells**: tint by multiplier using a fixed scale — `0×` grey, `¼/½×` green tints, `1×` plain, `2/4×` red tints — so threat reads at a glance.
- **Speed-tier list**: single vertical sorted list; your mons in red accent, opponent in neutral, `--ok/--bad` markers for outspeed/outsped; Trick Room flips with an animated reorder.
- **App chrome**: left nav with a small Pokéball glyph per screen; thin red top accent bar; Champion-format label (gold) in the header.
- **Density**: comfortable, not cramped. Flow C is the exception — bigger text, fewer chrome elements, dark `battle` mode default.
- **Sprites/icons**: UI display always via `@pkmn/img` (Showdown art). Never bundle our own.
  (Exception — *detection only*: matching references are pokesprite gen-8 **box** sprites,
  embedded at build time into `boxEmbeddings.json`; this is reference data for the matcher,
  not art rendered to the user. See WS-D / R7.)
- **Accessibility**: type colours alone never encode meaning — always pair with text/label (colour-blind safety, since several type colours collide).

---

## 7. Risk spikes (de-risk in parallel with Phase 0) — spec §9 — ✅ ALL RESOLVED

| ID | Risk | Outcome |
| --- | --- | --- |
| R1 | Champions data completeness in `@pkmn/dex` | `@pkmn/dex@0.10.10` confirmed. Returned **Mega formes missing under Gen 9** (present under Gen 7); Mega abilities present. `Dex.formats` is `undefined` (no legality query). Calc degrades gracefully — `dataExtensions.ts` **described but not needed to ship**. |
| R2 | Legal species pool for `gen9championsvgc2026regma` | ~~Filter chosen: `[...gen.species].filter(s => !s.battleOnly)` → 860 species / 852 unique icon cells. A superset is safe for recognition.~~ **Superseded by R5** — `gen.species` is Gen 9's SV-regional dex, not the Champions roster (missing legal species like Lopunny, no real Mega formes). R5 replaces the icon-pool filter and adds a separate regulation-legality table. |
| R3 | `getUserMedia` for Elgato HD60X (Electron renderer, macOS) | HD60X enumerates as a normal UVC `videoinput`; existing `askForMediaAccess('camera')` is **sufficient — no `desktopCapturer`**. WS-E gotchas: empty device labels pre-permission, black no-signal frames, variable geometry → normalized rects. **Note (2026-06-15):** this is now E1b (after the screenshot-drop path, E1a) — not blocking the first detection milestone. |
| R4 | `@pkmn/smogon` `fetch` availability in Electron | Renderer native `fetch` suffices — **no shim**. We fetch the format report directly (renderer-side); `window.api.usage` is the disk cache only. Stats endpoint is "latest", not month-addressable. |
| R5 | Champions Reg M-A legal species pool + regulation-cutover sync | `gen.species`-based enumeration (R2) doesn't match the Champions roster. Real source is `smogon/pokemon-showdown`'s live `data/mods/champions/formats-data.ts`, parsed via the TS compiler API (`scripts/championsModParser.ts`, formerly `championsFormatsParser.ts`) and merged onto `@pkmn/dex`'s ungated `Dex.species.all()` (1285 species). Derivation: `isNonstandard` override from champions → illegal; else effective tier `Illegal`/`CAP`/`Unreleased` → illegal; else `Mythical`/`Restricted Legendary` tags → illegal (Flat Rules banlist). Result: 253/1285 legal under Reg M-A → `src/data/championsLegality.json`. Introduces the **decoupled two-layer architecture**: `iconHashes.json` (regulation-independent, 1259 entries) for icon→species matching, `championsLegality.json` (regulation-specific) for the legality lookup. |
| R7 | **Opponent detection accuracy on real Switch frames** | The blockhash matcher (R5-era `iconHashes.json`) **failed on a real team-preview frame: 0/6 top-1 AND top-3** (true species ranked #58–#774). Causes: matching Showdown menu sprites against Nintendo box-icon renders (wrong art domain), the red opponent-panel background dominating the hash, and ranking against all 1259 species with no legal filter. Classical fixes (foreground segmentation + HOG/colour descriptors) only reached 1/6 even among 6 candidates. **Resolved with CLIP image embeddings + nearest-neighbour:** embed crops and **pokesprite gen-8 box sprites** (closest pose to the in-game icon; beat HOME front-renders 5/6 vs 3/6), **mean-center** to kill CLIP anisotropy, cosine-rank against the **legal-filtered** pool → **5/6 top-1** on the real frame. Model (`Xenova/clip-vit-base-patch32`) is **downloaded on first run** and cached, not bundled. Only **base-forme** sprites are needed (team preview shows base; Mega is in-battle) so Champions-exclusive Megas are not a detection-time coverage gap. New regression gate over a committed real frame (`detectionAccuracy.test.ts`). See WS-D. |
| R6 | Full Team Setup legality — items, abilities, moves, learnsets | R5 covered species only; Team Setup needs the rest. The `champions` mod also bans/un-bans **items, moves, abilities** (via `isNonstandard` overrides in `items.ts`/`moves.ts`/`abilities.ts` — e.g. Assault Vest/Booster Energy/Safety Goggles banned, Mega Stones un-banned) and re-cuts **learnsets** (`learnsets.ts` — "Champions" is its own game, so movepools differ from SV; e.g. Incineroar can't learn Knock Off). **Critical correctness point:** `isNonstandard: null` is an explicit *un-ban* and must round-trip distinctly from "field absent" — the generic `parseModOverrides` captures `null` literals (not just strings), and runtime merging uses `'isNonstandard' in override` presence checks, **never `??`** (`null ?? base` would silently re-ban). Items/moves/abilities are small **delta** tables (`championsOverrides.json`) combined at runtime with vanilla `gen.X.get()`; learnsets must be a **full baked** table (`championsLearnsets.json`, prevo-merged) because `gen.learnsets.get()` is async and `parsePokepaste` is sync. Lookups in `lib/legality/{championsOverrides,championsLearnsets,teamLegality}.ts`; wired non-blocking into `parsePokepaste`. |

> **⚠️ Release-checklist carry-over:** the **2026-06-17 Reg M-A → M-B cutover** (tomorrow,
> relative to this plan) means the regulation-specific tables must be **regenerated** —
> `championsLegality.json` (`npx vite-node scripts/buildChampionsLegality.ts`),
> **plus R6's `championsOverrides.json` (`scripts/buildChampionsOverrides.ts`) and
> `championsLearnsets.json` (`scripts/buildChampionsLearnsets.ts`)** — and `fetchUsage`
> re-pointed once `gen9championsvgc2026regmb` stats publish upstream. Per R5's decoupled
> architecture, the detection reference table (**`boxEmbeddings.json`**, R7 — formerly
> `iconHashes.json`) does **not** need regeneration for this cutover — it's
> regulation-independent (legal-only filtering happens at runtime) and only needs rebuilding
> if `@pkmn/dex`'s base species data changes.

---

## 8. Sequencing & milestones

Mirrors the spec's build order (§10), re-expressed as agent waves.

- **M0 — Foundation (sequential).** ✅ **DONE.** Phase 0 complete; app shell runs themed; contracts frozen. WS-R spikes all resolved.
- **M1 — Calc + Setup (parallel wave 1).** ✅ **DONE.** WS-A, WS-B, WS-C, WS-G, WS-D delivered (49 tests). Validated `@pkmn/sets` + persistence + calc against real data; Team Setup is end-to-end usable.
- **M2 — Static dashboard + screenshot detection (parallel wave 2).** ⏭️ **NEXT.**
  WS-E E2 (dashboard) against `FIXTURE_OPPONENT_TEAM`, consuming A/B/G (spec step
  3 — hardcoded opponent). In parallel, WS-E E1a wires the **screenshot-drop**
  path (`lib/detection/imageSource.ts` + drop-zone + calibration) to WS-D's
  `detectionPipeline`, replacing the fixture once an image is dropped — no
  capture hardware needed.
- **M3 — Live capture detection.** WS-E E1b adds `getUserMedia` + device picker,
  feeding the same `detectionPipeline` call as E1a via `frameCapture`. Spec step
  4.
- **M4 — In-Battle.** WS-F builds Flow C reusing A's calc/speed modules + E's dashboard components with the active-4 filter and `Field` modifiers. Spec step 5.
- **M5 — Polish & integration.** WS-G final pass, battle-mode theme toggle, mount `Gallery` behind a dev route, end-to-end run-through, README/run docs, post-cutover data regeneration.

### Dependency quick-reference
- Everything → **Phase 0 contracts**.
- WS-E → WS-A, WS-B (hard for dashboard), WS-D (E1a screenshot detect and E1b
  live detect both depend on WS-D's `detectionPipeline`; fixtures unblock E2
  earlier). E1b additionally depends on R3 (capture device).
- WS-F → WS-A (hard), WS-E components (reuse).
- WS-D → R1/R5 spikes; **matching layer → R7** (CLIP embeddings + box sprites, first-run model download).

---

## 9. Cross-cutting conventions (every agent follows)

- **Never** widen `shared/types.ts` or `shared/ipc.ts` unilaterally mid-stream — propose, broadcast, then change. These are the contract.
- One workstream = its owned directories only (see §3 table). Touching another WS's files = hand-off, not parallel edit.
- All Pokémon data flows through the single `gen` singleton; all calcs through `@smogon/calc/adaptable`; all sprites through `@pkmn/img`.
- Match the repo's Prettier/ESLint config; run `npm run lint` before declaring DoD.
- Develop against `shared/fixtures.ts` until your real data source lands.
- Persist **only** `teams` and `settings` (+ usage cache). `OpponentTeam`/`BattleSession`/`FieldState` are in-memory, reset on "New Battle"/restart (spec §6).
- macOS-first (Elgato + `askForMediaAccess`); keep platform-specific code in `main/media.ts`.

---

## 10. Suggested agent roster (if launching subagents)

| Agent | Workstream(s) | Status | Why grouped |
| --- | --- | --- | --- |
| 1 | Phase 0 foundation | ✅ done | Must be one coherent pass; everyone depends on it. |
| 2 | WS-A calc + WS-R(R1) | ✅ done | Calc accuracy and the data-completeness spike are intertwined. |
| 3 | WS-B smogon + WS-R(R4) | ✅ done | Usage fetch and the fetch-in-Electron spike are intertwined. |
| 4 | WS-C Team Setup | ✅ done | Self-contained Flow A vertical slice. |
| 5 | WS-D detection + WS-R(R2/R5,R3) | ✅ done | Pipeline, legality enumeration, and capture access all cluster here. |
| 6 | WS-E detection screen (E1a+E2, then E1b) | ⏭️ next | Largest UI; split E1a/E2 into two agents if available, E1b as a follow-on once capture hardware is on hand. |
| 7 | WS-F in-battle | ⏳ after E | Starts after A + E components exist. |
| 8 | WS-G design system | ✅ done | Parallel throughout; owns visual consistency. |

> If running fewer agents, collapse in this order: G into Phase 0 + screen agents; F after E; B into E. The hard floor is: **Phase 0 first, alone.**
>
> **Resume point:** Phase 0 + agents 2/3/4/5/8 are complete. Launch **agent 6
> (WS-E E1a screenshot-drop detect + E2 dashboard)** as 1–2 subagents next — no
> capture hardware required. E1b (live capture device) and **agent 7 (WS-F)**
> follow, then M5 polish.
