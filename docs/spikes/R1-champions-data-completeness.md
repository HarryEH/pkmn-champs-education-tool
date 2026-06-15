# R1 — Champions-era data completeness (@pkmn/dex 0.10.10)

**Question:** Does the installed dex include Champions-era Mega abilities / returned
Mega formes and `gen9championsvgc2026regma` legality, well enough for the calc engine?

**Verdict:** Partial. Core data (species, types, abilities, items, moves) is fine for
calc. **Returned Mega *formes* are missing from the Gen 9 dex**, and format legality
metadata is not exposed by this package. Neither blocks the calc engine today; the gap
is contained and patchable via a single isolated module if/when Megas are needed.

## What was tested (Node, against `gens.get(9)`)

| Check | Result |
| --- | --- |
| `gen9` Mega formes (`Venusaur-Mega`, `Charizard-Mega-X/Y`, `Mewtwo-Mega-X`, `Rayquaza-Mega`, `Lucario-Mega`, `Kangaskhan-Mega`) | **all MISSING** in Gen 9 |
| Same Mega formes under `gens.get(7)` | **present** (so the data exists in the package, just gated to older gens) |
| Mega-relevant abilities in Gen 9 (`Thick Fat`, `Tough Claws`, `Drought`, `Adaptability`) | **all present** |
| Format legality API (`Dex.formats.all()`) | **not available** — `Dex.formats` is `undefined` in this build |

Key implication: `gen.species.get('Venusaur-Mega')` returns `undefined` under Gen 9.
Any UI/calc path that depends on a Mega forme's base stats/types/ability would silently
get a missing species today.

## Impact on WS-A (calc engine)

- **typeMatchup / speedTiers / damageCalc**: unaffected for non-Mega species. All three
  modules degrade gracefully on unknown species (return neutral / 0 / empty rather than
  throwing), so a missing Mega forme will not crash the engine — it will just produce
  base-forme or empty results.
- **Format legality is out of scope for calc** anyway — the calc never needs to know if a
  set is tournament-legal. So the missing `Dex.formats` is a non-issue for WS-A.

## Recommended approach if Megas are required (describe, don't build)

If the Champions format reintroduces Mega Evolution and we need correct Mega base
stats/types/abilities in Gen 9, add a **single isolated patch module** rather than forking
the dex or upgrading mid-project:

`src/lib/calc/dataExtensions.ts` (proposed, not yet created):

- Export a small static table of Champions-era Mega formes:
  `{ id, name, types, baseStats, abilities[], weightkg }`, sourced from the Gen 7 dex
  (which still has the data — `gens.get(7).species.get(...)`) or hand-curated for any
  Champions-specific stat/typing tweaks.
- Export a single resolver, e.g. `resolveSpecies(name): Specie | MegaPatch`, that the calc
  builders call instead of `gen.species.get` *only on the Mega path*. The common path stays
  on the singleton untouched.
- For `@smogon/calc`, Mega handling can also be driven by passing the Mega forme name plus
  the Mega stone as the item; `Pokemon.getForme(...)` exists in the adaptable build. Verify
  whether the calc's own data layer carries Gen 9 Megas before duplicating the table — if it
  does, the patch may only need to map our item/ability strings, not stats.

Keep the patch **additive and isolated**: no edits to `gen.ts`, no global dex mutation, one
file, fully unit-testable. Revisit only when a Mega-dependent feature is scheduled.

## Bottom line

No data extension is needed to ship WS-A. Logged for the team: returned Mega formes are
absent from Gen 9 in dex 0.10.10, and format-legality metadata is not available from this
package — handle both in a future isolated `dataExtensions.ts` if a feature demands it.
