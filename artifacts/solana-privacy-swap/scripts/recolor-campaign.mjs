#!/usr/bin/env node
/**
 * One-off: move the site's colours onto the 2026 campaign palette.
 *
 * The campaign art is near-black, warm cream and a single violet. The site was
 * a lighter violet-on-ink theme with leftover lime, coral and teal values from
 * two earlier identities. This walks every colour literal in the stylesheets
 * and inline styles and maps it onto that palette:
 *
 *   surfaces (L <= 32)   -> deepened toward #07060b, violet-tinted
 *   lines   (32 < L<=55) -> dim violet-grey
 *   accents (55 < L<=80) -> brand violet ramp (#8b50e8 family)
 *   text     (L > 80)    -> warm cream, or pale violet when it carries hue
 *   reds                 -> kept as the one non-violet role
 *
 * Run with --dry to print the mapping without writing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv } from 'node:process';

const DRY = argv.includes('--dry');
const files = argv.filter(a => a.endsWith('.css') || a.endsWith('.tsx'));

const hexToRgb = (hex) => {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgbToHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100, max - min];
};
const hslToHex = (h, s, l) => {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return '#' + seg.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
};

// Values that carry meaning beyond hue and are set by hand.
const FIXED = {
  '#ffffff': '#ffffff', '#fff': '#ffffff', '#000': '#000000', '#000000': '#000000',
  '#c8ed78': '#8b50e8', '#d9ef79': '#8b50e8', '#d6ec78': '#8b50e8', '#dcf377': '#8b50e8',
  '#e0f47f': '#cdb4ff', '#bde484': '#9f6cf2',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function mapColor(hex) {
  const key = hex.toLowerCase();
  if (FIXED[key]) return FIXED[key];
  const [h, s, l, chroma] = rgbToHsl(hexToRgb(key));
  const isRed = chroma > 0.14 && (h >= 344 || h <= 14) && s > 30;
  if (isRed) {
    // One red, kept for genuine failure. Lift it so it reads on near-black.
    return hslToHex(354, 72, l < 52 ? 62 : clamp(l, 52, 78));
  }
  const hasHue = chroma > 0.055;
  if (l <= 32) {
    // Surfaces: deepen hard, keep a violet tint.
    return hslToHex(258, clamp(s * 0.7, 10, 34), clamp(l * 0.56, 2.5, 17));
  }
  if (l <= 55) {
    // Hairlines, dividers, dim chrome.
    return hslToHex(258, clamp(s * 0.6, 8, 32), clamp(l * 0.62, 14, 32));
  }
  if (l <= 80) {
    // Accents and secondary text.
    return hasHue
      ? hslToHex(264, clamp(s, 55, 82), clamp(l * 0.96, 52, 74))
      : hslToHex(262, 10, clamp(l * 0.92, 52, 70));
  }
  // Text: warm cream unless the colour deliberately carries violet.
  return hasHue
    ? hslToHex(265, clamp(s, 55, 85), clamp(l, 80, 90))
    : hslToHex(44, 16, clamp(l, 86, 96));
}

const mapping = new Map();
let changed = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let out = src.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => {
    if (m.length === 9 || m.length === 5) return m; // keep 8/4-digit alpha hex untouched
    const next = mapColor(m);
    if (next.toLowerCase() !== m.toLowerCase()) { mapping.set(m.toLowerCase(), next); changed++; }
    return next;
  });
  // rgb()/rgba() literals: same treatment, alpha preserved.
  out = out.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g, (m, r, g, b, a) => {
    const hex = '#' + [r, g, b].map(v => Number(v).toString(16).padStart(2, '0')).join('');
    const next = hexToRgb(mapColor(hex));
    changed++;
    return a === undefined ? `rgb(${next.join(', ')})` : `rgba(${next.join(', ')}, ${a})`;
  });
  if (!DRY && out !== src) writeFileSync(file, out);
}

const rows = [...mapping.entries()].sort();
console.log(`${files.length} files, ${changed} colour literals, ${rows.length} distinct hex mappings`);
for (const [from, to] of rows.slice(0, 40)) console.log(`  ${from} -> ${to}`);
if (DRY) console.log('(dry run, nothing written)');
