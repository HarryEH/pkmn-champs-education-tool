import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../session';
import type { OpponentTeam } from '../../../shared/types';

const makeOpponent = (ids: (string | null)[]): OpponentTeam => ({
  slots: ids.map((speciesId) => ({ speciesId, candidates: [] })),
  detectedAt: 0,
});

describe('useSessionStore — Phase B battle model', () => {
  beforeEach(() => {
    useSessionStore.getState().newBattle();
  });

  it('sets and reads on-field subsets for both sides', () => {
    const s = useSessionStore.getState();
    s.setMyOnField(['pikachu', 'incineroar']);
    s.setOpponentOnField(['miraidon']);
    const next = useSessionStore.getState();
    expect(next.myOnField).toEqual(['pikachu', 'incineroar']);
    expect(next.opponentOnField).toEqual(['miraidon']);
  });

  it('prunes myOnField to the new brought-four when active-four changes', () => {
    const s = useSessionStore.getState();
    s.setMyOnField(['pikachu', 'incineroar']);
    s.setMyActiveFour(['pikachu', 'gardevoir', 'fluttermane', 'urshifu']);
    expect(useSessionStore.getState().myOnField).toEqual(['pikachu']);
  });

  it('prunes opponentOnField to the new brought-four when active-four changes', () => {
    const s = useSessionStore.getState();
    s.setOpponentOnField(['miraidon', 'fluttermane']);
    s.setOpponentActiveFour(['fluttermane', 'ironhands', 'amoonguss', 'rillaboom']);
    expect(useSessionStore.getState().opponentOnField).toEqual(['fluttermane']);
  });

  it('toggles your Mega/Tera flags, creating the entry on first flip', () => {
    const s = useSessionStore.getState();
    s.toggleMyMega('gardevoir');
    expect(useSessionStore.getState().myBattleState.gardevoir).toEqual({ megaActivated: true });
    s.toggleMyTera('gardevoir');
    expect(useSessionStore.getState().myBattleState.gardevoir).toEqual({
      megaActivated: true,
      teraActivated: true,
    });
    s.toggleMyMega('gardevoir');
    expect(useSessionStore.getState().myBattleState.gardevoir).toEqual({
      megaActivated: false,
      teraActivated: true,
    });
  });

  it('toggles opponent slot Mega/Tera by species id', () => {
    const s = useSessionStore.getState();
    s.setOpponent(makeOpponent(['miraidon', 'fluttermane']));
    s.toggleOpponentMega('fluttermane');
    s.toggleOpponentTera('fluttermane');
    const slots = useSessionStore.getState().opponent!.slots;
    expect(slots[0].megaActivated).toBeUndefined();
    expect(slots[1].megaActivated).toBe(true);
    expect(slots[1].teraActivated).toBe(true);
  });

  it('no-ops opponent toggles when opponent is null or no slot matches', () => {
    const s = useSessionStore.getState();
    s.toggleOpponentMega('miraidon');
    expect(useSessionStore.getState().opponent).toBeNull();
    s.setOpponent(makeOpponent(['miraidon']));
    s.toggleOpponentTera('nonexistent');
    expect(useSessionStore.getState().opponent!.slots[0].teraActivated).toBeUndefined();
  });

  it('newBattle resets the Phase B state', () => {
    const s = useSessionStore.getState();
    s.setMyOnField(['pikachu']);
    s.setOpponentOnField(['miraidon']);
    s.toggleMyMega('gardevoir');
    s.newBattle();
    const next = useSessionStore.getState();
    expect(next.myOnField).toEqual([]);
    expect(next.opponentOnField).toEqual([]);
    expect(next.myBattleState).toEqual({});
  });
});
