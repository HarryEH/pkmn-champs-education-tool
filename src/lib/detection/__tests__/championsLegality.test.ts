import { describe, it, expect } from 'vitest';
import {
  deriveLegality,
  buildLegalityIndex,
  isChampionsLegal,
  type LegalitySpeciesInput,
  type ChampionsLegalityTable,
} from '../championsLegality';

function species(overrides: Partial<LegalitySpeciesInput> = {}): LegalitySpeciesInput {
  return {
    id: 'testmon',
    name: 'Testmon',
    tier: 'OU',
    isNonstandard: null,
    tags: [],
    ...overrides,
  };
}

describe('deriveLegality', () => {
  it('legalizes a species champions reinstates via a tier-only override (Lopunny)', () => {
    // Base dex: pre-SV species are marked isNonstandard "Past" with tier "Illegal",
    // but champions/formats-data.ts overrides just the tier.
    const lopunny = species({ id: 'lopunny', name: 'Lopunny', tier: 'Illegal', isNonstandard: 'Past' });
    const entry = deriveLegality(lopunny, { tier: 'UU' });
    expect(entry).toEqual({
      speciesId: 'lopunny',
      name: 'Lopunny',
      legal: true,
      tier: 'UU',
      isNonstandard: 'Past',
    });
  });

  it('bans a species champions explicitly demotes via tier override (Flutter Mane)', () => {
    const fluttermane = species({ id: 'fluttermane', name: 'Flutter Mane', tier: 'Uber' });
    const entry = deriveLegality(fluttermane, { isNonstandard: 'Past', tier: 'Illegal' });
    expect(entry.legal).toBe(false);
    expect(entry.tier).toBe('Illegal');
  });

  it('bans Mythical/Restricted Legendary species via tags regardless of tier', () => {
    const mew = species({ id: 'mew', name: 'Mew', tier: 'UU', tags: ['Mythical'] });
    expect(deriveLegality(mew, undefined).legal).toBe(false);

    const calyrex = species({ id: 'calyrex', name: 'Calyrex', tier: 'OU', tags: ['Restricted Legendary'] });
    expect(deriveLegality(calyrex, { tier: 'OU' }).legal).toBe(false);
  });

  it('bans a species champions demotes via isNonstandard override even if tier stays non-Illegal', () => {
    // e.g. Arceus-Bug: champions sets isNonstandard: "Past" but leaves tier
    // unset, so it would fall back to a non-Illegal base tier (Uber) — the
    // isNonstandard override must still win.
    const arceusBug = species({ id: 'arceusbug', name: 'Arceus-Bug', tier: 'Uber' });
    const entry = deriveLegality(arceusBug, { isNonstandard: 'Past' });
    expect(entry.legal).toBe(false);
    expect(entry.tier).toBe('Uber');
    expect(entry.isNonstandard).toBe('Past');
  });

  it('falls back to base tier when champions has no override for the species', () => {
    const shellosEast = species({ id: 'shelloseast', name: 'Shellos-East', tier: 'LC' });
    expect(deriveLegality(shellosEast, undefined).legal).toBe(true);

    const burmySandy = species({ id: 'burmysandy', name: 'Burmy-Sandy', tier: 'Illegal', isNonstandard: 'Past' });
    expect(deriveLegality(burmySandy, undefined).legal).toBe(false);
  });

  it('treats CAP and Unreleased tiers as illegal', () => {
    expect(deriveLegality(species({ tier: 'CAP' }), undefined).legal).toBe(false);
    expect(deriveLegality(species({ tier: 'Unreleased' }), undefined).legal).toBe(false);
  });
});

describe('buildLegalityIndex / isChampionsLegal', () => {
  const table: ChampionsLegalityTable = {
    format: 'gen9championsvgc2026regma',
    generatedAt: '2026-06-15T00:00:00.000Z',
    source: 'test',
    entries: [
      { speciesId: 'lopunny', name: 'Lopunny', legal: true, tier: 'UU', isNonstandard: 'Past' },
      { speciesId: 'fluttermane', name: 'Flutter Mane', legal: false, tier: 'Illegal', isNonstandard: 'Past' },
    ],
  };

  it('looks up legality by speciesId', () => {
    const index = buildLegalityIndex(table);
    expect(isChampionsLegal(index, 'lopunny')).toBe(true);
    expect(isChampionsLegal(index, 'fluttermane')).toBe(false);
  });

  it('treats species absent from the table as illegal', () => {
    const index = buildLegalityIndex(table);
    expect(isChampionsLegal(index, 'not-a-real-species')).toBe(false);
  });
});
