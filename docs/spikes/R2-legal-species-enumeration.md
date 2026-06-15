# R2 — Legal species enumeration for the icon-hash table

**Owner:** WS-D · **Date:** 2026-06-15 · **Status:** resolved

## Question

What is the cleanest way to enumerate the legal species pool for
`gen9championsvgc2026regma` from the `gen` singleton, so `buildIconHashes.ts`
hashes exactly the icons we might see in team preview?

## Constraint discovered

R1 already found that `Dex.formats` is **undefined** in `@pkmn/dex@0.10.10`, so
there is **no format-legality metadata** to query (no rules list, no banlist).
Confirmed again here: `Dex.formats === undefined`. We therefore cannot ask
"is species X legal in Reg M-A?" directly and must approximate with the species
metadata that `@pkmn/data` does expose.

## What `gen.species` already gives us

Enumerating `[...gen.species]` for Gen 9 yields **876** species, and they are
already a clean "standard" set:

- Every entry has `isNonstandard == null` (no CAP / Pokestar / Future mons).
- Every entry has `num > 0`.
- **Cosmetic formes are already excluded** (`isCosmeticForme` count = 0).
- **G-Max formes are absent** (e.g. `venusaurgmax` → not present).

So `gen.species` is itself the closest thing to a legality filter available.

## The filter we use

```ts
[...gen.species].filter((s) => !s.battleOnly);
```

This drops the **16 `battleOnly` formes** — in-battle transformations that never
appear as a distinct _team-preview_ icon and that collide on sprite `num` with
their base forme anyway:

```
meloettapirouette, miniormeteor, mimikyubusted, cramorantgulping,
cramorantgorging, eiscuenoice, morpekohangry, zaciancrowned,
zamazentacrowned, palafinhero, ogerpontealtera, ogerponwellspringtera, …
```

**Result: 860 species.** After de-duplicating on the sprite-sheet cell (a few
distinct ids share one icon cell), the generated table holds **852 entries**.

### Why not filter by tier?

`species.tier` / `species.doublesTier` exist (e.g. `DOU`, `DUber`, `DUU`,
`(DUU)`) but they encode Smogon's _usage_ tiers, not the official Reg M-A legal
list, and Reg M-A's restricted-Pokémon rules don't map onto them. Over-filtering
by tier would risk dropping a species that is actually bringable. For an icon
_recognition_ table, a **superset** of the legal pool is harmless (we only ever
match against icons that actually appear on screen) and missing a species would
be a real bug — so we deliberately keep the broad `!battleOnly` filter.

## Regenerating the table

```sh
npx vite-node scripts/buildIconHashes.ts
```

Downloads `https://play.pokemonshowdown.com/sprites/pokemonicons-sheet.png` once,
crops/normalizes/hashes each icon with the shared `hashImage()`, and writes
`src/data/iconHashes.json`. Requires network access to play.pokemonshowdown.com.

## ⚠️ Reg M-A → M-B cutover: 2026-06-17

The format flips from Reg **M-A** to **M-B** on **2026-06-17**. The legal pool
changes at that point. Action required on/after that date:

1. Update `CURRENT_FORMAT` (owned by Phase 0 / shared, not WS-D) if the id changes.
2. Re-run `npx vite-node scripts/buildIconHashes.ts` and re-commit
   `src/data/iconHashes.json`.

The `format` and `generatedAt` fields baked into the JSON make a stale table
obvious; `assertTableCompatible()` only guards the _hashing params_, not the
format, so this remains a manual calendar trigger.
