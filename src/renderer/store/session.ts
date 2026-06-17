/**
 * In-memory battle session store (plan §2, spec §6). NOT persisted — reset on
 * "New Battle" or app restart. Phase-0 stub: typed state + reset. WS-E
 * populates the opponent; WS-F deepens active-four + field state. Phase B adds
 * dynamic on-field tracking + per-mon Mega/Tera battle toggles for both sides.
 *
 * Battle model (explicit 2-step): each side has a "brought four" set
 * (`myActiveFour` / `opponentActiveFour`) and a "currently on field" subset
 * (`myOnField` / `opponentOnField`) that the user updates as switches happen.
 * Opponent Mega/Tera state lives on `OpponentSlot` (FROZEN type); YOUR side's
 * per-mon battle toggles live in the in-memory-only `myBattleState` map.
 */
import { create } from 'zustand';
import type { BattleSession, FieldState, OpponentTeam, PokemonSet } from '../../shared/types';

const emptyField: FieldState = {
  attackerSide: {},
  defenderSide: {},
};

/** Per-mon battle toggles for YOUR side (in-memory only; keyed by species id). */
type MyBattleState = Record<string, { megaActivated?: boolean; teraActivated?: boolean }>;

interface SessionState {
  /** Null until a battle is started from an active team. */
  session: BattleSession | null;
  opponent: OpponentTeam | null;
  /**
   * Exact opponent sets keyed by species id, present ONLY when the opponent was
   * entered via PokePaste (in-memory only, like `opponent`). When set, the
   * analysis calcs against the real item/ability/Tera/EVs/moves instead of usage
   * averages (see `opponentCombatant`). Empty for screenshot/video detection.
   */
  opponentSets: Record<string, PokemonSet>;
  field: FieldState;
  myActiveFour: string[];
  opponentActiveFour: string[];
  /** Species ids currently on field for YOUR side (subset of `myActiveFour`). */
  myOnField: string[];
  /** Species ids currently on field for the opponent (subset of `opponentActiveFour`). */
  opponentOnField: string[];
  /** Per-mon Mega/Tera battle toggles for YOUR side, keyed by species id. */
  myBattleState: MyBattleState;
  /**
   * Set the opponent team. Pass `sets` (speciesId → exact PokemonSet) when the
   * source is a PokePaste so calc can use the real sets; omit for detection,
   * which clears any prior exact sets.
   */
  setOpponent: (opponent: OpponentTeam, sets?: Record<string, PokemonSet>) => void;
  /** Manually correct one detected slot's species (WS-E override dropdown). */
  overrideSlot: (index: number, speciesId: string) => void;
  /** Patch field state (WS-F). */
  setField: (patch: Partial<FieldState>) => void;
  setMyActiveFour: (ids: string[]) => void;
  setOpponentActiveFour: (ids: string[]) => void;
  setMyOnField: (ids: string[]) => void;
  setOpponentOnField: (ids: string[]) => void;
  /** Flip YOUR mon's Mega-activated flag (creates the entry if missing). */
  toggleMyMega: (speciesId: string) => void;
  /** Flip YOUR mon's Tera-activated flag (creates the entry if missing). */
  toggleMyTera: (speciesId: string) => void;
  /** Flip an opponent slot's Mega-activated flag (no-op if no match). */
  toggleOpponentMega: (speciesId: string) => void;
  /** Flip an opponent slot's Tera-activated flag (no-op if no match). */
  toggleOpponentTera: (speciesId: string) => void;
  /** Clear everything in-memory ("New Battle"). */
  newBattle: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  opponent: null,
  opponentSets: {},
  field: emptyField,
  myActiveFour: [],
  opponentActiveFour: [],
  myOnField: [],
  opponentOnField: [],
  myBattleState: {},

  setOpponent: (opponent, sets) => set({ opponent, opponentSets: sets ?? {} }),
  overrideSlot: (index, speciesId) =>
    set((s) => {
      if (!s.opponent) return s;
      const slots = s.opponent.slots.map((slot, i) =>
        i === index ? { ...slot, speciesId } : slot,
      );
      return { opponent: { ...s.opponent, slots } };
    }),
  setField: (patch) => set((s) => ({ field: { ...s.field, ...patch } })),
  setMyActiveFour: (ids) =>
    set((s) => ({
      myActiveFour: ids,
      myOnField: s.myOnField.filter((id) => ids.includes(id)),
    })),
  setOpponentActiveFour: (ids) =>
    set((s) => ({
      opponentActiveFour: ids,
      opponentOnField: s.opponentOnField.filter((id) => ids.includes(id)),
    })),
  setMyOnField: (ids) => set({ myOnField: ids }),
  setOpponentOnField: (ids) => set({ opponentOnField: ids }),
  toggleMyMega: (speciesId) =>
    set((s) => {
      const prev = s.myBattleState[speciesId] ?? {};
      return {
        myBattleState: {
          ...s.myBattleState,
          [speciesId]: { ...prev, megaActivated: !prev.megaActivated },
        },
      };
    }),
  toggleMyTera: (speciesId) =>
    set((s) => {
      const prev = s.myBattleState[speciesId] ?? {};
      return {
        myBattleState: {
          ...s.myBattleState,
          [speciesId]: { ...prev, teraActivated: !prev.teraActivated },
        },
      };
    }),
  toggleOpponentMega: (speciesId) =>
    set((s) => {
      if (!s.opponent) return s;
      const slots = s.opponent.slots.map((slot) =>
        slot.speciesId === speciesId ? { ...slot, megaActivated: !slot.megaActivated } : slot,
      );
      return { opponent: { ...s.opponent, slots } };
    }),
  toggleOpponentTera: (speciesId) =>
    set((s) => {
      if (!s.opponent) return s;
      const slots = s.opponent.slots.map((slot) =>
        slot.speciesId === speciesId ? { ...slot, teraActivated: !slot.teraActivated } : slot,
      );
      return { opponent: { ...s.opponent, slots } };
    }),

  newBattle: () =>
    set({
      session: null,
      opponent: null,
      opponentSets: {},
      field: emptyField,
      myActiveFour: [],
      opponentActiveFour: [],
      myOnField: [],
      opponentOnField: [],
      myBattleState: {},
    }),
}));
