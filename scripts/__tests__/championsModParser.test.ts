import { describe, it, expect } from 'vitest';
import { parseModOverrides, parseFormatsDataOverrides } from '../championsModParser';

const SAMPLE_FORMATS_DATA = `
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

const SAMPLE_ITEMS = `
export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
\tassaultvest: {
\t\tinherit: true,
\t\tisNonstandard: "Past",
\t},
\tblueorb: {
\t\tinherit: true,
\t\tisNonstandard: null,
\t},
};
`;

describe('parseModOverrides', () => {
  it('extracts recognized string-literal fields keyed by id', () => {
    const overrides = parseModOverrides(SAMPLE_FORMATS_DATA, 'FormatsData', new Set(['isNonstandard', 'tier']));
    expect(overrides.lopunny).toEqual({ tier: 'UU' });
    expect(overrides.lopunnymega).toEqual({ tier: 'OU' });
    expect(overrides.fluttermane).toEqual({ isNonstandard: 'Past', tier: 'Illegal' });
    expect(overrides.arceusbug).toEqual({ isNonstandard: 'Past' });
  });

  it('handles string-literal property names and ignores unrecognized fields', () => {
    const overrides = parseModOverrides(SAMPLE_FORMATS_DATA, 'FormatsData', new Set(['isNonstandard', 'tier']));
    expect(overrides['some-quoted-id']).toEqual({ tier: 'RU' });
    expect(overrides['some-quoted-id']).not.toHaveProperty('doublesTier');
  });

  it('parses explicit `null` literals as null rather than dropping the field', () => {
    const overrides = parseModOverrides(SAMPLE_ITEMS, 'Items', new Set(['isNonstandard']));
    expect(overrides.assaultvest).toEqual({ isNonstandard: 'Past' });
    expect(overrides.blueorb).toEqual({ isNonstandard: null });
    expect(overrides.blueorb).toHaveProperty('isNonstandard', null);
  });

  it('throws if the named export is not found (upstream format changed)', () => {
    expect(() =>
      parseModOverrides('export const SomethingElse = {};', 'FormatsData', new Set(['isNonstandard', 'tier'])),
    ).toThrow(/no `export const FormatsData/);
  });
});

describe('parseFormatsDataOverrides', () => {
  it('extracts isNonstandard/tier overrides keyed by species id', () => {
    const overrides = parseFormatsDataOverrides(SAMPLE_FORMATS_DATA);
    expect(overrides.lopunny).toEqual({ tier: 'UU' });
    expect(overrides.fluttermane).toEqual({ isNonstandard: 'Past', tier: 'Illegal' });
  });

  it('throws if no FormatsData export is found (upstream format changed)', () => {
    expect(() => parseFormatsDataOverrides('export const SomethingElse = {};')).toThrow(
      /no `export const FormatsData/,
    );
  });
});
