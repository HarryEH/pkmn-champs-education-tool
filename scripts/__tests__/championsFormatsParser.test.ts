import { describe, it, expect } from 'vitest';
import { parseFormatsDataOverrides } from '../championsFormatsParser';

const SAMPLE_SOURCE = `
export const FormatsData: import('../../../sim/dex-species').ModdedSpeciesFormatsDataTable = {
\tlopunny: {
\t\ttier: "UU",
\t},
\tlopunnymega: {
\t\ttier: "OU",
\t},
\tfluttermane: {
\t\tisNonstandard: "Past",
\t\ttier: "Illegal",
\t},
\tarceusbug: {
\t\tisNonstandard: "Past",
\t},
\t"some-quoted-id": {
\t\ttier: "RU",
\t\tdoublesTier: "DUU",
\t},
};
`;

describe('parseFormatsDataOverrides', () => {
  it('extracts isNonstandard/tier overrides keyed by species id', () => {
    const overrides = parseFormatsDataOverrides(SAMPLE_SOURCE);
    expect(overrides.lopunny).toEqual({ tier: 'UU' });
    expect(overrides.lopunnymega).toEqual({ tier: 'OU' });
    expect(overrides.fluttermane).toEqual({ isNonstandard: 'Past', tier: 'Illegal' });
    expect(overrides.arceusbug).toEqual({ isNonstandard: 'Past' });
  });

  it('handles string-literal property names and ignores unrecognized fields', () => {
    const overrides = parseFormatsDataOverrides(SAMPLE_SOURCE);
    expect(overrides['some-quoted-id']).toEqual({ tier: 'RU' });
    expect(overrides['some-quoted-id']).not.toHaveProperty('doublesTier');
  });

  it('throws if no FormatsData export is found (upstream format changed)', () => {
    expect(() => parseFormatsDataOverrides('export const SomethingElse = {};')).toThrow(
      /no `export const FormatsData/,
    );
  });
});
