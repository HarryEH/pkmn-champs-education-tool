/**
 * In-memory battle session store (plan §2, spec §6). NOT persisted — reset on
 * "New Battle" or app restart. Phase-0 stub: typed state + reset. WS-E
 * populates the opponent; WS-F deepens active-four + field state.
 */
import { create } from 'zustand';
import type { BattleSession, FieldState, OpponentTeam } from '../../shared/types';

const emptyField: FieldState = {
  attackerSide: {},
  defenderSide: {},
};

interface SessionState {
  /** Null until a battle is started from an active team. */
  session: BattleSession | null;
  opponent: OpponentTeam | null;
  field: FieldState;
  myActiveFour: string[];
  opponentActiveFour: string[];
  /** Set the detected opponent team (WS-E). */
  setOpponent: (opponent: OpponentTeam) => void;
  /** Patch field state (WS-F). */
  setField: (patch: Partial<FieldState>) => void;
  setMyActiveFour: (ids: string[]) => void;
  setOpponentActiveFour: (ids: string[]) => void;
  /** Clear everything in-memory ("New Battle"). */
  newBattle: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  opponent: null,
  field: emptyField,
  myActiveFour: [],
  opponentActiveFour: [],

  setOpponent: (opponent) => set({ opponent }),
  setField: (patch) => set((s) => ({ field: { ...s.field, ...patch } })),
  setMyActiveFour: (ids) => set({ myActiveFour: ids }),
  setOpponentActiveFour: (ids) => set({ opponentActiveFour: ids }),

  newBattle: () =>
    set({
      session: null,
      opponent: null,
      field: emptyField,
      myActiveFour: [],
      opponentActiveFour: [],
    }),
}));
