import React, { useState } from 'react';
import { Button } from '../../ui';
import { opponentTeamFromPaste } from './pasteOpponent';
import type { OpponentTeam, PokemonSet } from '../../../shared/types';

export interface PasteInputProps {
  /** Called with the confirmed team + exact sets when a paste builds ≥1 slot. */
  onBuild: (team: OpponentTeam, sets: Record<string, PokemonSet>) => void;
}

/**
 * PokePaste detection source: paste an opponent's Showdown export to skip the
 * CLIP pipeline and build a fully-confirmed `OpponentTeam` (with exact sets, so
 * the analysis calcs against the real spreads). Parse/legality notes are shown
 * but never block the build.
 */
export function PasteInput({ onBuild }: PasteInputProps) {
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [built, setBuilt] = useState<number | null>(null);

  const build = () => {
    const { team, sets, errors, count } = opponentTeamFromPaste(text);
    setNotes(errors.map((e) => e.message));
    setBuilt(count);
    if (count > 0) onBuild(team, sets);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          'Paste the opponent’s team (PokePaste / Showdown export)…\n\n' +
          'Incineroar @ Safety Goggles\nAbility: Intimidate\nTera Type: Grass\n- Fake Out\n- Knock Off\n…'
        }
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: 180,
          resize: 'vertical',
          font: '12px/1.5 var(--font-mono, monospace)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
        }}
      />
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Button onClick={build} disabled={!text.trim()}>
          Build opponent from paste
        </Button>
        {built !== null && (
          <span style={{ fontSize: 12, color: 'var(--text-mut)' }}>
            {built > 0 ? `Built ${built} of 6 — analysis updated below.` : 'No Pokémon parsed.'}
          </span>
        )}
      </div>
      {notes.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 11,
            color: 'var(--poke-red)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
