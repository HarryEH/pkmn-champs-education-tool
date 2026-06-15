import type React from 'react';
import { Icons } from '@pkmn/img';

/**
 * Parse the inline-CSS declaration string that `Icons.getPokemon` returns
 * (e.g. `display:inline-block;width:40px;...;background:... -160px -2220px;`)
 * into a React style object. The icon is a single cell of a sprite sheet, so
 * the background-position carried in `style` is load-bearing — we must use it
 * verbatim rather than reconstructing it.
 */
export function cssStringToStyle(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;
    // camelCase the CSS property name for React's style object.
    const camel = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[camel] = value;
  }
  return style as React.CSSProperties;
}

/** React style object for a Pokémon's sprite-sheet icon, by species id or display name. */
export function pokemonIconStyle(speciesOrName: string): React.CSSProperties {
  const icon = Icons.getPokemon(speciesOrName);
  return cssStringToStyle(icon.style);
}
