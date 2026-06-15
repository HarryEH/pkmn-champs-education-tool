# Pokémon Champions Battle Assistant — Implementation Spec

## 0. Context

Electron + Vite + TypeScript app (electron-vite template). Single language,
single process model where possible — no separate backend. The app has three
screens/flows that share a common data layer:

- **Flow A — Team Setup**: import your team via PokePaste, persist it.
- **Flow B — Detection / Pre-battle Analysis**: live video feed from an Elgato
  capture device, "Detect" button reads the opponent's team-preview screen,
  produces type matchups, speed tiers, damage calc ranges, and common sets.
- **Flow C — In-Battle View**: narrow Flow B's output down to the active 4v4,
  with field-state toggles (weather, Tailwind, Trick Room, Tera/Mega used,
  Choice lock, etc.) for live damage recalculation.

Format target: Pokémon Champions, currently `gen9championsvgc2026regma`
(Reg M-A → M-B from June 17, 2026). Generation 9 data model.

---

## 1. Core packages & how they fit together

```
@pkmn/dex         — static species/move/ability/item data, Dex.forFormat(...)
@pkmn/data        — Generations wrapper around @pkmn/dex, used by @smogon/calc
@pkmn/sets        — PokePaste / showdown set string <-> PokemonSet object
@pkmn/img         — Sprites/Icons helpers (icon URLs for species, items)
@smogon/calc      — calculate(), Pokemon, Move, Field (use the /adaptable entry)
@pkmn/smogon      — live usage stats, common sets, analyses (needs fetch)
```

Canonical wiring (this should live in `src/lib/calc/gen.ts` and be a singleton
used everywhere):

```ts
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import { calculate, Pokemon, Move, Field } from '@smogon/calc/adaptable';

export const gens = new Generations(Dex);
export const gen = gens.get(9);
```

Parsing a PokePaste team (one or more Showdown export-format sets separated by
blank lines):

```ts
import { Sets } from '@pkmn/sets';

const setBlocks = pokepasteText.trim().split(/\n\s*\n/);
const pokemonSets = setBlocks.map((block) => Sets.importSet(block));
```

Each `PokemonSet` gives you species, item, ability, level, shiny, Tera type,
nature, EVs, IVs, and moves — enough to construct `@smogon/calc` `Pokemon`
instances directly:

```ts
const attacker = new Pokemon(gen, set.species, {
  item: set.item,
  ability: set.ability,
  nature: set.nature,
  evs: set.evs,
  ivs: set.ivs,
  level: set.level,
  teraType: set.teraType,
});
```

`@pkmn/img` gives you icon/sprite URLs for displaying species in your own UI
**and** is the source material for building the opponent-detection reference
hash table (see §5).

---

## 2. Shared domain types (`src/shared/types.ts`)

```ts
interface MyPokemon {
  set: PokemonSet; // from @pkmn/sets
  speed: number; // computed stat at given level/EVs/nature
  types: string[];
}

interface MyTeam {
  id: string;
  name: string;
  pokepaste: string; // raw, for re-import/edit
  pokemon: MyPokemon[]; // parsed, 6 entries
}

interface OpponentSlot {
  speciesId: string | null; // null until detected/confirmed
  candidates: { speciesId: string; confidence: number }[]; // top-N hash matches
  // user-editable overrides once revealed in battle:
  item?: string;
  ability?: string;
  teraType?: string;
  teraActivated?: boolean;
  megaActivated?: boolean;
}

interface OpponentTeam {
  slots: OpponentSlot[]; // 6 entries after detection
  detectedAt: number;
}

interface FieldState {
  weather?: 'sun' | 'rain' | 'sand' | 'snow';
  terrain?: 'electric' | 'grassy' | 'misty' | 'psychic';
  attackerSide?: { tailwind?: boolean; trickRoom?: boolean /* ... */ };
  defenderSide?: { tailwind?: boolean; trickRoom?: boolean /* ... */ };
}

interface BattleSession {
  myTeam: MyTeam;
  myActiveFour: string[]; // species IDs of the 4 you brought
  opponent: OpponentTeam;
  opponentActiveFour: string[]; // species IDs currently relevant/on field
  field: FieldState;
}
```

`MyTeam` is the **only** thing persisted. `OpponentTeam`, `BattleSession`,
and `FieldState` are in-memory only and reset per session (per your earlier
requirement).

---

## 3. Flow A — Team Setup screen

**Purpose**: import, view, store, and select "active team" for the session.

- Textarea for pasting PokePaste/Showdown export text.
- On submit: split into per-mon blocks, `Sets.importSet` each, validate
  against `gen.species.get(...)` (catches typos/illegal species for the
  format).
- Render each parsed mon as a card:
  - icon via `@pkmn/img` `Icons.get(speciesId)`
  - name, item, ability, Tera type, nature, EV spread
  - computed stats (use `@pkmn/data`'s stat calculation helpers, or compute
    manually: `floor(((2*base + iv + floor(ev/4)) * level / 100 + 5) * natureMod)`)
  - highlight Speed stat specifically — this screen is also where you sanity
    check your own speed tiers
- "Save Team" → persisted via the store (see §6) with a user-given name.
- A team list/picker (sidebar or dropdown) to select which saved team is
  "active" — the active team flows into Flow B/C.
- Allow editing/deleting saved teams; allow re-pasting to update a team in
  place.

---

## 4. Flow B — Main / Detection screen

**Purpose**: live capture feed + one-shot opponent team detection + full
pre-battle analysis dashboard.

### 4.1 Video input

- `navigator.mediaDevices.enumerateDevices()` to list video inputs, let the
  user pick the Elgato capture device from a dropdown (persist the chosen
  `deviceId` as a setting, not part of `MyTeam` persistence — separate small
  settings store).
- `getUserMedia({ video: { deviceId } })` → render to a `<video>` element.
- A **calibration step** (one-time, persisted as settings): since capture
  resolution/aspect ratio can vary, let the user drag-position 6 rectangles
  over the opponent's team-preview icon row on a paused frame. Store these as
  normalized (0–1) coordinates so they scale to any capture resolution.

### 4.2 "Detect" button

1. Draw current video frame to an offscreen `<canvas>` → `ImageData`.
2. Crop the 6 calibrated regions.
3. Run icon-matching (§5) on each crop → `OpponentSlot.candidates`.
4. Populate `OpponentTeam.slots` with best guesses; UI shows each slot as
   "detected: Incineroar (94%)" with a dropdown to override if wrong.
5. Once all 6 are confirmed (auto-accept high-confidence, manual fix low-
   confidence), trigger the analysis pass below.

### 4.3 Analysis dashboard (per confirmed opponent mon, against your active

team)
For each of the 6 opponent species:

- **Type matchup grid**: offensive/defensive type multipliers vs each of your
  6 — pure lookup from `gen.types`, no calc needed.
- **Common sets / movesets**: pull from `@pkmn/smogon` for the current format
  (`gen9championsvgc2026regma`), cached locally (see §6) with a manual
  "refresh data" button since `@pkmn/smogon` needs network access. Show top
  items, abilities, EV spreads, Tera types, and moves by usage %.
- **Speed tiers**: for each _plausible_ spread (the common sets above — e.g.
  base, Choice Scarf, Tailwind-adjusted), compute the resulting Speed stat and
  place it on a single sorted list alongside your 6 mons' Speed stats. Sort
  high→low; flag your mons that outspeed/are outsped by each variant.
- **Damage calc matrix**: for each (your mon × move) vs (opponent, using the
  most common defensive spread) and vice versa, call `calculate()` from
  `@smogon/calc/adaptable` and show the % range. Don't try to compute every
  move — start with each mon's actual moves from their `PokemonSet`/detected
  common set.

This dashboard is the bulk of the UI complexity — consider a tabbed or
accordion layout, one tab per opponent mon, each tab containing the four
sub-sections above.

---

## 5. Opponent detection — icon hashing pipeline

**No ML/OCR needed for the opponent team** (icon-only team preview). Pure
perceptual-hash nearest-neighbor.

### 5.1 Reference table (build once, ship with app or generate on first run)

- Enumerate the legal species pool for the current regulation (from
  `gen.species` filtered by the format's `Tier`/legality data — flag as an
  open question in §8 if Champions legality isn't cleanly exposed yet).
- For each species, fetch its icon via `@pkmn/img` `Icons.get(speciesId).url`
  (Showdown's icon sprite sheet).
- Compute a perceptual hash (e.g. `blockhash-core` or similar pure-JS lib) of
  each icon at a normalized size (e.g. 32×32).
- Store `{ speciesId, hash }[]` as a JSON file checked into the repo
  (`src/data/iconHashes.json`). Regenerate via a small script
  (`scripts/buildIconHashes.ts`) whenever the legal pool changes (e.g. Reg
  M-A → M-B).

### 5.2 Matching at detect-time

- For each cropped region from the captured frame: resize to the same
  normalized size, compute its hash.
- Compute Hamming distance to every entry in `iconHashes.json`, return top 3
  by smallest distance as `candidates` with a confidence score (e.g.
  `1 - distance/maxBits`).
- Threshold for auto-accept vs. requiring manual confirmation — make this a
  tunable constant; surface low-confidence detections clearly in the UI.

### 5.3 Shinies / formes

Don't special-case — if the icon hash mismatches a shiny vs. regular icon, it
has zero effect on the rest of the pipeline (stats/types/moves unaffected).
Megas matter only insofar as the _held item_ (Mega Stone) determines whether
the mega-evolved forme's stats/typing/ability apply — this is a manual
override field (`megaActivated`) the user toggles once they see the Mega
Evolve animation in battle, not something detected from team preview.

---

## 6. Persistence

- Use `electron-store` (or hand-rolled JSON file in `app.getPath('userData')`
  via IPC) for exactly two things:
  1. `teams`: `MyTeam[]` — the only thing that must survive restarts.
  2. `settings`: `{ captureDeviceId, calibrationRegions, lastUsageDataFetch }`
     — small, persisted for convenience but not user "data" per se.
- `@pkmn/smogon` usage/sets data: cache the fetched JSON to disk
  (`userData/cache/usage-<format>-<month>.json`) with a manual refresh action.
  This avoids hitting the network every detect cycle and gives you offline
  capability for the dashboard once cached.
- Everything else (`OpponentTeam`, `BattleSession`, `FieldState`,
  detection results) lives in renderer memory (React state / Zustand store),
  cleared on app restart or an explicit "New Battle" action.

---

## 7. Flow C — In-Battle view

**Purpose**: narrow Flow B's full 6-vs-6 analysis to the active 4-vs-4, with
live field-state toggles.

- Lead-selection UI: pick 4 of your 6 (`myActiveFour`), and mark which of the
  6 detected opponent mons are currently relevant (`opponentActiveFour`) —
  updated as they switch in/out over the course of the battle.
- Field-state toggle panel: weather, terrain, Tailwind (each side), Trick
  Room, Choice-lock per mon, Tera/Mega activated per mon (feeds
  `OpponentSlot.teraActivated`/`megaActivated` and equivalent for your side).
- Recompute, on every toggle change:
  - Speed order for the current 8 mons (your 4 + their up-to-4), accounting
    for Trick Room (reverses order), Tailwind (×2 for that side), paralysis,
    Choice Scarf, etc. — all just modifiers to the same speed-stat values
    already computed in Flow B.
  - Damage calc matrix restricted to the active 8, re-run through
    `@smogon/calc/adaptable` `Field` object reflecting the current toggles
    (weather/terrain/screens/Tailwind map directly onto `Field`'s
    `attackerSide`/`defenderSide`/`weather`/`terrain` properties).
- This view should be the "during the timer countdown" screen — minimal
  clicks to update state, large readable text for speed order and key damage
  rolls.

---

## 8. Suggested file structure

```
src/
  main/                      # Electron main process
    index.ts
    ipc/persistence.ts       # team/settings read-write
  renderer/
    App.tsx                  # routes between Setup / Main / Battle
    screens/
      TeamSetup/
      Detection/
      InBattle/
    components/
      PokemonCard.tsx
      TypeMatchupGrid.tsx
      SpeedTierList.tsx
      DamageCalcTable.tsx
      FieldStateToggles.tsx
    lib/
      calc/
        gen.ts               # Generations/gen singleton
        damageCalc.ts         # wraps calculate()
        speedTiers.ts
      detection/
        frameCapture.ts
        cropRegions.ts
        iconMatcher.ts
        detectionPipeline.ts
      smogon/
        usageData.ts          # @pkmn/smogon fetch + disk cache
    store/
      teams.ts                # zustand/context for MyTeam[]
      session.ts              # zustand/context for BattleSession (in-memory)
  shared/
    types.ts
  data/
    iconHashes.json
scripts/
  buildIconHashes.ts
```

---

## 9. Open questions / risks to resolve early (flag to Claude Code)

1. **Champions data completeness in `@pkmn/dex`**: confirm the installed
   version includes Champions-era additions — new Mega abilities (Mega Sol,
   Dragonize, etc.), the returned Mega forms, and the
   `gen9championsvgc2026regma` format's legality data. If species/abilities
   are missing, you'll need a small local "data extensions" module that
   patches `gen.species`/`gen.abilities` before constructing
   `@smogon/calc` `Pokemon` objects — isolate this behind one module so it's
   easy to remove once upstream catches up.
2. **Legal species pool for icon hashing**: figure out the cleanest way to
   enumerate "all Pokémon legal in the current regulation" from `@pkmn/dex`
   — needed to scope `iconHashes.json` to a manageable size (and re-generate
   when Reg M-A → M-B lands June 17, 2026).
3. **Capture device access from Electron renderer**: verify
   `getUserMedia` against the Elgato HD60X device works without additional
   `desktopCapturer`/permissions plumbing on macOS (may need
   `systemPreferences.askForMediaAccess('camera')` in main process first).
4. **`@pkmn/smogon` fetch in Electron**: confirm native `fetch` is available
   in your renderer/main context for the required `Smogon` initialization, or
   provide a minimal fetch shim.

---

## 10. Suggested build order

1. Core calc wiring (`lib/calc/gen.ts`) + a hardcoded test: parse one
   PokePaste mon, run one `calculate()` call, confirm output looks right for
   the Champions format.
2. Flow A end-to-end (PokePaste import → cards → persisted teams) — this
   validates `@pkmn/sets` + persistence + stat display in isolation.
3. Static analysis dashboard for Flow B using a **hardcoded** fake opponent
   team (skip detection entirely) — get type matchups, speed tiers, damage
   matrix, and `@pkmn/smogon` common-sets lookup all working against real
   data.
4. Detection pipeline (§5) — build `iconHashes.json`, wire up capture device,
   calibration UI, and the "Detect" button to populate `OpponentTeam` instead
   of the hardcoded fixture from step 3.
5. Flow C — lead selection + field toggles, reusing the calc/speed modules
   from step 3 with the active-4 filter and `Field` modifiers.
