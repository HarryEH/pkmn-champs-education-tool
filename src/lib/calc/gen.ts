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

export { calculate, Pokemon, Move, Field };
