/**
 * Persisted-backed team store (plan §2). Phase-0 stub deepened by WS-C with the
 * PokePaste → MyPokemon import/validation pipeline.
 *
 * The exported store API/shape (`useTeamsStore`) is kept stable — other code may
 * import it. New exports (`parsePokepaste`, `ImportResult`, `createTeam`) are
 * additive and pure/testable.
 */
import { create } from 'zustand';
import { Sets } from '@pkmn/sets';
import { gen, dexGen } from '../../lib/calc/gen';
import { checkSetLegality } from '../../lib/legality/teamLegality';
import type { MyPokemon, MyTeam, PokemonSet } from '../../shared/types';

/** One unparseable / illegal block, surfaced to the UI. */
export interface ImportError {
  /** 1-based index of the offending block within the paste. */
  index: number;
  /** Best-effort species text we tried to resolve (may be empty). */
  species: string;
  /** Human-readable reason. */
  message: string;
}

/** Outcome of importing a full PokePaste/Showdown export. */
export interface ImportResult {
  pokemon: MyPokemon[];
  errors: ImportError[];
}

/**
 * Compute Speed at the set's level/EVs/IVs/nature. Extracted so PokemonCard and
 * other callers can recompute any stat with the same wiring.
 */
export function computeStat(
  stat: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe',
  set: PokemonSet,
): number {
  // Ungated lookup so Mega-era / non-SV bases (e.g. Floette-Eternal) still resolve.
  const species = dexGen.species.get(set.species ?? '');
  if (!species?.exists) return 0;
  const nature = gen.natures.get(set.nature ?? 'Serious') ?? undefined;
  const level = set.level ?? 50;
  const base = species.baseStats[stat];
  const iv = set.ivs?.[stat] ?? 31;
  const ev = set.evs?.[stat] ?? 0;
  return gen.stats.calc(stat, base, iv, ev, level, nature);
}

/**
 * Parse a raw PokePaste/Showdown export into validated MyPokemon plus per-block
 * errors. Pure and side-effect free — the unit of logic the DoD asks to test.
 *
 * Splitting strategy mirrors the fixture/spec: blank-line-separated blocks →
 * `Sets.importSet` per block → species validated via `gen.species.get`.
 */
export function parsePokepaste(pokepasteText: string): ImportResult {
  const pokemon: MyPokemon[] = [];
  const errors: ImportError[] = [];

  const blocks = pokepasteText
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  blocks.forEach((block, i) => {
    const index = i + 1;
    let partial: Partial<PokemonSet>;
    try {
      partial = Sets.importSet(block);
    } catch (e) {
      errors.push({
        index,
        species: '',
        message: `Could not parse set #${index}: ${(e as Error).message ?? 'invalid format'}`,
      });
      return;
    }

    const speciesText = partial.species ?? partial.name ?? '';
    if (!speciesText) {
      errors.push({ index, species: '', message: `Set #${index} has no species line.` });
      return;
    }

    // Ungated lookup: the Champions roster includes Mega-era / non-SV species
    // (e.g. Floette-Eternal) that the gated Gen-9 dex strips out. Legality is
    // enforced separately below via checkSetLegality, not by resolvability.
    const species = dexGen.species.get(speciesText);
    if (!species?.exists) {
      errors.push({
        index,
        species: speciesText,
        message: `Unknown species "${speciesText}" (set #${index}) — check spelling/forme.`,
      });
      return;
    }

    // Known-resolvable species → treat as a full set (mirrors fixtures.ts).
    const set = { ...partial, species: species.name } as PokemonSet;
    pokemon.push({
      set,
      speed: computeStat('spe', set),
      types: [...species.types],
    });

    // Champions Reg M-A legality — non-blocking: the Pokémon stays in the team
    // (gallery still renders it) but each violation is surfaced as its own error.
    for (const message of checkSetLegality(set, species)) {
      errors.push({ index, species: species.name, message });
    }
  });

  return { pokemon, errors };
}

let idSeq = 0;
/** Stable-ish unique id for a new team (renderer-only, never persisted-critical). */
function newTeamId(): string {
  idSeq += 1;
  return `team-${Date.now().toString(36)}-${idSeq.toString(36)}`;
}

/**
 * Build a MyTeam from a name + raw paste. Reuses `id` when editing in place so
 * `upsertTeam` replaces rather than appends.
 */
export function createTeam(name: string, pokepaste: string, id?: string): MyTeam {
  const { pokemon } = parsePokepaste(pokepaste);
  return {
    id: id ?? newTeamId(),
    name: name.trim() || 'Untitled Team',
    pokepaste,
    pokemon,
  };
}

interface TeamsState {
  teams: MyTeam[];
  activeTeamId: string | null;
  hydrated: boolean;
  /** Load persisted teams from disk via IPC (call once on boot). */
  hydrate: () => Promise<void>;
  /** Add or replace a team, write-through to disk. */
  upsertTeam: (team: MyTeam) => Promise<void>;
  /** Delete a team, write-through to disk. */
  deleteTeam: (id: string) => Promise<void>;
  /** Select the active team for the session. */
  setActiveTeam: (id: string | null) => void;
  /** Convenience selector for the active team object. */
  getActiveTeam: () => MyTeam | undefined;
}

export const useTeamsStore = create<TeamsState>((set, get) => ({
  teams: [],
  activeTeamId: null,
  hydrated: false,

  hydrate: async () => {
    const teams = await window.api.teams.load();
    set((s) => ({
      teams,
      hydrated: true,
      activeTeamId: s.activeTeamId ?? teams[0]?.id ?? null,
    }));
  },

  upsertTeam: async (team) => {
    const next = (() => {
      const existing = get().teams.findIndex((t) => t.id === team.id);
      if (existing >= 0) {
        const copy = get().teams.slice();
        copy[existing] = team;
        return copy;
      }
      return [...get().teams, team];
    })();
    set((s) => ({ teams: next, activeTeamId: s.activeTeamId ?? team.id }));
    await window.api.teams.save(next);
  },

  deleteTeam: async (id) => {
    const next = get().teams.filter((t) => t.id !== id);
    set((s) => ({
      teams: next,
      activeTeamId: s.activeTeamId === id ? (next[0]?.id ?? null) : s.activeTeamId,
    }));
    await window.api.teams.delete(id);
  },

  setActiveTeam: (id) => set({ activeTeamId: id }),

  getActiveTeam: () => get().teams.find((t) => t.id === get().activeTeamId),
}));
