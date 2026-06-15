/**
 * Parser for the `champions` mod's formats-data.ts (smogon/pokemon-showdown),
 * used by scripts/buildChampionsLegality.ts (R5).
 *
 * Node-only — uses the TypeScript compiler API to walk the exported
 * `FormatsData` object-literal AST without `eval`/`require`-ing untrusted
 * source. Never imported by the renderer (typescript is a devDependency).
 */
import * as ts from 'typescript';
import type { ChampionsFormatOverride } from '../src/lib/detection/championsLegality';

/** The only formats-data.ts fields R5's legality derivation cares about. */
const RECOGNIZED_FIELDS = new Set<keyof ChampionsFormatOverride>(['isNonstandard', 'tier']);

function propName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw new Error(`Unsupported property name kind: ${ts.SyntaxKind[name.kind]}`);
}

/**
 * Parse `export const FormatsData: ... = { speciesid: { isNonstandard?: "...",
 * tier?: "...", ... }, ... }` into `{ speciesid: { isNonstandard?, tier? } }`.
 *
 * Only string-literal `isNonstandard`/`tier` fields are extracted; other fields
 * (doublesTier, etc.) and non-string-literal values are ignored. As of the R5
 * spike, champions/formats-data.ts has no `inherit`/computed entries — every
 * top-level property is `id: { ...string literals... }`.
 */
export function parseFormatsDataOverrides(source: string): Record<string, ChampionsFormatOverride> {
  const sourceFile = ts.createSourceFile('formats-data.ts', source, ts.ScriptTarget.Latest, true);
  const overrides: Record<string, ChampionsFormatOverride> = {};

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'FormatsData') continue;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;

      for (const prop of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) {
          continue;
        }
        const speciesId = propName(prop.name);
        const entry: Record<string, string> = {};
        for (const field of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(field)) continue;
          const fieldName = propName(field.name);
          if (!ts.isStringLiteral(field.initializer)) continue;
          if (!RECOGNIZED_FIELDS.has(fieldName as keyof ChampionsFormatOverride)) continue;
          entry[fieldName] = field.initializer.text;
        }
        overrides[speciesId] = entry;
      }
    }
  }

  if (Object.keys(overrides).length === 0) {
    throw new Error(
      'parseFormatsDataOverrides: no `export const FormatsData = {...}` object literal found — ' +
        'source format may have changed upstream',
    );
  }

  return overrides;
}
