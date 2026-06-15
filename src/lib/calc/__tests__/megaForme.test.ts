import { describe, it, expect } from 'vitest';
import { defaultMegaForme, megaFormesOf, resolveMegaForme } from '../megaForme';

describe('resolveMegaForme', () => {
  it('resolves a held Mega Stone to its forme (by display name or id)', () => {
    expect(resolveMegaForme('Charizard', 'Charizardite Y')).toBe('Charizard-Mega-Y');
    expect(resolveMegaForme('Charizard', 'charizarditey')).toBe('Charizard-Mega-Y');
    expect(resolveMegaForme('Mawile', 'Mawilite')).toBe('Mawile-Mega');
  });

  it('resolves the revived Floette-Eternal Mega', () => {
    expect(resolveMegaForme('Floette-Eternal', 'Floettite')).toBe('Floette-Mega');
  });

  it('returns null for a stone belonging to a different species', () => {
    expect(resolveMegaForme('Mawile', 'Charizardite Y')).toBeNull();
  });

  it('returns null for a non-stone item', () => {
    expect(resolveMegaForme('Charizard', 'Lum Berry')).toBeNull();
  });

  it('returns null when there is no item', () => {
    expect(resolveMegaForme('Charizard', undefined)).toBeNull();
    expect(resolveMegaForme('Charizard', '')).toBeNull();
  });
});

describe('megaFormesOf / defaultMegaForme', () => {
  it('lists every Mega forme of a species in dex order', () => {
    expect(megaFormesOf('Charizard')).toEqual(['Charizard-Mega-X', 'Charizard-Mega-Y']);
    expect(megaFormesOf('Gardevoir')).toEqual(['Gardevoir-Mega']);
  });

  it('works from a Mega forme name too', () => {
    expect(megaFormesOf('Charizard-Mega-Y')).toEqual(['Charizard-Mega-X', 'Charizard-Mega-Y']);
  });

  it('excludes look-alike formes the dex does not flag as Mega', () => {
    expect(megaFormesOf('Lucario')).toEqual(['Lucario-Mega']);
  });

  it('returns nothing for a species that cannot Mega', () => {
    expect(megaFormesOf('Flutter Mane')).toEqual([]);
    expect(defaultMegaForme('Flutter Mane')).toBeNull();
  });

  it('defaults to the first Mega forme when the stone is unknown', () => {
    expect(defaultMegaForme('Charizard')).toBe('Charizard-Mega-X');
    expect(defaultMegaForme('Mawile')).toBe('Mawile-Mega');
  });
});
