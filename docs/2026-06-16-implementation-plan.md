# Pokémon Champions Battle Assistant — Implementation Plan

> Companion to [`2026-06-15-initial-spec.md`](./2026-06-15-initial-spec.md). The spec defines
> _what_ to build; this document defines _how_ to build it, in what order, and **how to split
> the work across a team of parallel subagents** without merge conflicts or blocked hand-offs.

---

## 1. Current state vs. spec assumptions (read this first)

The spec assumed an `electron-vite` template. The repo is actually **Electron Forge + `@electron-forge/plugin-vite`**, which changes a few structural things. Agents must code against _reality_, not the spec's assumed layout.

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
    detection/{frameCapture.ts,cropRegions.ts,iconMatcher.ts,detectionPipeline.ts}
    smogon/usageData.ts
  shared/
    types.ts                  # the cross-process domain contract
    ipc.ts                    # IPC channel names + payload types (single source of truth)
    fixtures.ts               # mock team + mock opponent for offline/parallel dev
  data/
    iconHashes.json
scripts/
  buildIconHashes.ts
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
- **Calc entry**: always `@smogon/calc/adaptable`, driven by the single `gen` from `lib/calc/gen.ts`. No other `@smogon/calc` import path anywhere.

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
| **D Detection lib** | `lib/detection/*`, `scripts/buildIconHashes.ts`, `data/iconHashes.json` | types, `@pkmn/img` |
| **E Detection screen** | `screens/Detection/*`, `components/{TypeMatchupGrid,SpeedTierList,DamageCalcTable}.tsx`, `store/settings.ts` (capture/calibration parts) | A, B, D, fixtures, ui, theme |
| **F InBattle** | `screens/InBattle/*`, `components/FieldStateToggles.tsx`, `store/session.ts` | A, ui, theme, reuses E's dashboard components |
| **G Design system** | fills out `ui/*` primitives + `theme/*` beyond Phase-0 stubs | theme tokens only |
| **R Risk spikes** | `docs/spikes/*.md` only (research, no app code) | everything (read) |

> Shared-component risk: `components/{TypeMatchupGrid,SpeedTierList,DamageCalcTable}` are authored by **E** and consumed by **F**. To avoid a write-collision, **E owns the files; F consumes them**. If F needs a prop F adds it via a documented PR hand-off, not a parallel edit. The `ui/` primitives are owned by **G**, but Phase 0 ships **typed stubs** so E/F/C can import them immediately.

---

## 4. Phase 0 — Foundation (sequential, blocks everything)

Do this as one focused pass (me, or a single agent) before fanning out. Definition of done: `npm start` opens a window showing the React app shell with three navigable (empty) screens, themed, and `npm run lint`/typecheck pass.

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

### WS-A — Calc engine (`lib/calc/`)
Pure, dependency-light, highly testable — ideal first parallel task.
- `typeMatchup.ts`: `getMatchup(attackType, defenderTypes) → multiplier`; `defensiveProfile(species) → Record<type, mult>`. Pure lookups from `gen.types`.
- `speedTiers.ts`: compute Speed stat from a set; produce a sorted tier list given an array of `{label, set|stat}`; apply modifiers (Tailwind ×2, Trick Room reverse, paralysis ×0.5, Choice Scarf ×1.5) as composable functions for Flow C reuse.
- `damageCalc.ts`: thin wrapper over `calculate()` from `@smogon/calc/adaptable` — `calcDamage(attacker, defender, move, field) → { minPct, maxPct, koChance, desc }`. Build `Pokemon`/`Move`/`Field` from our domain types.
- **DoD**: unit tests (against fixtures) for a known matchup, a known speed order, and a known damage roll matching Showdown's calculator within rounding.

### WS-B — Smogon usage data (`lib/smogon/` + cache IPC)
- `usageData.ts`: `Smogon` init with the renderer/main `fetch`; `fetchUsage(format) → common sets/items/abilities/spreads/Tera/moves by usage %`. Read-through cache: ask main for `cache/usage-<format>-<month>.json`; if miss/stale or manual refresh, fetch + write-back via IPC.
- Adds the `usage:*` cache handler in `main/ipc` (coordinate channel names with Phase-0 `ipc.ts`).
- **DoD**: `fetchUsage('gen9championsvgc2026regma')` returns parsed data, persists to disk, and second call serves from cache; a "refresh" path re-fetches. Handle network-absent gracefully (return cached or empty + flag).

### WS-C — Team Setup screen (Flow A)
- `screens/TeamSetup/`: textarea import → `split(/\n\s*\n/)` → `Sets.importSet` → validate vs `gen.species.get`. Error surfacing for illegal/typo species.
- `components/PokemonCard.tsx`: icon via `@pkmn/img` `Icons.get`, name/item/ability/Tera/nature/EVs, computed stats with **Speed highlighted**.
- `store/teams.ts`: CRUD over `MyTeam[]`, write-through to persistence IPC, "active team" selection.
- Team picker (sidebar/dropdown); edit/delete/re-paste-to-update.
- **DoD**: paste fixture PokePaste → 6 cards render with correct stats → save with a name → reload app → team persists and is selectable as active.

### WS-D — Detection pipeline (`lib/detection/` + script)
Independent of UI; can run fully in parallel.
- `scripts/buildIconHashes.ts`: enumerate legal species for `gen9championsvgc2026regma` (see Risk R2), fetch each icon via `@pkmn/img`, pHash at 32×32, write `src/data/iconHashes.json`.
- `frameCapture.ts` (video frame → `ImageData`), `cropRegions.ts` (apply normalized 0–1 calibration rects), `iconMatcher.ts` (pHash a crop, Hamming-distance vs table, top-3 + confidence `1 - dist/maxBits`), `detectionPipeline.ts` (orchestrate 6 crops → `OpponentSlot.candidates`).
- Tunable auto-accept threshold constant.
- **DoD**: given a static test screenshot + hand-set calibration rects, pipeline returns correct top-1 species for all 6 slots above threshold. (Capture-device wiring belongs to WS-E.)

### WS-E — Detection screen (Flow B)
The largest UI surface; can be split into **E1 (capture/calibration/detect)** and **E2 (analysis dashboard)** if two agents are available.
- E1: device enumeration + picker (persist `deviceId` in settings), `getUserMedia` → `<video>`, one-time calibration UI (drag 6 rects on a paused frame, store normalized), "Detect" button → `detectionPipeline` → slot UI with confidence + override dropdowns; auto-accept high-confidence.
- E2 (the dashboard, spec §4.3 — bulk of the UI): tabbed/accordion, one tab per opponent mon, each with:
  - `TypeMatchupGrid.tsx` (offensive/defensive vs your 6 — WS-A `typeMatchup`),
  - common sets from WS-B with manual "refresh data",
  - `SpeedTierList.tsx` (WS-A `speedTiers`, plausible spreads + your 6, sorted, flag out/under-speed),
  - `DamageCalcTable.tsx` (WS-A `damageCalc`, your moves vs common defensive spread and vice versa).
- **DoD**: against `fixtures.opponentTeam`, the full dashboard renders for all 6 (no detection needed); then swapping in WS-D output populates the same dashboard.

### WS-F — In-Battle screen (Flow C)
- `screens/InBattle/`: lead-selection (pick 4 of 6 → `myActiveFour`; mark relevant opponent mons → `opponentActiveFour`).
- `components/FieldStateToggles.tsx`: weather/terrain/Tailwind-per-side/Trick Room/Choice-lock-per-mon/Tera+Mega-per-mon → feeds `FieldState` + `OpponentSlot` overrides.
- `store/session.ts`: in-memory `BattleSession`; "New Battle" reset.
- On every toggle: recompute speed order (8 mons, Trick Room/Tailwind/para/Scarf via WS-A modifiers) and damage matrix restricted to active 8 via WS-A `damageCalc` with a `Field` built from toggles.
- Large readable type for the "during the timer countdown" use case (theme `--font-battle` scale).
- **DoD**: select 4v4, flip weather/Tailwind/Trick Room → speed order and damage rolls update live and correctly.

### WS-G — Design system (`ui/` + `theme/`)
- Flesh out Phase-0 stubs into a clean, consistent Pokémon-coloured component library (§6). Owns visual polish so screen agents focus on logic.
- **DoD**: a `ui/Gallery` dev route (or Storybook-lite page) renders every primitive in light/battle modes; type badges show all 18 colours.

### WS-R — Risk spikes (research only, output to `docs/spikes/`)
Run **first / in parallel with Phase 0** so blockers surface early. One short memo per risk (§7).

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
- **Sprites/icons**: always via `@pkmn/img` (Showdown art). Never bundle our own.
- **Accessibility**: type colours alone never encode meaning — always pair with text/label (colour-blind safety, since several type colours collide).

---

## 7. Risk spikes (de-risk in parallel with Phase 0) — spec §9

| ID | Risk | Spike output |
| --- | --- | --- |
| R1 | Champions data completeness in `@pkmn/dex` (Mega abilities, returned Megas, format legality) | Confirm installed version; if gaps, design a single `lib/calc/dataExtensions.ts` patch module (isolated, removable). |
| R2 | Enumerating the legal species pool for `gen9championsvgc2026regma` (scopes `iconHashes.json`; regenerate at Reg M-A→M-B on **2026-06-17**) | Find cleanest `gen.species` filter; document the regenerate command. |
| R3 | `getUserMedia` for Elgato HD60X in Electron renderer on macOS | Verify `systemPreferences.askForMediaAccess('camera')` in main is sufficient; no `desktopCapturer`. |
| R4 | `@pkmn/smogon` `fetch` availability in Electron context | Confirm native `fetch`; else provide a minimal shim. Decide renderer-vs-main fetch (we chose main in §2). |

> R1 and R2 gate WS-D and accurate WS-A/B output, so prioritise them. **Note the 2026-06-17 Reg M-A → M-B cutover lands two days after planning** — `iconHashes.json` and any legality filters will need regeneration right after launch; bake the regenerate script into WS-D and flag it in the release checklist.

---

## 8. Sequencing & milestones

Mirrors the spec's build order (§10), re-expressed as agent waves.

- **M0 — Foundation (sequential).** Phase 0 complete; app shell runs themed; contracts frozen. _Plus_ WS-R spikes in flight.
- **M1 — Calc + Setup (parallel wave 1).** WS-A, WS-B, WS-C, WS-G, WS-D all start. Validates `@pkmn/sets` + persistence + calc against real data. This is the spec's steps 1–2 plus a head-start on 3.
- **M2 — Static dashboard (parallel wave 2).** WS-E (E2 dashboard) against `fixtures.opponentTeam`, consuming A/B. Spec step 3 — full analysis with a hardcoded opponent, detection skipped.
- **M3 — Detection live.** WS-E (E1) wires capture + calibration + Detect to WS-D, replacing the fixture. Spec step 4.
- **M4 — In-Battle.** WS-F builds Flow C reusing A's calc/speed modules + E's dashboard components with the active-4 filter and `Field` modifiers. Spec step 5.
- **M5 — Polish & integration.** WS-G final pass, battle-mode theme, end-to-end run-through, README/run docs.

### Dependency quick-reference
- Everything → **Phase 0 contracts**.
- WS-E → WS-A, WS-B (hard for dashboard), WS-D (only for live detect; fixtures unblock earlier).
- WS-F → WS-A (hard), WS-E components (reuse).
- WS-D → R1/R2 spikes.

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

| Agent | Workstream(s) | Why grouped |
| --- | --- | --- |
| 1 | Phase 0 foundation | Must be one coherent pass; everyone depends on it. |
| 2 | WS-A calc + WS-R(R1) | Calc accuracy and the data-completeness spike are intertwined. |
| 3 | WS-B smogon + WS-R(R4) | Usage fetch and the fetch-in-Electron spike are intertwined. |
| 4 | WS-C Team Setup | Self-contained Flow A vertical slice. |
| 5 | WS-D detection + WS-R(R2,R3) | Pipeline, legality enumeration, and capture access all cluster here. |
| 6 | WS-E detection screen (E1+E2) | Largest UI; split into two agents if available. |
| 7 | WS-F in-battle | Starts after A + E components exist. |
| 8 | WS-G design system | Parallel throughout; owns visual consistency. |

> If running fewer agents, collapse in this order: G into Phase 0 + screen agents; F after E; B into E. The hard floor is: **Phase 0 first, alone.**
