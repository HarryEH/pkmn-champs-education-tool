/**
 * Generic parser for `champions` mod data-table files (formats-data.ts, items.ts,
 * moves.ts, abilities.ts), used by scripts/buildChampions*.ts (R5/R6). All of
 * these share the shape:
 *
 *   export const <Name>: ... = {
 *     id: { inherit: true, <field>: "...", <field2>: null, ... },
 *     ...
 *   };
 *
 * Node-only — uses the TypeScript compiler API to walk the exported object-literal
 * AST without `eval`/`require`-ing untrusted source. Never imported by the
 * renderer (typescript is a devDependency).
 */
import * as ts from 'typescript';
import type { ChampionsFormatOverride } from '../src/lib/detection/championsLegality';

function propName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  throw new Error(`Unsupported property name kind: ${ts.SyntaxKind[name.kind]}`);
}

/** A recognized field's parsed value: a string literal, or `null` for an explicit `null` literal. */
type FieldValue = string | null;

/**
 * Parse `export const <exportName> = { id: { ...fields... }, ... }` into
 * `{ id: { ...only recognizedFields... } }`.
 *
 * Each recognized field is read as a string literal, or as `null` if the source
 * has an explicit `null` literal — champions/items.ts and abilities.ts use
 * `isNonstandard: null` to UN-ban past-gen items/abilities (e.g. Mega Stones),
 * so that's a meaningful value that must round-trip distinctly from "field
 * absent" (which means "defer to the base dex value"). Non-string/non-null
 * values and unrecognized fields are ignored.
 */
export function parseModOverrides<F extends string>(
  source: string,
  exportName: string,
  recognizedFields: ReadonlySet<F>,
): Record<string, Partial<Record<F, FieldValue>>> {
  const sourceFile = ts.createSourceFile(`${exportName}.ts`, source, ts.ScriptTarget.Latest, true);
  const overrides: Record<string, Partial<Record<F, FieldValue>>> = {};

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== exportName) continue;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;

      for (const prop of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) {
          continue;
        }
        const id = propName(prop.name);
        const entry: Partial<Record<F, FieldValue>> = {};
        for (const field of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(field)) continue;
          const fieldName = propName(field.name);
          if (!recognizedFields.has(fieldName as F)) continue;
          if (ts.isStringLiteral(field.initializer)) {
            entry[fieldName as F] = field.initializer.text;
          } else if (field.initializer.kind === ts.SyntaxKind.NullKeyword) {
            entry[fieldName as F] = null;
          }
        }
        overrides[id] = entry;
      }
    }
  }

  if (Object.keys(overrides).length === 0) {
    throw new Error(
      `parseModOverrides: no \`export const ${exportName} = {...}\` object literal found — ` +
        'source format may have changed upstream',
    );
  }

  return overrides;
}

const FORMATS_DATA_FIELDS = new Set<keyof ChampionsFormatOverride>(['isNonstandard', 'tier']);

/** Per-species `isNonstandard`/`tier` overrides from champions/formats-data.ts. */
export function parseFormatsDataOverrides(source: string): Record<string, ChampionsFormatOverride> {
  return parseModOverrides(source, 'FormatsData', FORMATS_DATA_FIELDS);
}

/**
 * Parse champions/learnsets.ts into `{ speciesId: [moveId, ...] }` — the set of
 * move ids each species can learn under the mod. The source shape is:
 *
 *   export const Learnsets: ... = {
 *     bulbasaur: { learnset: { tackle: ["9L1", ...], ... }, eventData: [...] },
 *     ...
 *   };
 *
 * Only the keys of each species' `learnset` sub-object are collected (the move
 * ids); the source-tag arrays and sibling fields (eventData, encounters) are
 * ignored. Champions' learnsets.ts as of R6 has no `inherit` entries — each
 * listed species carries its full own-level learnset (prevo-chain merging is the
 * caller's job, see buildChampionsLearnsets.ts).
 */
export function parseModLearnsets(source: string): Record<string, string[]> {
  const sourceFile = ts.createSourceFile('learnsets.ts', source, ts.ScriptTarget.Latest, true);
  const learnsets: Record<string, string[]> = {};

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'Learnsets') continue;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;

      for (const prop of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) {
          continue;
        }
        const speciesId = propName(prop.name);
        const learnsetProp = prop.initializer.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) &&
            propName(p.name) === 'learnset' &&
            ts.isObjectLiteralExpression(p.initializer),
        );
        const moveIds: string[] = [];
        if (learnsetProp && ts.isObjectLiteralExpression(learnsetProp.initializer)) {
          for (const moveProp of learnsetProp.initializer.properties) {
            if (ts.isPropertyAssignment(moveProp)) moveIds.push(propName(moveProp.name));
          }
        }
        learnsets[speciesId] = moveIds;
      }
    }
  }

  if (Object.keys(learnsets).length === 0) {
    throw new Error(
      'parseModLearnsets: no `export const Learnsets = {...}` object literal found — ' +
        'source format may have changed upstream',
    );
  }

  return learnsets;
}
