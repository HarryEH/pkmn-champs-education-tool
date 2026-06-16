/**
 * Threat scan (plan §5.4). Pure lookups over the detected opponents' usage data
 * (moves / items / abilities) against small constant keyword sets, producing the
 * "what archetype is this and what do I play around" summary the Detection right
 * rail renders. No React; fully unit-testable; never throws (empty/`null` usage
 * → all-empty result).
 *
 * Usage entries store either Showdown display names ("Fake Out") or ids
 * ("fakeout") depending on the source, so every comparison is done on a
 * normalized id: `gen`'s own id when the name resolves, else lowercased
 * alphanumerics. That makes 'fakeout' and 'Fake Out' both match.
 */
import { gen } from '../../lib/calc/gen';
import type { OpponentSlot, SpeciesUsage, UsageData, UsageEntry } from '../../shared/types';

/** Normalize any name/id to a comparable Showdown id. */
function toId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function moveId(name: string): string {
  return gen.moves.get(name)?.id ?? toId(name);
}

function itemId(name: string): string {
  return gen.items.get(name)?.id ?? toId(name);
}

function abilityId(name: string): string {
  return gen.abilities.get(name)?.id ?? toId(name);
}

// --- Keyword sets (stored as normalized ids) ---------------------------------

const TAILWIND = new Set([moveId('Tailwind')]);
const TRICK_ROOM = new Set([moveId('Trick Room')]);
const TAUNT = new Set([moveId('Taunt')]);
const FAKE_OUT = new Set([moveId('Fake Out')]);

const PRIORITY_MOVES = new Set(
  [
    'Fake Out',
    'Extreme Speed',
    'Aqua Jet',
    'Bullet Punch',
    'Sucker Punch',
    'Mach Punch',
    'Ice Shard',
    'Shadow Sneak',
    'Quick Attack',
  ].map(moveId),
);

const REDIRECTION = new Set(['Follow Me', 'Rage Powder', 'Ally Switch'].map(moveId));

const SLEEP = new Set(['Spore', 'Sleep Powder', 'Yawn', 'Hypnosis'].map(moveId));

const CHOICE_SCARF = itemId('Choice Scarf');

const DANGEROUS_ITEMS = [
  'Choice Scarf',
  'Assault Vest',
  'Booster Energy',
  'Focus Sash',
  'Sitrus Berry',
  'Covert Cloak',
  'Safety Goggles',
  'Clear Amulet',
].map((name) => ({ id: itemId(name), name }));

const INTIMIDATE = abilityId('Intimidate');

// --- Result shape ------------------------------------------------------------

export interface ThreatScan {
  /** Species (display names) bringing Tailwind. */
  tailwind: string[];
  /** Species bringing Trick Room. */
  trickRoom: string[];
  /** Species likely holding a Choice Scarf. */
  scarf: string[];
  /** Per priority move → the species that carry it. */
  priority: Array<{ move: string; species: string[] }>;
  /** Species with the Intimidate ability. */
  intimidate: string[];
  /** Species bringing redirection (Follow Me / Rage Powder / Ally Switch). */
  redirection: string[];
  /** Species bringing Fake Out. */
  fakeOut: string[];
  /** Species bringing a sleep move (Spore / Sleep Powder / Yawn / Hypnosis). */
  sleep: string[];
  /** Species bringing Taunt. */
  taunt: string[];
  /** Per dangerous item → the species likely holding it. */
  dangerousItems: Array<{ item: string; species: string[] }>;
}

function emptyScan(): ThreatScan {
  return {
    tailwind: [],
    trickRoom: [],
    scarf: [],
    priority: [],
    intimidate: [],
    redirection: [],
    fakeOut: [],
    sleep: [],
    taunt: [],
    dangerousItems: [],
  };
}

/** Display name for a slot's species (falls back to the raw id). */
function slotName(slot: OpponentSlot): string {
  const id = slot.speciesId;
  if (!id) return '';
  return gen.species.get(id)?.name ?? id;
}

/**
 * Look up a slot's usage entry, keyed by display name with a normalized-id
 * fallback (mirrors `findUsage`/`lookupUsage`).
 */
function lookupUsage(usage: UsageData | null, speciesId: string): SpeciesUsage | undefined {
  if (!usage) return undefined;
  const name = gen.species.get(speciesId)?.name;
  if (name && usage.species[name]) return usage.species[name];
  for (const [key, value] of Object.entries(usage.species)) {
    const keyId = gen.species.get(key)?.id ?? toId(key);
    if (keyId === speciesId) return value;
  }
  return undefined;
}

/** Whether any entry in `entries` normalizes into `set`. */
function hasAny(entries: UsageEntry[] | undefined, set: Set<string>, normalize: (n: string) => string): boolean {
  return (entries ?? []).some((e) => set.has(normalize(e.name)));
}

/** Whether any entry normalizes to exactly `id`. */
function hasId(entries: UsageEntry[] | undefined, id: string, normalize: (n: string) => string): boolean {
  return (entries ?? []).some((e) => normalize(e.name) === id);
}

/**
 * Scan the detected opponents' usage for the speed-control / disruption / item
 * tells that drive the threat rail. Pure; returns all-empty arrays when `usage`
 * is `null`/empty or `slots` is empty.
 */
export function scanThreats(slots: OpponentSlot[], usage: UsageData | null): ThreatScan {
  const scan = emptyScan();
  if (!usage || slots.length === 0) return scan;

  // Accumulators for the per-keyword groupings.
  const priorityMap = new Map<string, string[]>();
  const itemMap = new Map<string, string[]>();

  for (const slot of slots) {
    if (!slot.speciesId) continue;
    const su = lookupUsage(usage, slot.speciesId);
    if (!su) continue;
    const name = slotName(slot);

    const moves = su.moves;
    const items = su.items;
    const abilities = su.abilities;

    if (hasAny(moves, TAILWIND, moveId)) scan.tailwind.push(name);
    if (hasAny(moves, TRICK_ROOM, moveId)) scan.trickRoom.push(name);
    if (hasAny(moves, TAUNT, moveId)) scan.taunt.push(name);
    if (hasAny(moves, FAKE_OUT, moveId)) scan.fakeOut.push(name);
    if (hasAny(moves, REDIRECTION, moveId)) scan.redirection.push(name);
    if (hasAny(moves, SLEEP, moveId)) scan.sleep.push(name);

    if (hasId(items, CHOICE_SCARF, itemId)) scan.scarf.push(name);
    if (hasId(abilities, INTIMIDATE, abilityId)) scan.intimidate.push(name);

    // Priority moves: group species under each priority move they carry.
    for (const entry of moves ?? []) {
      const id = moveId(entry.name);
      if (!PRIORITY_MOVES.has(id)) continue;
      const display = gen.moves.get(entry.name)?.name ?? entry.name;
      const list = priorityMap.get(display) ?? [];
      if (!list.includes(name)) list.push(name);
      priorityMap.set(display, list);
    }

    // Dangerous items: group species under each dangerous item they likely hold.
    for (const di of DANGEROUS_ITEMS) {
      if (hasId(items, di.id, itemId)) {
        const list = itemMap.get(di.name) ?? [];
        if (!list.includes(name)) list.push(name);
        itemMap.set(di.name, list);
      }
    }
  }

  scan.priority = [...priorityMap.entries()].map(([move, species]) => ({ move, species }));
  scan.dangerousItems = [...itemMap.entries()].map(([item, species]) => ({ item, species }));

  return scan;
}
