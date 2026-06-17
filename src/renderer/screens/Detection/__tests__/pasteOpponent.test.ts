/**
 * pasteOpponent: a known PokePaste must yield a fully-confirmed OpponentTeam plus
 * an exact-set map keyed by species id.
 */
import { describe, it, expect } from 'vitest';
import { opponentTeamFromPaste } from '../pasteOpponent';

const PASTE = `Incineroar @ Safety Goggles
Ability: Intimidate
Level: 50
Tera Type: Grass
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
- Fake Out
- Knock Off
- Parting Shot
- Flare Blitz

Rotom-Wash @ Sitrus Berry
Ability: Levitate
Level: 50
Tera Type: Water
EVs: 252 HP / 4 Def / 252 SpD
Calm Nature
- Hydro Pump
- Thunderbolt
- Will-O-Wisp
- Protect`;

describe('opponentTeamFromPaste', () => {
  it('builds a confirmed team + exact-set map from a paste', () => {
    const { team, sets, count, errors } = opponentTeamFromPaste(PASTE, () => 123);

    expect(count).toBe(2);
    expect(team.detectedAt).toBe(123);
    expect(team.slots.map((s) => s.speciesId)).toEqual(['incineroar', 'rotomwash']);
    // Every slot is confirmed with full confidence + seeded item/ability/tera.
    for (const slot of team.slots) {
      expect(slot.candidates).toEqual([{ speciesId: slot.speciesId, confidence: 1 }]);
    }
    expect(team.slots[0].item).toBe('Safety Goggles');
    expect(team.slots[0].ability).toBe('Intimidate');
    expect(team.slots[1].teraType).toBe('Water');

    // Exact sets are keyed by resolved species id and carry the real spread/moves.
    expect(sets.rotomwash.moves).toContain('Hydro Pump');
    expect(sets.incineroar.evs?.spd).toBe(252);
    // Both species resolve, so there are no *parse* failures (legality notes,
    // which are non-blocking, may still appear and don't affect the team).
    expect(errors.every((e) => !e.message.includes('Could not parse'))).toBe(true);
  });

  it('reports unresolved blocks without throwing', () => {
    const { team, count, errors } = opponentTeamFromPaste('Notamon @ Leftovers\n- Tackle');
    expect(count).toBe(0);
    expect(team.slots).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });
});
