/**
 * Cross-process domain contract (spec §2). FROZEN after Phase 0.
 *
 * Any change here is a broadcast event — every workstream depends on these
 * shapes. Do not widen unilaterally mid-stream.
 */
import type { PokemonSet } from '@pkmn/sets';

export type { PokemonSet };

/** A single member of the user's own (fully known) team. */
export interface MyPokemon {
  /** Parsed Showdown set, from @pkmn/sets. */
  set: PokemonSet;
  /** Computed Speed stat at the set's level/EVs/IVs/nature. */
  speed: number;
  /** Type(s) for this species (or its forme), e.g. ['Fire', 'Dark']. */
  types: string[];
}

/** A saved, importable team. The ONLY thing persisted across restarts. */
export interface MyTeam {
  id: string;
  name: string;
  /** Raw PokePaste text, retained for re-import/edit. */
  pokepaste: string;
  /** Parsed members — normally 6 entries. */
  pokemon: MyPokemon[];
}

/** One opponent slot from team preview — identity may be uncertain. */
export interface OpponentSlot {
  /** Confirmed species id, or null until detected/confirmed. */
  speciesId: string | null;
  /** Top-N CLIP box-embedding (cosine) matches, best first. */
  candidates: { speciesId: string; confidence: number }[];
  // User-editable overrides, revealed during battle:
  item?: string;
  ability?: string;
  teraType?: string;
  teraActivated?: boolean;
  megaActivated?: boolean;
}

/** The detected opponent team. In-memory only. */
export interface OpponentTeam {
  /** 6 entries after detection. */
  slots: OpponentSlot[];
  detectedAt: number;
}

/** Per-side field conditions for damage calc. */
export interface SideState {
  tailwind?: boolean;
  trickRoom?: boolean;
  reflect?: boolean;
  lightScreen?: boolean;
  auroraVeil?: boolean;
}

/** Battlefield state. In-memory only; feeds @smogon/calc Field. */
export interface FieldState {
  weather?: 'sun' | 'rain' | 'sand' | 'snow';
  terrain?: 'electric' | 'grassy' | 'misty' | 'psychic';
  /** Trick Room is field-wide; mirror onto Field.isTrickRoom. */
  trickRoom?: boolean;
  attackerSide?: SideState;
  defenderSide?: SideState;
}

/** The full in-memory battle session. Reset on "New Battle"/restart. */
export interface BattleSession {
  myTeam: MyTeam;
  /** Species ids of the 4 you brought. */
  myActiveFour: string[];
  opponent: OpponentTeam;
  /** Species ids currently relevant / on field. */
  opponentActiveFour: string[];
  field: FieldState;
}

/** Persisted user settings (spec §6). */
export interface Settings {
  /** Selected capture device id (Elgato, etc.). */
  captureDeviceId?: string;
  /** Six normalized (0–1) calibration rects over the team-preview icon row. */
  calibrationRegions?: NormalizedRect[];
  /** Epoch ms of the last @pkmn/smogon usage fetch. */
  lastUsageDataFetch?: number;
  /** Optional UI theme mode. */
  themeMode?: 'light' | 'battle';
}

/** A rectangle in normalized 0–1 coordinates (scales to any resolution). */
export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cached usage data for one format (shape produced by WS-B). */
export interface UsageData {
  format: string;
  /** YYYY-MM the data corresponds to. */
  month: string;
  fetchedAt: number;
  /** Per-species common sets/items/abilities/spreads/Tera/moves by usage %. */
  species: Record<string, SpeciesUsage>;
}

export interface SpeciesUsage {
  speciesId: string;
  /** Usage % within the format, if known. */
  usage?: number;
  items: UsageEntry[];
  abilities: UsageEntry[];
  teraTypes: UsageEntry[];
  moves: UsageEntry[];
  /** Common EV spreads as "nature:hp/atk/def/spa/spd/spe" → usage %. */
  spreads: UsageEntry[];
}

export interface UsageEntry {
  name: string;
  /** Usage fraction 0–1. */
  usage: number;
}

/** The format this app targets. Reg M-A → M-B cutover 2026-06-17. */
export const CURRENT_FORMAT = 'gen9championsvgc2026regma';
