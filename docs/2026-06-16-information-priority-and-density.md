# Information Priority & Density — Detection + In-Battle redesign

> Plan for **Priority 2** of `2026-06-15-eod.md` (deepen the In-Battle live view) plus the
> cross-cutting **Detection-screen matchup density** the product owner asked for. This doc is the
> *what to show, what to build, in what order* spec. It assumes the calc/data layer described in the
> EOD report (`damageCalc`, `speedTiers`, `typeMatchup`, usage data, `buildOpponentCombatant`).
>
> **Filename note:** requested as `2026-05-16-…`; renamed to today's date (`2026-06-16`) to match the
> `docs/` series. Rename if you'd rather keep the original.

---

## 0. The one-sentence goal

Turn both analysis screens from a **scrolling stack of full-width cards** into **single-viewport,
glanceable dashboards** that fit a MacBook Air 14" at **1711×1112** (≈**1511×1080** usable after the
200px nav) with little or no scrolling, where the highest-value VGC decisions are answerable in under
a second.

The data is mostly already computed. The work is **(a)** a denser, full-width layout system, **(b)**
one new hero component per screen (the **Matchup Matrix** for Detection, the **Battle Console** for
In-Battle), and **(c)** sharpening *which* numbers we compute (best-move-per-matchup instead of
top-N-by-usage, the most-likely speed line, KO-centric summaries).

---

## 1. What actually matters in VGC (the priority ranking the UI must encode)

Doubles VGC decisions, in rough order of how often they decide a game. Every pixel we spend should
map to one of these; anything that doesn't is cut.

1. **Speed control & turn order.** Who moves first decides who gets the KO. Not just raw Speed —
   *Tailwind* (×2), *Trick Room* (reverses order), *Choice Scarf* (×1.5), *priority moves*
   (Fake Out, Extreme Speed, Aqua Jet, Sucker Punch), and paralysis. The single most important
   read at preview is: **"do I control speed, or do I need to disrupt theirs?"**
2. **Who KOs whom, and in how many hits.** OHKO / 2HKO thresholds in *both* directions. A 2v2 in
   VGC is usually decided by who removes a threat first. We must show **KO math**, not just raw %.
3. **Disruption / tempo.** Fake Out (free turn + flinch), redirection (Follow Me / Rage Powder /
   Ally Switch), Intimidate (−Atk on both your physical attackers), Taunt, sleep (Spore), and
   Imprison. These swing turns without dealing damage and are easy to forget.
4. **Defensive backbone — what walls what.** Which of my mons can sit in front of which of theirs
   and not get 2HKO'd. Drives the "safe lead" decision.
5. **Item / ability / spread tells.** Assault Vest (no status moves, +SpD), Booster Energy (a free
   stat boost + a Paradox speed tell), Choice items (locked move), Focus Sash / Sitrus (survives an
   OHKO), Covert Cloak / Safety Goggles / Clear Amulet (negates a strategy). These change every calc
   above. We already pull these from usage — they must sit *next to* the calcs, not on a separate
   tab.
6. **Mega Evolution (Champions-specific).** Champions revives **Mega Evolution and has NO
   Terastallization** (see `usage.ts` — it drops the uniform Tera entry). The once-per-battle swing
   move is *which mon Megas and when* (stat + typing + ability change). **Mega must be a
   first-class, prominent toggle/indicator; Tera UI is dead weight here and should be removed or
   hidden from both screens.**

### Design consequence

- **Detection (team preview)** answers a *planning* question: **"which 4 do I bring, and what's my
  lead?"** → wants the whole **6×6 picture at once** (speed + KO both directions) plus a **threat
  summary** (who controls speed, what disruption exists).
- **In-Battle** answers a *live* question: **"of the mons on the field right now, who wins this
  turn?"** → wants a **focused 2v2** with live speed order and KO calcs for *their most threatening
  moves*, recomputing on every field/Mega toggle.

---

## 2. Layout system & density budget (1511×1080 usable)

Today both screens are a single `maxWidth: 1100` column of stacked `Card`s — on a 1511px canvas that
wastes ~400px of width and forces vertical scrolling through 5–6 cards. The redesign is **width-first
and viewport-bounded**.

### 2.1 Density tokens (add to `tokens.css`)

```css
:root {
  /* Compact type scale for dense tables */
  --font-2xs: 10px;   /* sub-labels, modifiers */
  --font-xs: 11px;    /* table headers, KO chance */
  --font-sm: 12px;    /* table body */
  --font-md: 13px;    /* row labels */
  --font-num: 'Inter', ui-monospace, monospace; /* tabular-nums for aligned % columns */

  --space-0: 2px;     /* tightest table padding */
  --density-row-h: 26px;  /* compact table row height */
}
```

- Numbers in matrices use `font-variant-numeric: tabular-nums` so columns align.
- `--font-battle` (the old `clamp(18px,2.2vw,28px)`) is **retired for these screens** — it was sized
  for a TV "across the room" read that this app no longer targets; it bloats In-Battle.

### 2.2 Screen shell

Add a reusable `DenseScreen` wrapper (or just a shared style object) that:
- fills the main area (`height: 100%`, `display: flex; flex-direction: column`),
- has a **fixed compact header strip** (title + global toggles) that does not scroll,
- and a **content region** that uses CSS grid to split into panes, each pane scrolling
  independently only if it overflows (so the matrix stays put while a side rail scrolls).

Both screens use a **two-pane grid**: a dominant left analysis pane and a ~440–480px right rail.

### 2.3 Reusable primitives to add to `ui/`

- **`DataTable`** — a compact `<table>` style bundle (sticky header row + sticky first column,
  `--density-row-h`, tabular-nums, zebra-free hairline borders). `DamageCalcTable`, `SpeedTierList`,
  and `TypeMatchupGrid` all re-style onto it so the look is consistent and tighter.
- **`KoBadge`** — renders KO math compactly: `OHKO` / `2HKO` / `3HKO` / `—`, color-graded
  (red = you get KO'd / green = you get the KO), with the % as a secondary line. Derived from a new
  `summarizeKo()` (see §5.3).
- **`SpeedArrow`** — `▲` (outspeed) / `▼` (outsped) / `≈` (tie or range-overlap), color-coded,
  always paired with the numeric delta in a tooltip/secondary text (never color alone — house rule).

---

## 3. Detection screen — the **Matchup Matrix** (hero)

Replace the current per-opponent **tab** dashboard (`OpponentDashboard.tsx`, one opponent at a time)
with an **all-at-once 6×6 matrix** as the default view. The per-opponent deep-dive (today's tab
content) survives as a **drill-down drawer**, not the primary surface.

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Detection · 6 opponents identified         [Offense|Defense|Speed|Verdict] ⟳  │  ← header strip
├───────────────────────────────────────────────┬──────────────────────────────┤
│  MATCHUP MATRIX  (my 6 rows × their 6 cols)    │  THREAT & SPEED SUMMARY       │
│                                                │                              │
│            Flutter  Incin  Rillab  Urshi ...   │  Speed control:              │
│   my A   [ cell ][ cell ][ cell ][ cell ] ...  │   ⚡ Tailwind (Tornadus)     │
│   my B   [ cell ][ cell ][ cell ][ cell ] ...  │   🌀 Trick Room (none)       │
│   my C   [ cell ][ cell ][ cell ][ cell ] ...  │   👟 Scarf likely: Chi-Yu    │
│   my D   ...                                   │   ⏩ Priority: Fake Out ×2    │
│   my E   ...                                   │  Disruption:                 │
│   my F   ...                                   │   Intimidate ×1, Rage Powder │
│                                                │  Merged speed tiers (12) ▸   │
│  ◀ click a cell → drill-down drawer below ▶    │  Dangerous items: Booster…   │
├────────────────────────────────────────────────┴──────────────────────────────┤
│  DRILL-DOWN (selected pairing or opponent): common set · full calc rows · …   │  ← collapsible
└──────────────────────────────────────────────────────────────────────────────┘
```

- Left pane ≈ 1010px, right rail ≈ 480px. The 7-column matrix (1 label + 6) at ~140px/col fits.
- The matrix + summary together fit the first viewport; the drill-down is **collapsed by default**
  and expands below (the only intentional scroll).

### 3.2 The matrix cell (information density lives here)

Each cell = the **head-to-head of `my[row]` vs `their[col]`**, packed into ~140×52px:

```
┌────────────────┐
│ ▲      2HKO     │   top-left: speed (you vs them).  top-right: YOUR KO on them
│ 78%        61%  │   bottom-left: your best % to them.  bottom-right: their best % to you
└────────────────┘     cell background tint = net verdict (green you win / red they win / amber even)
```

Encoded per cell:
- **Speed**: `SpeedArrow` from your exact set Speed vs their *most-likely* Speed line (§5.2). On
  hover, the numeric pair.
- **Your offense**: best damaging move you carry vs this defender → max %, and `KoBadge`
  (`summarizeKo`). "Best" = highest expected damage, not usage order (§5.1).
- **Their offense**: their best *likely* damaging move vs you → max % + KO. Symmetric.
- **Net verdict tint**: a cheap heuristic — you "win the square" if you OHKO/2HKO faster than they
  do, lose if mirror, amber if speed-dependent or both 3HKO+. Tint reuses `matchup`/`damage` palette.

The four **view modes** (header segmented control) re-skin the same grid so a player can isolate one
axis when the combined cell is busy:
- **Offense** — only your %/KO to them (heatmap by your damage).
- **Defense** — only their %/KO to you.
- **Speed** — only arrows + Speed deltas.
- **Verdict** — just the net tint + a single glyph (fastest scan for "which 4 to bring").

Default = **Verdict** (the bring-decision view); the others are one click away.

### 3.3 Right rail — Threat & Speed summary (new, high value, currently missing)

Synthesized from the 6 opponents' usage. This is the "what archetype is this and what do I play
around" panel that VGC players build by hand:

- **Speed control flags**: scan opponent usage moves/items for `Tailwind`, `Trick Room`,
  `Choice Scarf` (and the fastest base speeds), priority moves (`Fake Out`, `Extreme Speed`,
  `Aqua Jet`, `Bullet Punch`, `Sucker Punch`, …). Show which species brings each.
- **Disruption flags**: `Fake Out`, `Follow Me`/`Rage Powder`, `Ally Switch`, `Intimidate`
  (ability), `Spore`/sleep, `Taunt`, `Encore`.
- **Merged speed tiers (12 mons)**: collapsible `SpeedTierList` of *all* 6v6 with key benchmarks,
  not just one opponent — this replaces the per-tab speed list as the headline speed view.
- **Dangerous items/abilities**: top items across the team that change calcs (Sash, AV, Booster,
  Sitrus, Covert Cloak, Safety Goggles, Clear Amulet) with the holder.

Each flag is a small chip with the species icon. These come from a new pure
`scanThreats(opponentSlots, usage)` helper (§5.4) — testable, no React.

### 3.4 Drill-down drawer (reuses today's work)

Clicking a cell (or an opponent's column header) opens the existing **per-opponent analysis** below
the matrix — `CommonSets`, full `DamageCalcTable` rows both directions, `TypeMatchupGrid`, forme
selector — scoped to that pairing (or that whole opponent). This **preserves 100% of
`OpponentDashboard`'s current value**; we're demoting it from "the screen" to "the detail view."

---

## 4. In-Battle screen — the **Battle Console**

Keep the existing model (bring-4 → who's-in → Mega/field toggles → live recompute) but recompose it
into a **single-viewport console** instead of a 1100px column of six stacked cards.

### 4.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ In-Battle   [Field: ☀Sun ▾] [Tailwind y/n] [TR] [+Reflect…]      [New Battle] │  ← compact control bar
├──────────────────────────────────────────────────────────────────────────────┤
│  SPEED ORDER (on-field mons only, live)   ▲ you move first / ▼ they do         │  ← full-width strip
│  1 Flutter 130 (opp,max+Scarf) · 2 Whimsi 120 (you) · 3 Incin 80 (you) · …     │
├───────────────────────────────────┬───────────────────────────────────────────┤
│  YOUR MOVES → THEIR ACTIVE          │  THEIR LIKELY MOVES → YOUR ACTIVE         │
│  (your on-field mons' damaging      │  (their top damaging moves, matchup-      │
│   moves, KO-graded)                 │   ranked, KO-graded)                      │
│  ┌──────────┬───────┬───────┐       │  ┌──────────┬───────┬───────┐             │
│  │ move     │ oppA  │ oppB  │       │  │ move     │ youA  │ youB  │             │
│  └──────────┴───────┴───────┘       │  └──────────┴───────┴───────┘             │
├───────────────────────────────────┴───────────────────────────────────────────┤
│  ON-FIELD CONTEXT: per active opp → set (item/ability/Mega/spread) + key tells  │  ← compact, replaces selection chips after lock-in
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Selection** (bring-4 / who's-in chips) moves into a **collapsible "Setup" popover** in the
  control bar. Once mons are on the field, the chips collapse so the console isn't dominated by
  pickers — they re-open on demand. (Today the two big selection `Card`s eat the top half of the
  screen.)
- The two damage matrices sit **side-by-side** (each ~735px) instead of stacked — both visible at
  once, which is the whole point in-battle (am I getting KO'd vs am I getting the KO).
- The speed strip is **horizontal and full-width** at the top — the most-glanced element.

### 4.2 The two improvements the EOD doc called out (Priority 2.1 / 2.2)

1. **Matchup-aware opponent moves (was: top-N by usage).** Replace `topMoves(usage, 6)` rows with
   `relevantThreats(opponentSet, defenders, usage)` (§5.1): filter to damaging moves they're *likely*
   to carry, then **rank by max damage against the on-field defenders** and keep the top ~4. This
   surfaces the move that actually threatens *this* matchup instead of their globally-most-used move
   (e.g. their coverage move that nails your lead, even if it's their 4th-most-used overall). Keep a
   "show all likely moves" expander for completeness.
2. **Most-likely Speed line, not just bounds.** Today the opponent is three rows (min / max /
   max+Scarf). Add the **usage-spread line** as the *primary* row — parse the top spread's actual
   Speed EVs/nature via the existing `parseSpread`, compute the real stat, and show it as the bold
   "likely" entry, with min/max kept as faint context bounds. This is the number a player actually
   plays around.

### 4.3 KO-centric damage cells

Every damage cell in both consoles gets the `KoBadge` treatment: the **KO count is the headline**
(`OHKO`/`2HKO`), the % is secondary. In-battle, "do I die / do I get the kill" is the decision; the
raw % is supporting detail. (Today the % is primary and KO chance is a faint second line — invert it.)

### 4.4 Mega front-and-center, Tera removed

- Replace the per-mon `Mega | Tera` toggle pair (`OnFieldToggles`) with a **Mega-only** control,
  shown as a prominent state on the mon's row when active (forme name + the stat/typing delta).
- **Remove Tera toggles** from In-Battle (and the Trick Room/Tera bits of Detection that imply Tera).
  Champions has no Tera; the toggles are misleading. `teraActivated`/`teraType` stay in the FROZEN
  `types.ts` (don't touch the contract) but are simply not surfaced.

---

## 5. Supporting calc / data work (pure, testable, no React)

These land in `src/lib/` (or the screen `*Build.ts` helpers) with unit tests, before the UI consumes
them.

### 5.1 Best / relevant move selection (`src/lib/calc/threats.ts`, new)

- `bestMoveAgainst(attacker: Combatant, defender: Combatant, moves: string[], field?)` →
  `{ move, result: DamageResult }` — runs `calcDamage` for each candidate move, returns the
  highest-max-% one. Used for matrix cells (your best move; their best move).
- `relevantThreats(attacker, defenders, candidateMoves, field?, n=4)` → the candidate damaging moves
  ranked by best max-% across the given defenders. Used for the In-Battle "their moves" rows.
- Candidate moves come from: **your** mons = their actual set moves (already have
  `damagingMovesOf`); **opponent** = their *likely* movepool = usage `moves` filtered to
  non-Status (via `gen.moves`), capped (e.g. top 8 by usage) before ranking, so we rank the moves
  they plausibly carry rather than their whole learnset.

### 5.2 Most-likely opponent Speed line (`opponentBuild.ts` / `battleBuild.ts`)

- Add `likelySpeedInput(speciesId, usage, slot)` → a `SpeedTierInput` from the **top usage spread's**
  parsed Speed EVs+nature (reuse `parseSpread` + `calcSpeed`-style math; respects Mega forme). The
  In-Battle and matrix code use this as the primary opponent speed; `speedBounds` stays for the
  faint min/max context rows.

### 5.3 KO summarization (`src/lib/calc/threats.ts` or extend `damageCalc.ts`)

- `summarizeKo(result: DamageResult)` → `{ hits: number | null, label: '1HKO'|'2HKO'|'3HKO'|'4HKO+'|'—', guaranteed: boolean }`.
  Derive from min/max % (e.g. `ceil(100 / maxPct)` for the optimistic count; flag `guaranteed` when
  `minPct * hits >= 100`). `KoBadge` renders it. (Note `@smogon/calc` already exposes `kochance()`
  for the single-hit chance we surface today — `summarizeKo` adds the multi-hit *count* read.)

### 5.4 Threat scan (`src/lib/smogon/threatScan.ts`, new)

- `scanThreats(opponentSlots, usage)` → `{ tailwind, trickRoom, scarf, priority[], intimidate,
  redirection, fakeOut, sleep, taunt, dangerousItems[] }`, each carrying the contributing species
  ids. Pure lookups over usage `moves`/`items`/`abilities` against small constant keyword sets.
  Drives the Detection right rail. Fully unit-testable against a fixture `UsageData`.

### 5.5 Net verdict heuristic (matrix tint)

- `cellVerdict(myKo, theirKo, speedArrow)` → `'win' | 'lose' | 'even'`. Simple, documented rule
  (fewer hits to KO wins; tie broken by speed; both slow/bulky → even). Lives next to the matrix
  component with a test pinning the rule.

> **Usage-data dependency (carry-over).** Per the EOD report, `gen9championsvgc2026regma` currently
> 404s upstream, so usage is empty today and every usage-derived element above degrades to "—". All
> of this must **render cleanly with empty usage** (matrix shows speed + your-offense from your own
> sets; opponent-offense/threat rail show "no usage yet"). Re-verify once Champions stats publish
> (and re-confirm the name-vs-id keying in `findUsage`/`lookupUsage` against real data).

---

## 6. New / changed files

| File | Change |
| --- | --- |
| `src/renderer/theme/tokens.css` | Add density tokens (§2.1); retire `--font-battle` usage. |
| `src/renderer/ui/DataTable.tsx` | **New** compact table primitive; re-base existing tables on it. |
| `src/renderer/ui/KoBadge.tsx` | **New** KO-count badge. |
| `src/renderer/ui/SpeedArrow.tsx` | **New** outspeed/outsped/tie glyph. |
| `src/renderer/components/MatchupMatrix.tsx` | **New** 6×6 hero grid + view-mode switch + cell. |
| `src/renderer/components/ThreatSummary.tsx` | **New** Detection right rail. |
| `src/renderer/screens/Detection/index.tsx` + `OpponentDashboard.tsx` | Recompose: matrix + rail primary, dashboard demoted to drill-down drawer. |
| `src/renderer/screens/InBattle/index.tsx` | Recompose into the Battle Console (control bar + speed strip + side-by-side matrices + collapsible setup). |
| `src/lib/calc/threats.ts` | **New** `bestMoveAgainst`, `relevantThreats`, `summarizeKo`. |
| `src/lib/smogon/threatScan.ts` | **New** `scanThreats`. |
| `src/renderer/screens/Detection/opponentBuild.ts` / `InBattle/battleBuild.ts` | Add `likelySpeedInput`; wire matchup-aware moves; cell builders. |
| `DamageCalcTable` / `SpeedTierList` / `TypeMatchupGrid` | Restyle onto `DataTable`; invert to KO-headline cells. |

No changes to FROZEN `src/shared/types.ts` or `ipc.ts`. No main-process/IPC changes (all of this is
renderer calc + UI). No detection-pipeline changes.

---

## 7. Sequencing

1. **Calc/data foundation (pure, tested).** `threats.ts` (`bestMoveAgainst`/`relevantThreats`/
   `summarizeKo`), `threatScan.ts`, `likelySpeedInput`, `cellVerdict`. Unit tests against a usage
   fixture (and an *empty*-usage case). No UI yet. → green `npm test`.
2. **UI primitives.** `DataTable`, `KoBadge`, `SpeedArrow`, density tokens. Restyle the three
   existing table components onto `DataTable` (visual-only; behavior unchanged).
3. **Detection matrix.** `MatchupMatrix` + view-mode switch + `ThreatSummary` rail; recompose the
   Detection screen; demote `OpponentDashboard` to the drill-down drawer.
4. **In-Battle console.** Recompose into control bar + speed strip + side-by-side matrices; collapse
   selection into a popover; wire matchup-aware opponent moves + likely-speed line; KO-headline cells.
5. **Mega/Tera cleanup.** Mega-only controls; remove Tera UI from both screens.
6. **Polish pass at 1711×1112.** Verify both screens fit the first viewport with a real 6-mon team +
   detected opponent (fixtures cover this offline); tune column widths, sticky headers, empty-usage
   states. `npm run typecheck && npm run lint && npm test`.

Each step is independently shippable and leaves the app working.

---

## 8. Acceptance criteria

- At **1711×1112 full-screen**, Detection shows the full **6×6 matrix + threat rail above the fold**
  (drill-down is the only scroll); In-Battle shows **speed strip + both damage matrices above the
  fold** with selection collapsed.
- A matrix cell communicates, without a click: **who's faster, who KOs whom and in how many hits.**
- In-Battle opponent move rows are the **moves that threaten the on-field mons**, KO-graded, with the
  opponent's **likely** speed bolded against min/max bounds.
- **Mega** is a prominent, working control on both screens; **no Tera UI** remains.
- Everything renders cleanly with **empty usage data** (today's reality) and lights up when Champions
  stats publish.
- `tsc`/`eslint`/`vitest` green; new calc helpers covered by tests, including empty-usage paths.

---

## 9. Out of scope / deferred

- Live capture (E1b), calibration UX, the Rotom-Wash detection miss — all **Priority 3/4** in the EOD
  report, untouched here.
- Multiple-distinct-sets modelling (EOD Priority 1.2) — the matrix uses the single representative set;
  the per-set bundle work can layer into the drill-down later.
- Reg M-A → M-B cutover (EOD Priority 5) — data-table regen, orthogonal to this UI work.
- Persisting matrix view-mode / drawer state — in-memory session only for now.
```
