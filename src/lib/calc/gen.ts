/**
 * Canonical Pokémon data + calc wiring (spec §1). Singleton — import `gen` from
 * here everywhere. Never construct your own Generations or import @smogon/calc
 * from any other entry point.
 *
 * WHY UNGATED (`() => true` exists-filter):
 *
 * We use Gen 9 for MECHANICS (stat/damage formulae, type chart, natures) — that
 * is correct, because the Champions format (`gen9championsvgc2026regma`) is a
 * Gen-9-era format built on the Gen 9 engine.
 *
 * But the DATA view must NOT be gated. The default `Generations(Dex).get(9)` is
 * Gen 9's *SV-regional* dex: it strips every species/item/move/ability that
 * isn't legal in vanilla Scarlet/Violet. Champions is not vanilla SV — it
 * revives Mega Evolution (Mega Stones, Mega formes, the revived/new Mega
 * abilities) and re-allows never-released species like Floette-Eternal. The
 * gated view literally cannot resolve any of that (e.g. `gen.items.get(
 * 'charizarditey')` → missing; building a Mega forme in @smogon/calc → crash).
 *
 * Conceptually: Champions = "Gen 9 mechanics over the National Dex data pool,
 * plus a custom legality overlay." That overlay (which of the pool is actually
 * legal this regulation) lives in our baked tables — championsLegality.json /
 * championsOverrides.json / championsLearnsets.json — NOT in @pkmn/dex, which
 * doesn't ship the champions mod at all. So: existence comes from the full,
 * ungated pool here; legality comes from the tables (see src/lib/legality/*).
 *
 * CONSEQUENCE — a miss returns an object with `exists === false` (name echoed
 * back, types `['???']`, zeroed baseStats), NOT `undefined`. When you need to
 * tell a real entry from a typo, test `.exists`, not truthiness.
 *
 * NOTE: @smogon/calc@0.11 ships no `exports` map, so the documented
 * `@smogon/calc/adaptable` path does not resolve under Node/Vite/TS bundler
 * resolution. The real subpath is `@smogon/calc/dist/adaptable`. This is the
 * single place that import lives.
 */
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import { calculate, Pokemon, Move, Field } from '@smogon/calc/dist/adaptable';

export const gen = new Generations(Dex, () => true).get(9);

export { calculate, Pokemon, Move, Field };
