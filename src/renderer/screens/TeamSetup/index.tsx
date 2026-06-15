import React, { useMemo, useState } from 'react';
import { Button, Card, Select } from '../../ui';
import { PokemonCard } from '../../components/PokemonCard';
import { createTeam, parsePokepaste, useTeamsStore, type ImportError } from '../../store/teams';
import { FIXTURE_POKEPASTE } from '../../../shared/fixtures';
import type { MyTeam } from '../../../shared/types';

/** Inline list of import errors (illegal/typo species, unparseable blocks). */
function ImportErrors({ errors }: { errors: ImportError[] }) {
  if (errors.length === 0) return null;
  return (
    <Card
      style={{
        borderColor: 'var(--poke-red)',
        background: 'color-mix(in srgb, var(--poke-red) 8%, var(--surface))',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--poke-red)', marginBottom: 'var(--space-2)' }}>
        {errors.length} problem{errors.length > 1 ? 's' : ''} importing this team
      </div>
      <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', fontSize: 13 }}>
        {errors.map((e) => (
          <li key={e.index}>{e.message}</li>
        ))}
      </ul>
    </Card>
  );
}

export function TeamSetupScreen() {
  const teams = useTeamsStore((s) => s.teams);
  const activeTeamId = useTeamsStore((s) => s.activeTeamId);
  const upsertTeam = useTeamsStore((s) => s.upsertTeam);
  const deleteTeam = useTeamsStore((s) => s.deleteTeam);
  const setActiveTeam = useTeamsStore((s) => s.setActiveTeam);

  const activeTeam = useMemo(() => teams.find((t) => t.id === activeTeamId), [teams, activeTeamId]);

  // Editor state. `editingId` non-null means "update this team in place".
  const [name, setName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Live preview parses on every keystroke (cheap; six mons).
  const preview = useMemo(() => parsePokepaste(pasteText), [pasteText]);

  // What to show in the gallery: the live editor preview if the user is
  // typing, otherwise the selected active team.
  const showingPreview = pasteText.trim().length > 0;
  const galleryMons = showingPreview ? preview.pokemon : (activeTeam?.pokemon ?? []);

  const resetEditor = () => {
    setName('');
    setPasteText('');
    setEditingId(null);
  };

  const handleSave = async () => {
    if (preview.pokemon.length === 0) return;
    setSaving(true);
    try {
      const team = createTeam(name, pasteText, editingId ?? undefined);
      await upsertTeam(team);
      setActiveTeam(team.id);
      resetEditor();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (team: MyTeam) => {
    setEditingId(team.id);
    setName(team.name);
    setPasteText(team.pokepaste);
  };

  const handleDelete = async (id: string) => {
    await deleteTeam(id);
    if (editingId === id) resetEditor();
  };

  const teamOptions = teams.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.pokemon.length})`,
  }));

  return (
    <div
      style={{
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
        maxWidth: 1100,
      }}
    >
      <header>
        <h1 style={{ margin: 0 }}>Team Setup</h1>
        <p style={{ color: 'var(--text-mut)', margin: '4px 0 0' }}>
          Paste a PokePaste / Showdown export, review the computed stats, and save your team.
        </p>
      </header>

      {/* Team picker + active selection */}
      {teams.length > 0 && (
        <Card title="Your teams">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-mut)' }}>Active:</span>
            <Select
              value={activeTeamId ?? ''}
              options={teamOptions}
              onChange={(id) => setActiveTeam(id)}
              style={{ minWidth: 220 }}
            />
            {activeTeam && (
              <>
                <Button variant="secondary" size="sm" onClick={() => handleEdit(activeTeam)}>
                  Edit / re-paste
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(activeTeam.id)}
                  style={{ color: 'var(--poke-red)' }}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* Import editor */}
      <Card
        title={editingId ? 'Edit team' : 'Import a team'}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setPasteText(FIXTURE_POKEPASTE)}>
            Load sample
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name"
            style={{
              font: 'inherit',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your Showdown export here..."
            spellCheck={false}
            rows={12}
            style={{
              font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Button onClick={handleSave} disabled={saving || preview.pokemon.length === 0}>
              {editingId ? 'Update team' : 'Save team'}
            </Button>
            {(pasteText.trim().length > 0 || editingId) && (
              <Button variant="ghost" size="sm" onClick={resetEditor}>
                Cancel
              </Button>
            )}
            {showingPreview && (
              <span style={{ fontSize: 12, color: 'var(--text-mut)' }}>
                {preview.pokemon.length} valid · {preview.errors.length} error
                {preview.errors.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </Card>

      {showingPreview && <ImportErrors errors={preview.errors} />}

      {/* Gallery of parsed Pokémon */}
      {galleryMons.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, margin: '0 0 var(--space-3)' }}>
            {showingPreview ? 'Preview' : (activeTeam?.name ?? 'Team')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {galleryMons.map((mon, i) => (
              <PokemonCard key={`${mon.set.species}-${i}`} mon={mon} />
            ))}
          </div>
        </section>
      )}

      {teams.length === 0 && galleryMons.length === 0 && (
        <p style={{ color: 'var(--text-mut)' }}>
          No teams yet — paste an export above (or “Load sample”) to get started.
        </p>
      )}
    </div>
  );
}
