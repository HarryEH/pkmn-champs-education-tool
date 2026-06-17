/**
 * Pure cell-building logic for the Detection Matchup Matrix (plan §3.2).
 *
 * One {@link buildMatrixCell} per (my mon, their mon) pairing turns the raw
 * calc/usage layer into the four numbers a matrix cell renders: the speed
 * comparison (your set vs their *most-likely* line), your best damaging move
 * into them, their best *likely* damaging move into you, and the net verdict
 * tint. No React; fully unit-testable; never throws.
 *
 * Empty-usage degradation (today's reality, plan §5 carry-over): with no usage
 * for the opponent, we can't know their set/spread/moves — so their offense and
 * their speed degrade to "—", while YOUR offense + speed-from-your-own-set still
 * compute. The cell never throws on a missing opponent species or empty usage.
 */
import type {
  MyPokemon,
  FieldState,
  PokemonSet,
  SpeciesUsage,
  UsageData,
} from '../../../shared/types';
import type { Combatant, DamageResult } from '../../../lib/calc/damageCalc';
import { gen } from '../../../lib/calc/gen';
import { calcSpeed } from '../../../lib/calc/speedTiers';
import {
  bestMoveAgainst,
  cellVerdict,
  summarizeKo,
  type KoSummary,
} from '../../../lib/calc/threats';
import {
  defaultVariant,
  opponentCombatant,
  opponentSpeedInput,
  usageVariants,
} from './opponentBuild';

/** VGC is always Level 50. */
const LEVEL = 50;

/** How many of an opponent's usage moves we treat as their plausible movepool. */
const OPP_MOVE_CAP = 8;

export type SpeedDirection = 'up' | 'down' | 'tie';

/** One side of a cell's damage read: the best move, its %, and KO summary. */
export interface CellOffense {
  /** Best move name (display), or null when no usable damaging move was found. */
  move: string | null;
  /** The raw roll, or null. */
  result: DamageResult | null;
  /** KO summary for the badge (always present; `'—'` when nothing lands). */
  ko: KoSummary;
  /** Pre-formatted percent range (e.g. `'61–78%'`), or null. */
  pct: string | null;
}

/** The fully-resolved data a single matrix cell renders. */
export interface MatrixCell {
  /** Speed arrow direction: up = you faster, down = slower, tie = equal/unknown. */
  speed: SpeedDirection;
  /** Numeric speed delta (yours − theirs), or null when theirs is unknown. */
  speedDelta: number | null;
  /** Your best damaging move into this defender. */
  myOffense: CellOffense;
  /** Their best *likely* damaging move into you (degrades with empty usage). */
  theirOffense: CellOffense;
  /** Net verdict tint from both KOs + the speed arrow. */
  verdict: 'win' | 'lose' | 'even';
  /** The opponent forme that drives this column's analysis (display label). */
  theirLabel: string;
  /** True when we had no usage for the opponent (their offense/speed are '—'). */
  theirUsageMissing: boolean;
}

const NO_KO: KoSummary = { hits: null, label: '—', guaranteed: false };

const EMPTY_OFFENSE: CellOffense = {
  move: null,
  result: null,
  ko: NO_KO,
  pct: null,
};

/** Format a damage roll's min–max as a compact percent string. */
function formatPct(result: DamageResult): string {
  if (result.minPct === result.maxPct) return `${result.maxPct}%`;
  return `${result.minPct}–${result.maxPct}%`;
}

/** Best-move read for one attacker→defender pairing, packaged for a cell. */
function offenseOf(
  attacker: Combatant,
  defender: Combatant,
  candidateMoves: string[],
  field?: FieldState,
): CellOffense {
  const best = bestMoveAgainst(attacker, defender, candidateMoves, field);
  if (!best) return EMPTY_OFFENSE;
  const display = gen.moves.get(best.move)?.name ?? best.move;
  return {
    move: display,
    result: best.result,
    ko: summarizeKo(best.result),
    pct: formatPct(best.result),
  };
}

/** Non-Status moves a "my team" Pokémon carries, in set order. */
export function damagingMovesOf(mon: MyPokemon): string[] {
  return (mon.set.moves ?? []).filter((m) => {
    const move = gen.moves.get(m);
    return move?.exists && move.category !== 'Status';
  });
}

/**
 * The opponent's plausible damaging movepool: usage moves filtered to
 * non-Status (via `gen.moves`), capped at the top {@link OPP_MOVE_CAP} by usage.
 * Empty when there's no usage.
 */
export function likelyMovesOf(usage: SpeciesUsage | undefined): string[] {
  return (usage?.moves ?? [])
    .map((entry) => entry.name)
    .filter((name) => {
      const move = gen.moves.get(name);
      return move?.exists && move.category !== 'Status';
    })
    .slice(0, OPP_MOVE_CAP);
}

/**
 * The representative opponent forme for a detected base species: the
 * dominant-by-usage variant (so a dominant Mega drives the analysis), with its
 * own usage entry. `undefined` for an unidentified slot.
 */
export interface OpponentRepresentative {
  speciesId: string;
  label: string;
  usage: SpeciesUsage | undefined;
}

export function representativeOpponent(
  baseSpeciesId: string | null | undefined,
  usage: UsageData | null,
): OpponentRepresentative | undefined {
  if (!baseSpeciesId) return undefined;
  const variant = defaultVariant(usageVariants(baseSpeciesId, usage));
  if (!variant) return undefined;
  return { speciesId: variant.speciesId, label: variant.label, usage: variant.usage };
}

/** Your set's Speed stat at its level/EVs/IVs/nature. */
function mySpeed(mon: MyPokemon): number {
  return calcSpeed(mon.set);
}

/**
 * Build a single matrix cell for `myMon` (row) vs the opponent slot
 * `theirBaseId` (column). `usage` is the whole-format usage map.
 *
 * - Speed: your exact set Speed vs the opponent's *most-likely* line
 *   (`likelySpeedInput`). up = you faster, down = slower, tie = equal. With no
 *   usage, the opponent speed falls back to base-stat (0 EVs, neutral) inside
 *   `likelySpeedInput`, but we still surface a delta against your real set.
 * - Your offense: `bestMoveAgainst(you, them, damagingMovesOf(you))`.
 * - Their offense: `bestMoveAgainst(them, you, likelyMovesOf(them))`; degrades
 *   to '—' when usage is missing (no candidate moves).
 * - Verdict: `cellVerdict(myKo, theirKo, speedArrow)`.
 */
export function buildMatrixCell(
  myMon: MyPokemon,
  theirBaseId: string | null | undefined,
  usage: UsageData | null,
  field?: FieldState,
  /**
   * Exact opponent set (PokePaste source). When present it overrides the
   * usage-derived forme/spread/moves — real item/ability/Tera/EVs/moves drive the
   * calc, and the opponent's offense/speed never degrade to "—".
   */
  set?: PokemonSet,
): MatrixCell {
  const rep = set ? repFromSet(set, theirBaseId) : representativeOpponent(theirBaseId, usage);

  // Unidentified opponent slot: your offense/speed are undefined too (no target).
  if (!rep) {
    return {
      speed: 'tie',
      speedDelta: null,
      myOffense: EMPTY_OFFENSE,
      theirOffense: EMPTY_OFFENSE,
      verdict: 'even',
      theirLabel: '—',
      theirUsageMissing: true,
    };
  }

  const myCombatant: Combatant = { kind: 'set', set: myMon.set };
  const theirCombatant = opponentCombatant(rep.speciesId, rep.usage, set);

  // Speed: your exact set vs their exact set (paste) or most-likely line (usage).
  const mine = mySpeed(myMon);
  const theirsInput = opponentSpeedInput(rep.speciesId, rep.usage, rep.label, set);
  const theirs = theirsInput.stat ?? 0;
  const speedDelta = mine - theirs;
  const speed: SpeedDirection = speedDelta > 0 ? 'up' : speedDelta < 0 ? 'down' : 'tie';

  // Your offense (always computes from your own set).
  const myOffense = offenseOf(myCombatant, theirCombatant, damagingMovesOf(myMon), field);

  // Their offense — exact set's damaging moves, else their plausible usage movepool.
  const theirMoves = set ? damagingSetMoves(set) : likelyMovesOf(rep.usage);
  const theirOffense =
    theirMoves.length > 0
      ? offenseOf(theirCombatant, myCombatant, theirMoves, field)
      : EMPTY_OFFENSE;

  const verdict = cellVerdict(myOffense.ko, theirOffense.ko, speed);

  return {
    speed,
    speedDelta,
    myOffense,
    theirOffense,
    verdict,
    theirLabel: rep.label,
    // A paste gives us the exact set, so the opponent is never "usage missing".
    theirUsageMissing: set ? false : !rep.usage,
  };
}

/** Representative built from an exact set: its own species/forme, no usage needed. */
function repFromSet(set: PokemonSet, fallbackId: string | null | undefined): OpponentRepresentative {
  const sp = gen.species.get(set.species ?? fallbackId ?? '');
  return {
    speciesId: sp?.exists ? sp.id : (fallbackId ?? ''),
    label: sp?.exists ? sp.name : (fallbackId ?? '—'),
    usage: undefined,
  };
}

/** A set's damaging (non-Status) moves, in set order. */
function damagingSetMoves(set: PokemonSet): string[] {
  return (set.moves ?? []).filter((m) => {
    const move = gen.moves.get(m ?? '');
    return move?.exists && move.category !== 'Status';
  });
}

export { LEVEL };
