# Progress Report 1 — Foundation + Wave 1 complete

> Status snapshot after executing [`2026-06-16-implementation-plan.md`](./2026-06-16-implementation-plan.md)
> through **Phase 0 (Foundation)** and **Wave 1 (M1)**. Nothing has been committed —
> the working tree holds all the changes for local testing.
>
> **Integration health (whole repo, verified):** `tsc --noEmit` clean · `npm test`
> 67/67 passing (10 suites) · `npm run lint` 0 errors (6 non-null-assertion warnings
> in test files only) · `vite build` of the renderer succeeds.
>
> **Update (2026-06-15):** R5 follow-up spike implemented — see
> [§5 below](#5-update--r5-champions-legality-pool--decoupled-icon-table). Detection
> (Wave 2 / WS-E) re-sequenced to a screenshot-drop-first plan — see
> [§2 Wave 2](#wave-2-m2m3--ws-e-detection-screen-flow-b--the-largest-ui-surface)
> and the implementation plan §5/§7. Risk-spike memos previously under
> `docs/spikes/` have been folded into the implementation plan and removed.
>
> **Update (2026-06-15):** R6 follow-up spike implemented — full Team Setup
> legality (items, abilities, moves, learnsets) under Champions Reg M-A. See
> [§6 below](#6-update--r6-full-team-setup-legality-items-abilities-moves-learnsets).

---

## 1. What's done

### Phase 0 — Foundation (done by orchestrator, sequential)

The contracts everything else depends on are frozen and the app shell runs.

- **Dependencies installed & pinned.** Runtime: `react@19`, `react-dom@19`,
  `zustand@5`, `@pkmn/{dex,data,sets,img,smogon}`, `@smogon/calc@0.11`,
  `blockhash-core`. Dev: `@vitejs/plugin-react@4` (v6 needs Vite 8; Forge is on
  Vite 5 — pinned to the v4 line), `@types/react@19`, `@types/react-dom@19`,
  `typescript@5.4.5` (bumped from 4.5.5), `vitest@2`. WS-D added `pngjs` +
  `@types/pngjs` (dev-only, for the icon-hash build script).
- **Build config.** `vite.renderer.config.ts` now uses the React plugin and
  pre-bundles the `@pkmn`/`@smogon` ESM packages. `tsconfig.json` rewritten:
  `module/moduleResolution: ESNext/bundler`, `jsx: react-jsx`, `strict`, and
  `forge.env.d.ts` added to `include` (so the Vite globals resolve).
- **Frozen contracts:**
  - `src/shared/types.ts` — the domain model (spec §2) plus `Settings`,
    `UsageData`/`SpeciesUsage`/`UsageEntry`, `NormalizedRect`, `CURRENT_FORMAT`.
  - `src/shared/ipc.ts` — channel constants + the typed `window.api` bridge
    (`teams`, `settings`, `usage`, `media`).
  - `src/lib/calc/gen.ts` — the `gen` singleton. **Key gotcha discovered:**
    `@smogon/calc@0.11` ships no `exports` map, so the spec's
    `@smogon/calc/adaptable` path does NOT resolve. The real path is
    `@smogon/calc/dist/adaptable`, and it is imported **only** here and
    re-exported (`calculate`, `Pokemon`, `Move`, `Field`).
- **Main process.** `src/main.ts` (1280×800 window, DevTools dev-only, camera
  prompt on ready), `src/main/ipc/persistence.ts` (hand-rolled JSON in
  `userData`: `teams.json`, `settings.json`, `cache/usage-*.json`),
  `src/main/media.ts` (`askForMediaAccess('camera')` on macOS).
- **Preload.** `src/preload.ts` exposes the typed `window.api` over
  `contextBridge`.
- **Renderer shell.** `renderer.ts` mounts React; `App.tsx` is a themed
  left-nav shell switching three screens via a `nav` Zustand store; persisted
  stores hydrate from IPC on boot.
- **Theme + UI stubs + store stubs + fixtures** — all created so Wave 1 could
  fan out against stable imports. `src/shared/fixtures.ts` ships a parsed
  6-mon `FIXTURE_MY_TEAM` and a confirmed `FIXTURE_OPPONENT_TEAM` (the
  decoupling trick: UI/calc dev never blocked on detection).

### Wave 1 (M1) — 5 parallel subagents, disjoint directories

| WS | Result | Key files |
| --- | --- | --- |
| **A — Calc engine** | ✅ 16 tests | `lib/calc/{typeMatchup,speedTiers,damageCalc}.ts`. `getMatchup`, `defensiveProfile`; `calcSpeed`, `applySpeedModifiers` (composable Tailwind/Scarf/para/TR), `buildSpeedTiers`; `calcDamage` over `calculate()` with `FieldState`→`Field` mapping. |
| **B — Smogon usage** | ✅ 10 tests | `lib/smogon/usageData.ts`. `fetchUsage(format, {refresh,now,fetchImpl})` with read-through disk cache via `window.api.usage`, graceful offline/404. Fetches `https://data.pkmn.cc/stats/<format>.json`. |
| **C — Team Setup (Flow A)** | ✅ 9 tests | `screens/TeamSetup/`, `components/PokemonCard.tsx`, deepened `store/teams.ts` (`parsePokepaste`, `createTeam`, `computeStat`). PokePaste import → 6 cards (Speed emphasised) → save/active/edit/delete. |
| **D — Detection pipeline** | ✅ 14 tests (+9 R5) | `lib/detection/{hash,frameCapture,cropRegions,iconMatcher,detectionPipeline,iconHashes,championsLegality}.ts`, `scripts/{buildIconHashes,buildChampionsLegality,championsFormatsParser}.ts`, **`data/iconHashes.json` — 1259 species** (regulation-independent, R5) + **`data/championsLegality.json` — 253/1285 legal under Reg M-A** (256-bit blockhash, shared build/run hash core). |
| **G — Design system** | ✅ | Polished all 7 primitives with `theme/ui.css` (real hover/focus/active states), `theme/matchup.ts` (`matchupTint`), `ui/Gallery.tsx` showcase. Public API unchanged (additive props only). |

### Risk spikes (done, folded into the implementation plan)

- **R1** (calc data): `@pkmn/dex@0.10.10` confirmed. Returned **Mega formes are
  missing under Gen 9** (present under Gen 7); Mega abilities exist. `Dex.formats`
  is `undefined` — no format-legality query. Calc degrades gracefully; an
  isolated `dataExtensions.ts` is described but **not needed to ship**.
- **R2** (legal pool): ~~filter is `[...gen.species].filter(s => !s.battleOnly)`
  → 860 species (852 unique icon cells).~~ **Superseded by R5** (below) —
  `gen.species` is Gen 9's SV-regional dex, not the Champions roster.
- **R3** (capture): Elgato HD60X enumerates as a normal `videoinput`; the existing
  `askForMediaAccess('camera')` is sufficient — no `desktopCapturer`. Gotchas for
  WS-E noted (empty device labels pre-permission, black no-signal frames, variable
  geometry → normalized calibration rects). **Now scoped as E1b**, after the
  screenshot-drop detection path (E1a, §2 below).
- **R4** (fetch): Electron renderer native `fetch` satisfies `@pkmn/smogon`. The
  stats endpoint is "latest", not month-addressable — the month key only keys our
  **disk** cache. `gen9championsvgc2026regma` currently 404s upstream (Reg M-A just
  arriving); handled gracefully.

---

## 2. What's left — next waves

### Wave 2 (M2/M3) — WS-E Detection screen (Flow B) — **the largest UI surface**

Owns: `screens/Detection/*`, `components/{TypeMatchupGrid,SpeedTierList,DamageCalcTable}.tsx`,
`lib/detection/imageSource.ts` (new), and the capture/calibration parts of
`store/settings.ts`. Splittable into agents:

> **Re-sequenced (2026-06-15):** build detection against a **dropped-in
> screenshot first** (E1a) — no capture hardware needed — then add the live
> capture device (E1b) on top of the same pipeline. The target screenshot is a
> Nintendo Switch team-preview capture at a fixed, known resolution, so a
> default calibration can be pre-seeded for it.

- **E1a — screenshot-drop detect (build first):** new
  `lib/detection/imageSource.ts::loadImageFromFile(file): Promise<RgbaImage>`
  (decode a dropped/selected image via `<img>`/`createImageBitmap` + canvas
  `getImageData` — same `RgbaImage` shape `frameCapture.captureVideoFrame`
  produces from video). Drop-zone/file-picker in `screens/Detection/`,
  one-time calibration UI (drag 6 rects on the static image, store as
  `NormalizedRect[]`, pre-seeded defaults for the Switch screenshot
  resolution), "Detect" button → `detectionPipeline` (WS-D) → slot UI with
  confidence + override dropdowns, auto-accept above `AUTO_ACCEPT_THRESHOLD`.
  **DoD:** drop a real Switch team-preview screenshot → "Detect" → all 6
  opponent slots populate with the correct species, no capture device
  connected.
- **E1b — live capture device (after E1a):** device enumeration + picker
  (persist `deviceId` in settings), `getUserMedia` → `<video>`,
  `frameCapture.captureVideoFrame` feeding the **same** `detectionPipeline`
  call and slot UI as E1a (R3: HD60X enumerates as a normal `videoinput`, no
  `desktopCapturer`). **DoD:** "Detect" on a paused live frame populates the
  same slot UI as E1a.
- **E2 — analysis dashboard (spec §4.3, the bulk):** tabbed, one tab per opponent
  mon, each with `TypeMatchupGrid` (WS-A `typeMatchup` + `matchupTint` from WS-G),
  common sets (WS-B `fetchUsage` + manual refresh), `SpeedTierList` (WS-A
  `buildSpeedTiers`), `DamageCalcTable` (WS-A `calcDamage`).
  **DoD:** dashboard renders for all 6 of `FIXTURE_OPPONENT_TEAM` with no
  detection; then E1a/E1b output populates the same dashboard.
- **Dependencies:** WS-A, WS-B (hard for E2), WS-D (`detectionPipeline`, for
  E1a and E1b — fixtures unblock E2 first), WS-G primitives. E1b additionally
  depends on R3 (capture device). All ready.

> **Hand-off note:** E **authors** `TypeMatchupGrid/SpeedTierList/DamageCalcTable`;
> F **consumes** them. Keep their props general enough for the active-4 filter F
> needs (accept a list of "my" mons and "opponent" mons rather than hard-coding 6).

### Wave 3 (M4) — WS-F In-Battle screen (Flow C)

Owns: `screens/InBattle/*`, `components/FieldStateToggles.tsx`, deepens
`store/session.ts`.

- Lead selection (pick 4 of 6 → `myActiveFour`; mark opponent actives →
  `opponentActiveFour`), `FieldStateToggles` (weather/terrain/Tailwind-per-side/
  Trick Room/Choice-lock/Tera+Mega-per-mon) feeding `FieldState` + `OpponentSlot`
  overrides. On every toggle: recompute speed order (WS-A modifiers) + damage
  matrix restricted to the active 8 (WS-A `calcDamage` with `Field` from toggles).
  Large `--font-battle` type; battle (dark) mode.
- **DoD:** 4v4 selected, flip weather/Tailwind/Trick Room → speed order + rolls
  update live and correctly.
- **Dependencies:** WS-A (hard), reuses E's three dashboard components. Start after
  Wave 2.

### Wave 4 (M5) — Polish & integration (orchestrator or WS-G)

- Wire `Gallery` behind a dev route (optional). End-to-end run-through:
  `npm start` → import team → detect/fixture → dashboard → in-battle.
- Battle-mode theme toggle in chrome. README / run docs.
- **Pre-release:** regenerate `championsLegality.json` after the 2026-06-17
  Reg M-A→M-B cutover (`npx vite-node scripts/buildChampionsLegality.ts`);
  re-point `fetchUsage` once `gen9championsvgc2026regmb` stats publish.
  `iconHashes.json` does **not** need regeneration for this cutover (R5,
  regulation-independent).

---

## 3. How to test what exists right now

```bash
npm start          # launches the Electron app — themed 3-screen shell;
                   # Team Setup is fully functional (paste a team / "Load sample")
npm test           # 67 unit tests (calc, smogon cache, detection, champions legality, team import + R6 legality)
npm run typecheck  # tsc --noEmit, clean
npm run lint       # 0 errors
```

The **Team Setup** screen is end-to-end usable (import → cards → save → active →
edit/delete). **Detection** and **In-Battle** are still Phase-0 placeholders —
their logic libraries (calc, smogon, detection) are built and tested, but the
screens that wire them up are Wave 2 / Wave 3.

## 4. Resuming the build

Launch Wave 2 as 1–2 subagents for WS-E (E1a screenshot-drop detect + E2
dashboard), each constrained to its owned files, reading the frozen contracts +
WS-A/B/D public signatures + WS-G primitives. E1b (live capture device) follows
once capture hardware is available, then Wave 3 for WS-F. The ownership map in
plan §3 and the per-WS DoDs in §5 still apply unchanged. Contracts in
`src/shared/*` remain frozen — any change is a broadcast event.

---

## 5. Update — R5: Champions legality pool + decoupled icon table

A follow-up spike (R5) found that R2's
filter (`[...gen.species].filter(s => !s.battleOnly)`, Gen 9's SV-regional dex)
is **not** the Champions roster — it's missing legal-via-champions species
(e.g. Lopunny) and contains zero real Mega formes. The real source is the live
`champions` mod in `smogon/pokemon-showdown` (`data/mods/champions/
formats-data.ts`), which `@pkmn/dex`/`@pkmn/sim` don't ship.

**What changed:**

- **`scripts/buildIconHashes.ts`** now enumerates the icon pool from
  `Dex.species.all()` (ungated) filtered `num > 0 && !battleOnly &&
  isNonstandard ∈ {null, 'Past'}` — 1285 species → **`data/iconHashes.json`
  regenerated, 1259 unique icon cells** (was 852). This table is
  **regulation-independent**: regenerate only if `@pkmn/dex`'s base species
  data changes, not on regulation cutovers.
- **New `data/championsLegality.json`** (regulation-specific): `scripts/
  buildChampionsLegality.ts` fetches `champions/formats-data.ts` from
  `raw.githubusercontent.com/smogon/pokemon-showdown`, parses it with the
  TypeScript compiler API (`scripts/championsFormatsParser.ts`, no `eval`),
  and derives `{speciesId, name, legal, tier, isNonstandard}` for the same
  1285-species pool — **253/1285 legal under Reg M-A**. Regenerate on every
  regulation cutover: `npx vite-node scripts/buildChampionsLegality.ts`.
- **New `src/lib/detection/championsLegality.ts`** (runtime-safe, no
  `typescript` import): `deriveLegality`, `buildLegalityIndex`,
  `isChampionsLegal` — the second layer of the two-layer architecture. At
  query time: match a detected icon against `iconHashes.json` to get a
  `speciesId`, then look it up in `championsLegality.json` to flag a banned
  opponent Pokémon for the current regulation.
- **+11 tests** (8 for `deriveLegality`/`buildLegalityIndex`/`isChampionsLegal`,
  3 for `parseFormatsDataOverrides`) → suite total **49 → 60**, 10 suites.
- Full derivation rules, worked examples (Lopunny/Flutter Mane), and the
  Arceus-Bug `isNonstandard`-override edge case are documented in
  `championsLegality.ts`'s `deriveLegality` doc comment and the implementation
  plan's R5 risk-spike row (§7).

**Release-checklist impact:** the 2026-06-17 Reg M-A → M-B cutover now only
requires regenerating `championsLegality.json` (+ re-pointing `fetchUsage`).
`iconHashes.json` is unaffected by regulation changes going forward.

---

## 6. Update — R6: Full Team Setup legality (items, abilities, moves, learnsets)

R5 made the app aware of which **species** are legal. R6 extends that to the rest
of a set, so **Team Setup** validates an imported team the way the format actually
would: the `champions` mod doesn't just curate the species roster — it bans and
un-bans **items, moves, and abilities** (e.g. Assault Vest / Booster Energy /
Safety Goggles banned; Mega Stones un-banned), and it re-cuts **learnsets**
("Champions" is its own game, so movepools differ from Scarlet/Violet — e.g.
Incineroar genuinely cannot run Knock Off there).

**What changed:**

- **`scripts/championsModParser.ts`** (replaces `championsFormatsParser.ts`):
  a generic `parseModOverrides(source, exportName, fields)` over the TS compiler
  API, plus `parseModLearnsets`. **The critical fix:** it captures explicit
  `null` literals, not just strings. Champions uses `isNonstandard: null` to
  *un-ban* a past-gen item/ability — that must round-trip distinctly from "field
  absent" (which means "defer to vanilla"). Runtime merging uses
  `'isNonstandard' in override` presence checks, **never `??`** (`null ?? base`
  would silently re-ban the un-banned item).
- **New `data/championsOverrides.json`** (regulation-specific, ~27 KB): the
  item/move/ability `isNonstandard` **delta** over vanilla — 259 items, 217
  moves, 4 abilities. Built by `scripts/buildChampionsOverrides.ts`. Kept as a
  delta (not a full table) because `gen.{items,moves,abilities}.get()` is
  synchronous, so legality resolves at runtime as `override ?? vanilla`.
- **New `data/championsLearnsets.json`** (regulation-specific, ~1 MB): the full
  prevo-merged movepool for every species in the 1285-species pool. Built by
  `scripts/buildChampionsLearnsets.ts` (champions' own `learnsets.ts` where it
  lists a species, vanilla `@pkmn/data` learnset otherwise, unioned up the
  `prevo` chain). Baked at build time because `gen.learnsets.get()` is **async**
  and `parsePokepaste` must stay synchronous (it runs in the live-import preview).
- **New `src/lib/legality/`** (runtime, no `typescript` import):
  `championsOverrides.ts` (`isItemLegal`/`isMoveLegal`/`isAbilityLegal`),
  `championsLearnsets.ts` (`buildLearnsetIndex`/`canLearnMove`), and
  `teamLegality.ts::checkSetLegality(set, species)` — one synchronous entry
  point combining all five layers, with the data files imported and indexed
  once at module scope.
- **`store/teams.ts`**: `parsePokepaste` now appends a **non-blocking**
  `ImportError` per violation (banned species/item/ability/move, or un-learnable
  move). The Pokémon stays in the gallery; the existing `ImportErrors` UI
  surfaces the messages with **zero UI changes**.
- **`scripts/championsSpeciesPool.ts`**: the base-species filter (previously
  duplicated in `buildIconHashes.ts` and `buildChampionsLegality.ts`) factored
  into one shared helper now that three build scripts need it.
- **Fixtures fixed:** `FIXTURE_POKEPASTE` had several now-illegal picks (Choice
  Specs, Assault Vest, Safety Goggles, Tera Blast, Incineroar's Knock Off) —
  rebuilt with verified-legal items/moves so it parses with **0 errors** again.
- **+7 tests** (suite total **60 → 67**): 3 new parser tests (incl. the
  `null`-literal case) and 4 new `parsePokepaste` legality tests (banned
  species/item/move + un-learnable move, each asserting the Pokémon is kept).

**Release-checklist impact:** the Reg M-A → M-B cutover now also requires
regenerating `championsOverrides.json` (`scripts/buildChampionsOverrides.ts`)
and `championsLearnsets.json` (`scripts/buildChampionsLearnsets.ts`) alongside
`championsLegality.json`. All three are regulation-specific; `iconHashes.json`
remains regulation-independent.
