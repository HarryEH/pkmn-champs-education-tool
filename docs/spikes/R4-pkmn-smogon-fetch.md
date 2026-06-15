# R4 — @pkmn/smogon fetch & month-key strategy

**Owner:** WS-B · **Date:** 2026-06-15 · **Status:** Resolved

## Question

Can we fetch Smogon usage data for `gen9championsvgc2026regma` from the Electron
renderer, and how do we key it by month into our disk cache?

## Findings

### 1. Native `fetch` satisfies @pkmn/smogon

`@pkmn/smogon@0.5.31`'s `Smogon` constructor requires a fetch of shape
`(url: string) => Promise<{ json(): Promise<any> }>`. The Electron renderer's
global `fetch` (Chromium) satisfies this directly — no polyfill, no `node-fetch`,
no `cross-fetch`. We pass it through verbatim:

```ts
new Smogon((url) => fetch(url));
```

`createSmogon(fetchImpl?)` in `usageData.ts` wires this and defaults to
`globalThis.fetch`. Confirmed importable + constructable under vitest (node env)
with an injected fetch.

### 2. We fetch the format report directly (not per-species `Smogon.stats()`)

`Smogon` exposes only **per-species** accessors: `stats(gen, species, format?)`,
`sets(...)`, `analyses(...)`. There is no "list all species in the format"
method. Internally `stats()` fetches the whole format report once
(`${URL}/stats/${format}.json`, `URL = "https://data.pkmn.cc/"`), caches it, and
returns `report.pokemon[speciesName]`.

Because we need the _entire_ species map for `UsageData.species`, we fetch that
same endpoint ourselves in one request and iterate `report.pokemon`, rather than
enumerating species and calling `stats()` N times. We still ship `createSmogon`
for callers that want the per-species `sets()`/`analyses()` API later (WS-A/F).

**Endpoint used:** `GET https://data.pkmn.cc/stats/<format>.json`

### 3. Data shape (`DisplayUsageStatistics` / legacy)

The live VGC reports are the **legacy** flavour (`LegacyDisplayUsageStatistics`):
top-level keys `battles`, `pokemon`, `metagame`; each species has
`usage {raw, real, weighted}`, `abilities`, `items`, `teraTypes`, `moves`, and
**`spreads`** (the modern non-legacy shape calls this `stats`). Our shaper reads
`spreads` and falls back to `stats`, so both flavours work.

- `usage` → we take `usage.weighted` (0–1).
- `abilities|items|teraTypes|moves` → `{ [name]: fraction }` maps, shaped into
  descending-sorted `UsageEntry[]`.
- `spreads` keys are already `"Nature:hp/atk/def/spa/spd/spe"` — exactly the
  format our `SpeciesUsage.spreads` documents. No transform needed.

Verified live against `gen9vgc2024` (327 species; Incineroar weighted usage
0.3427, top item Safety Goggles 0.5925, top Tera Ghost 0.6927 — all shaped
correctly).

### 4. Month-key strategy

**The data.pkmn.cc stats endpoint is NOT month-addressable** — it serves the
_latest_ report for a format. The `baseFormat` logic in @pkmn/smogon
(SPECIAL regex `/(gen[789](?:vgc20(?:19|2\d)(reg...)?|battlestadium...))/`)
collapses standard `gen9vgc20XX...` series to an 11-char base but does **not**
match `championsvgc`, so our format is requested verbatim:
`https://data.pkmn.cc/stats/gen9championsvgc2026regma.json`.

Therefore the **month string is for OUR disk cache only**, not the remote URL.
`monthKey(date = new Date())` returns zero-padded `YYYY-MM`; the disk cache
(`window.api.usage`, persistence.ts) partitions files as
`usage-<format>-<month>.json`. A new calendar month is a natural cache miss →
triggers a fresh fetch of whatever the endpoint currently serves. `monthKey`
accepts an injectable `Date` (and `fetchUsage` an injectable `now`) so nothing
reads the wall clock at import time — keeps tests deterministic.

### 5. Availability caveat (current)

As of 2026-06-15, `gen9championsvgc2026regma.json` returns **404** (Reg M-A is
the just-arriving regulation; the M-A→M-B cutover is 2026-06-17 per
`types.ts`). Established formats (`gen9vgc2024`, `gen9battlestadiumdoubles`)
return 200. `fetchUsage` degrades gracefully on 404/offline: it serves any
cached entry, else returns an empty-but-valid `UsageData` (`species: {}`) and
**never throws**. Once the format is published upstream, the same code path
fills in with zero changes.

## Decision

- Renderer-side native `fetch`; no extra dependency.
- Fetch the whole format report from `data.pkmn.cc/stats/<format>.json` and
  shape `report.pokemon` into `UsageData`.
- `window.api.usage` handles the **disk cache only**, not the network fetch.
- Month key labels the disk cache; the endpoint itself serves "latest".
- Offline/404 is non-fatal — cached-or-empty fallback.
