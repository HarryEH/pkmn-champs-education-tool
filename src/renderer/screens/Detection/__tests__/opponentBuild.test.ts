import { describe, expect, it } from 'vitest';
import type { SpeciesUsage, UsageData } from '../../../../shared/types';
import { defaultVariant, usageVariants } from '../opponentBuild';

function speciesUsage(speciesId: string, usage: number): SpeciesUsage {
  return { speciesId, usage, items: [], abilities: [], teraTypes: [], moves: [], spreads: [] };
}

function usageData(entries: Record<string, number>): UsageData {
  const species: Record<string, SpeciesUsage> = {};
  for (const [name, u] of Object.entries(entries)) species[name] = speciesUsage(name, u);
  return { format: 'gen9championsvgc2026regma', month: '2026-06', fetchedAt: 0, species };
}

describe('usageVariants', () => {
  it('returns just the base for a non-Mega species', () => {
    const variants = usageVariants('incineroar', usageData({ Incineroar: 0.26 }));
    expect(variants).toHaveLength(1);
    expect(variants[0]).toMatchObject({ speciesId: 'incineroar', label: 'Incineroar', isMega: false });
  });

  it('lists the base plus every Mega forme, with the base labelled "(base)"', () => {
    const variants = usageVariants('charizard', usageData({}));
    // Charizard has two Mega formes (X and Y).
    expect(variants.map((v) => v.speciesId)).toEqual(['charizard', 'charizardmegax', 'charizardmegay']);
    expect(variants[0].label).toBe('Charizard (base)');
    expect(variants[1].isMega).toBe(true);
  });

  it('attaches each forme’s own usage entry', () => {
    const variants = usageVariants(
      'charizard',
      usageData({ Charizard: 0.001, 'Charizard-Mega-Y': 0.318, 'Charizard-Mega-X': 0.02 }),
    );
    const y = variants.find((v) => v.speciesId === 'charizardmegay');
    expect(y?.usagePct).toBeCloseTo(0.318);
    expect(variants.find((v) => v.speciesId === 'charizard')?.usagePct).toBeCloseTo(0.001);
  });
});

describe('defaultVariant', () => {
  it('prefers the dominant Mega when it out-usages the base', () => {
    const variants = usageVariants(
      'charizard',
      usageData({ Charizard: 0.001, 'Charizard-Mega-Y': 0.318, 'Charizard-Mega-X': 0.02 }),
    );
    expect(defaultVariant(variants)?.speciesId).toBe('charizardmegay');
  });

  it('keeps the base when it out-usages its Mega (e.g. Glimmora)', () => {
    const variants = usageVariants('glimmora', usageData({ Glimmora: 0.068, 'Glimmora-Mega': 0.035 }));
    expect(defaultVariant(variants)?.isMega).toBe(false);
  });

  it('falls back to the base when no forme has usage data', () => {
    const variants = usageVariants('charizard', usageData({}));
    expect(defaultVariant(variants)?.speciesId).toBe('charizard');
  });
});
