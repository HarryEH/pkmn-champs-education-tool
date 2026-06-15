/**
 * Canonical Pokémon data + calc wiring (spec §1). Singleton — import from here
 * everywhere. Never construct your own Generations or import @smogon/calc from
 * any other entry point.
 *
 * NOTE: @smogon/calc@0.11 ships no `exports` map, so the documented
 * `@smogon/calc/adaptable` path does not resolve under Node/Vite/TS bundler
 * resolution. The real subpath is `@smogon/calc/dist/adaptable`. This is the
 * single place that import lives.
 */
import { Dex } from '@pkmn/dex';
import { Generations } from '@pkmn/data';
import { calculate, Pokemon, Move, Field } from '@smogon/calc/dist/adaptable';

export const gens = new Generations(Dex);
export const gen = gens.get(9);

/**
 * UNGATED Gen-9 data view (`() => true` exists-filter, so nothing is gated out).
 *
 * The default `gen` above is Gen 9's *SV-regional* dex: it strips every species,
 * item, ability and move that isn't legal in vanilla Scarlet/Violet — which means
 * it cannot see any Mega-Evolution content (Mega Stones, Mega formes, the
 * revived/new Mega abilities) or never-released species like Floette-Eternal.
 *
 * The Champions format REVIVES Mega Evolution and adds its own content, so all of
 * that is legal there. Our legality tables (`championsLegality.json` etc.) were
 * built ungated and already include it; this view is what lets the runtime
 * RESOLVE those names (`dexGen.items.get('charizarditey')`, `dexGen.species.get(
 * 'Floette-Eternal')`) instead of treating them as unknown. Use it for Champions
 * legality/Team-Setup resolution; use `gen` for everything else.
 *
 * NOTE: unlike `gen`, a miss here returns an object with `exists === false` (not
 * `undefined`) — callers must test `.exists`, not truthiness.
 */
export const dexGen = new Generations(Dex, () => true).get(9);

export { calculate, Pokemon, Move, Field };
