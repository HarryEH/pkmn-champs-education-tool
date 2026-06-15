import { describe, it, expect } from 'vitest';
import { resolveMegaForme } from '../megaForme';

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
