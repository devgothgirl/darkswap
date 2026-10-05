// Guards the one rule that keeps this site's colours from drifting: the theme
// comes from the design system, and nothing here redefines or shadows it.
//
// Fails when a stylesheet
//   1. reads a custom property that nothing defines (the way the retired
//      --ds-* brand aliases silently broke every rule that still used them),
//   2. declares a design-system role token, or
//   3. pulls Tailwind in a second time instead of through the shared import.
//
// Run: node scripts/check-theme-tokens.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appDir, '..', '..');
const designSystemCss = join(
  repoRoot,
  'artifacts/darkswap-design-system/src/index.css',
);

// The theme's own variables. Declared in the generated design-system
// stylesheet, so they are read from it rather than restated here.
const roleTokens = new Set(
  [...readFileSync(designSystemCss, 'utf8').matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(
    (m) => m[1],
  ),
);

// Defined by Tailwind, a library, or the browser at runtime.
const runtimePrefixes = ['--tw-', '--radix-', '--swiper-', '--privy-'];

function sourceFiles(dir, extensions) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full, extensions);
    return extensions.some((e) => full.endsWith(e)) ? [full] : [];
  });
}

const srcDir = join(appDir, 'src');
const files = sourceFiles(srcDir, ['.css']);
const defined = new Set(roleTokens);
for (const file of files) {
  for (const m of readFileSync(file, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) {
    defined.add(m[1]);
  }
}
// Components may set a custom property through an inline style object.
for (const file of sourceFiles(srcDir, ['.tsx', '.ts'])) {
  for (const m of readFileSync(file, 'utf8').matchAll(/['"](--[\w-]+)['"]\s*:/g)) {
    defined.add(m[1]);
  }
}

const problems = [];
for (const file of files) {
  const where = relative(appDir, file);
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const at = `${where}:${index + 1}`;

      for (const m of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
        const name = m[1];
        if (defined.has(name)) continue;
        if (runtimePrefixes.some((p) => name.startsWith(p))) continue;
        problems.push(`${at} reads ${name}, which nothing defines`);
      }

      for (const m of line.matchAll(/(^|[;{\s])(--[\w-]+)\s*:/g)) {
        const name = m[2];
        if (!roleTokens.has(name)) continue;
        // Fonts are this site's one recorded exception; see src/index.css.
        if (name.startsWith('--app-font-')) continue;
        problems.push(
          `${at} declares ${name}, a design-system token -- edit tokens.json instead`,
        );
      }

      if (/@import\s+["']tailwindcss/.test(line)) {
        problems.push(
          `${at} imports Tailwind directly -- it already arrives with the design system's styles.css`,
        );
      }
    });
}

if (problems.length) {
  console.error(
    `Theme check failed (${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}):`,
  );
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`Theme check passed: ${files.length} stylesheets read only defined variables.`);
