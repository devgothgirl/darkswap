// The pool section renders on the DarkSwap design system. The rest of the site
// has not been migrated yet and keeps its own theme variables, so the design
// system's dark tokens are applied to the pool's root element only, read from
// the package's exported tokens rather than copied.
import type { CSSProperties } from 'react';
import { tokens } from '@workspace/darkswap-design-system/tokens';

function hexToHslTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = Math.round(h * 60 + 360) % 360;
  return `${h} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%`;
}

const kebab = (key: string) => key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

export const poolThemeStyle: CSSProperties = (() => {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens.color.dark)) vars[`--${kebab(key)}`] = hexToHslTriplet(value);
  // Borders on filled controls: the package derives them from the fill.
  vars['--primary-border'] = `hsl(${vars['--primary']})`;
  vars['--card-border'] = vars['--border'];
  vars['--popover-border'] = vars['--border'];
  vars['--app-font-sans'] = tokens.fontFamily.sans.join(', ');
  vars['--app-font-mono'] = tokens.fontFamily.mono.join(', ');
  vars['--radius'] = tokens.radius;
  return { ...vars, colorScheme: 'dark' } as CSSProperties;
})();
