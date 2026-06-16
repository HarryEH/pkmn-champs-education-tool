/**
 * Threat / matchup calc helpers (plan §5.1, §5.3, §5.5). Pure, tested, no React.
 *
 * These turn raw `calcDamage` rolls into the *decisions* the dense matrix +
 * battle console surface: the best move one side has into another, the moves
 * that most threaten a set of defenders, a KO-count summary, and the net
 * "do I win this square" verdict for a matrix cell.
 *
 * `field` is our domain `FieldState` (what `calcDamage` consumes), not the calc
 * `Field` — the calc layer owns the `FieldState → Field` mapping.
 */
import { calcDamage } from './damageCalc';
import type { Combatant, DamageResult } from './damageCalc';
import { gen } from './gen';
import type { FieldState } from '../../shared/types';

/** Whether a move id/name resolves to a damaging (non-Status) move in `gen`. */
function isDamagingMove(move: string): boolean {
  const m = gen.moves.get(move);
  return !!m?.exists && m.category !== 'Status';
}

/**
 * `calcDamage` that never throws. `@smogon/calc`'s `kochance()` throws on a
 * fully-zero roll (e.g. a type-immune move like Earthquake into a Flying-type),
 * which for our "best move" search just means that move does nothing — so we
 * treat a throw as `null` (no usable damage) rather than letting it propagate.
 */
function safeCalc(
  attacker: Combatant,
  defender: Combatant,
  move: string,
  field?: FieldState,
): DamageResult | null {
  try {
    return calcDamage(attacker, defender, move, field);
  } catch {
    return null;
  }
}

/**
 * The candidate move that hits `defender` hardest (highest `maxPct`). Skips
 * moves that don't exist in `gen.moves` or are Status category. Returns `null`
 * when no candidate is a usable damaging move.
 */
export function bestMoveAgainst(
  attacker: Combatant,
  defender: Combatant,
  moves: string[],
  field?: FieldState,
): { move: string; result: DamageResult } | null {
  let best: { move: string; result: DamageResult } | null = null;
  for (const move of moves) {
    if (!isDamagingMove(move)) continue;
    const result = safeCalc(attacker, defender, move, field);
    if (!result) continue;
    if (!best || result.maxPct > best.result.maxPct) {
      best = { move, result };
    }
  }
  return best;
}

/**
 * Rank `candidateMoves` by how hard their *best* roll lands across all
 * `defenders`, returning the top `n`. For each damaging candidate move, we take
 * the maximum `maxPct` over every defender (and remember which defender that
 * was, as `vsDefender` — an index into `defenders`). Moves that don't exist or
 * are Status are dropped. Used for the In-Battle "their moves" rows.
 */
export function relevantThreats(
  attacker: Combatant,
  defenders: Combatant[],
  candidateMoves: string[],
  field?: FieldState,
  n = 4,
): Array<{ move: string; bestResult: DamageResult; vsDefender: number }> {
  const ranked: Array<{ move: string; bestResult: DamageResult; vsDefender: number }> = [];
  for (const move of candidateMoves) {
    if (!isDamagingMove(move)) continue;
    let bestResult: DamageResult | null = null;
    let vsDefender = -1;
    defenders.forEach((defender, index) => {
      const result = safeCalc(attacker, defender, move, field);
      if (!result) return;
      if (!bestResult || result.maxPct > bestResult.maxPct) {
        bestResult = result;
        vsDefender = index;
      }
    });
    if (bestResult && vsDefender >= 0) {
      ranked.push({ move, bestResult, vsDefender });
    }
  }
  ranked.sort((a, b) => b.bestResult.maxPct - a.bestResult.maxPct);
  return ranked.slice(0, n);
}

/** A KO-count summary for one damage roll. */
export interface KoSummary {
  /** Optimistic hits to KO (`ceil(100 / maxPct)`), or `null` when it can't KO. */
  hits: number | null;
  /** Compact KO label for the badge. */
  label: '1HKO' | '2HKO' | '3HKO' | '4HKO+' | '—';
  /** True when even the *minimum* roll KOs in `hits` (`minPct * hits >= 100`). */
  guaranteed: boolean;
}

/**
 * Summarize a damage roll as a KO count. `hits` is the optimistic count from the
 * MAX roll (`ceil(100 / maxPct)`); `guaranteed` flags when the MIN roll also KOs
 * in that many hits. A non-positive `maxPct` (resisted to nothing / immune)
 * yields `hits: null`, label `'—'`.
 */
export function summarizeKo(result: DamageResult): KoSummary {
  if (result.maxPct <= 0) {
    return { hits: null, label: '—', guaranteed: false };
  }
  const hits = Math.ceil(100 / result.maxPct);
  const label = hits === 1 ? '1HKO' : hits === 2 ? '2HKO' : hits === 3 ? '3HKO' : '4HKO+';
  const guaranteed = result.minPct * hits >= 100;
  return { hits, label, guaranteed };
}

/**
 * Net verdict for a matrix cell, from your KO on them, their KO on you, and the
 * speed arrow (your set vs their likely line).
 *
 * Rule (documented + test-pinned):
 *   1. Fewer hits-to-KO wins outright (you 2HKO, they 3HKO → 'win').
 *   2. On equal hits, the faster side wins the race ('up' = you faster = 'win',
 *      'down' = they faster = 'lose').
 *   3. A speed 'tie' (or anything not resolved above) is 'even'.
 * `null` hits / `'—'` (can't KO) are treated as the WORST case (effectively
 * infinite hits), so a side that can't KO never "wins" the square. When NEITHER
 * side can KO, the square is 'even'.
 */
export function cellVerdict(
  myKo: KoSummary,
  theirKo: KoSummary,
  speedArrow: 'up' | 'down' | 'tie',
): 'win' | 'lose' | 'even' {
  const myHits = myKo.hits ?? Number.POSITIVE_INFINITY;
  const theirHits = theirKo.hits ?? Number.POSITIVE_INFINITY;

  // Neither side can KO → nothing is decided here.
  if (!Number.isFinite(myHits) && !Number.isFinite(theirHits)) return 'even';

  if (myHits < theirHits) return 'win';
  if (myHits > theirHits) return 'lose';

  // Equal hits: the faster side gets the KO off first.
  if (speedArrow === 'up') return 'win';
  if (speedArrow === 'down') return 'lose';
  return 'even';
}
