/**
 * Pure builders for the In-Battle screen (plan §5 WS-F). Turns the session's
 * "on field" selections + per-mon battle toggles into the `Combatant` and
 * `SpeedTierInput` shapes the shared calc components consume.
 *
 * Opponent EVs/items are unknown, so opponent speed is shown as a RANGE (0-EV
 * neutral → max-invest) plus a Choice-Scarf possibility, rather than a single
 * guessed stat. Your own mons use their exact set.
 */
import { gen } from '../../../lib/calc/gen';
import { defaultMegaForme, resolveMegaForme } from '../../../lib/calc/megaForme';
import { speedBounds } from '../../../lib/calc/speedTiers';
import type { SpeedTierInput } from '../../../lib/calc/speedTiers';
import type { Combatant, DamageResult } from '../../../lib/calc/damageCalc';
import { summarizeKo, type KoSummary } from '../../../lib/calc/threats';
import { buildOpponentCombatant, likelySpeedInput, topMoves } from '../Detection/opponentBuild';
import type {
  FieldState,
  MyPokemon,
  OpponentSlot,
  SpeciesUsage,
  UsageData,
} from '../../../shared/types';

/** Per-mon battle toggle state (mirrors the session store's `myBattleState` value). */
export interface BattleToggles {
  megaActivated?: boolean;
  teraActivated?: boolean;
}

export function speciesName(speciesId: string): string {
  return gen.species.get(speciesId)?.name ?? speciesId;
}

/** Display name for one of your mons (nickname if set, else species). */
export function myDisplayName(mon: MyPokemon): string {
  return mon.set.name && mon.set.name !== mon.set.species
    ? mon.set.name
    : (mon.set.species ?? 'Unknown');
}

/** Non-Status moves a "my team" Pokémon carries, in set order. */
export function damagingMovesOf(mon: MyPokemon): string[] {
  return (mon.set.moves ?? []).filter((m) => {
    const move = gen.moves.get(m);
    return move?.exists && move.category !== 'Status';
  });
}

/** Defensive type(s) for a species, or `megaForme`'s types when Mega is active. */
export function activeTypes(speciesId: string, megaForme: string | null): string[] {
  const species = gen.species.get(megaForme ?? speciesId);
  return species?.exists ? [...species.types] : [];
}

/**
 * Look up a species' Smogon usage entry. `UsageData.species` is keyed by display
 * name (e.g. "Flutter Mane"); fall back to a normalized-id scan for mismatches.
 */
export function findUsage(usage: UsageData | null, speciesId: string): SpeciesUsage | undefined {
  if (!usage) return undefined;
  const name = gen.species.get(speciesId)?.name;
  if (name && usage.species[name]) return usage.species[name];
  for (const [key, value] of Object.entries(usage.species)) {
    const keyId = gen.species.get(key)?.id ?? key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (keyId === speciesId) return value;
  }
  return undefined;
}

/** Your mon as a calc combatant, carrying its Mega/Tera battle toggles. */
export function myCombatant(mon: MyPokemon, toggles: BattleToggles | undefined): Combatant {
  return {
    kind: 'set',
    set: mon.set,
    teraActivated: !!toggles?.teraActivated,
    megaActivated: !!toggles?.megaActivated,
  };
}

/** The representative item Smogon usage suggests for an opponent (top item). */
export function opponentItem(usage: SpeciesUsage | undefined): string | undefined {
  return usage?.items[0]?.name;
}

/**
 * The Mega forme to show for an opponent. We don't know their item, so prefer
 * the forme their most-likely item resolves, then fall back to the species'
 * default Mega forme — so any Mega-capable species can be toggled even when its
 * stone isn't the usage-top item. `null` only when the species can't Mega.
 */
export function opponentMegaForme(
  speciesId: string,
  usage: SpeciesUsage | undefined,
): string | null {
  const name = speciesName(speciesId);
  return resolveMegaForme(name, opponentItem(usage)) ?? defaultMegaForme(name);
}

/** Whether your mon holds a stone that resolves a Mega forme. */
export function myMegaForme(mon: MyPokemon): string | null {
  return resolveMegaForme(mon.set.species ?? '', mon.set.item || undefined);
}

/**
 * Opponent mon as a calc combatant: the usage-derived representative set with
 * the manually-toggled Mega/Tera state from its slot applied on top.
 */
export function opponentCombatant(
  speciesId: string,
  usage: SpeciesUsage | undefined,
  slot: OpponentSlot | undefined,
): Combatant {
  const base = buildOpponentCombatant(speciesId, usage);
  return {
    ...base,
    item: slot?.item ?? base.item,
    teraType: slot?.teraType ?? base.teraType,
    teraActivated: !!slot?.teraActivated,
    megaActivated: !!slot?.megaActivated,
    // Item is unknown, so pin the forme explicitly (default Mega when the
    // usage item isn't this mon's stone) rather than re-resolving from item.
    megaForme: opponentMegaForme(speciesId, usage) ?? undefined,
  };
}

/** Your mon's single speed-tier entry (exact stat; Scarf + Tailwind modifiers). */
export function mySpeedInput(
  mon: MyPokemon,
  toggles: BattleToggles | undefined,
  tailwind: boolean,
): SpeedTierInput {
  return {
    label: myDisplayName(mon),
    set: mon.set,
    megaActivated: !!toggles?.megaActivated,
    modifiers: {
      tailwind,
      choiceScarf: mon.set.item === 'Choice Scarf',
    },
  };
}

/**
 * Opponent speed-tier entries showing the unknown-spread range: 0-EV neutral
 * (min), max-invest (max), and a max + Choice Scarf "possibility" row. Mega
 * (when toggled) shifts the base Speed before bounds are computed.
 */
export function opponentSpeedInputs(
  speciesId: string,
  usage: SpeciesUsage | undefined,
  slot: OpponentSlot | undefined,
  tailwind: boolean,
): SpeedTierInput[] {
  const name = speciesName(speciesId);
  const megaForme = slot?.megaActivated ? opponentMegaForme(speciesId, usage) : null;
  const species = gen.species.get(megaForme ?? speciesId);
  if (!species?.exists) return [];
  const { min, max } = speedBounds(species.baseStats.spe);
  return [
    { label: `${name} (min)`, stat: min, modifiers: { tailwind } },
    { label: `${name} (max)`, stat: max, modifiers: { tailwind } },
    { label: `${name} (max +Scarf)`, stat: max, modifiers: { tailwind, choiceScarf: true } },
  ];
}

/**
 * Swap a field's two sides. The store keeps `attackerSide` = your side; when the
 * opponent is the attacker (their-moves-vs-you table) the screens/Tailwind must
 * be mirrored so they apply to the correct combatant.
 */
export function swapFieldSides(field: FieldState): FieldState {
  return { ...field, attackerSide: field.defenderSide, defenderSide: field.attackerSide };
}

/**
 * The opponent's *likely* damaging movepool for matchup-aware ranking (plan
 * §4.2.1 / §5.1): the top-`cap` usage moves filtered to non-Status (damaging)
 * moves via `gen.moves`. We rank these — the moves they plausibly carry — by
 * damage against the on-field defenders rather than guessing their whole
 * learnset. Empty usage → `[]` (the matchup table degrades to "no usage yet").
 */
export function candidateOpponentMoves(usage: SpeciesUsage | undefined, cap = 8): string[] {
  return topMoves(usage, cap).filter((move) => {
    const m = gen.moves.get(move);
    return !!m?.exists && m.category !== 'Status';
  });
}

/**
 * The opponent's most-likely Speed line as the PRIMARY (bold) tier entry, from
 * the top usage spread (plan §4.2.2). Respects the Mega forme id when the slot
 * is Mega'd (so the forme's base Speed applies). Tailwind/Scarf modifiers apply
 * on top. Falls back to the base stat (neutral, 0 EVs) when no spread is known.
 */
export function likelyOpponentSpeedInput(
  speciesId: string,
  usage: SpeciesUsage | undefined,
  slot: OpponentSlot | undefined,
  tailwind: boolean,
): SpeedTierInput {
  const name = speciesName(speciesId);
  const megaForme = slot?.megaActivated ? opponentMegaForme(speciesId, usage) : null;
  const base = likelySpeedInput(megaForme ?? speciesId, usage, `${name} (likely)`);
  return { ...base, modifiers: { tailwind } };
}

/**
 * The opponent speed rows for the strip: the likely line first (primary), then
 * the existing min/max/+Scarf bounds as faint context. Composes
 * {@link likelyOpponentSpeedInput} with {@link opponentSpeedInputs} — neither
 * helper is mutated.
 */
export function opponentSpeedWithLikely(
  speciesId: string,
  usage: SpeciesUsage | undefined,
  slot: OpponentSlot | undefined,
  tailwind: boolean,
): SpeedTierInput[] {
  return [
    likelyOpponentSpeedInput(speciesId, usage, slot, tailwind),
    ...opponentSpeedInputs(speciesId, usage, slot, tailwind),
  ];
}

/** Format a damage roll's %-range as a compact `61–78%` (or a point `78%`). */
export function formatPctRange(result: DamageResult): string {
  if (result.minPct === result.maxPct) return `${result.maxPct}%`;
  return `${result.minPct}–${result.maxPct}%`;
}

/** A KO-centric damage cell: the KO summary plus its %-range, ready for `KoBadge`. */
export interface KoCell {
  ko: KoSummary;
  pct: string;
}

/** Summarize a damage roll into the KO headline + %-range a `KoBadge` renders. */
export function koCell(result: DamageResult): KoCell {
  return { ko: summarizeKo(result), pct: formatPctRange(result) };
}
