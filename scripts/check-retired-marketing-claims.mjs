import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '../artifacts/mockup-sandbox');
const policyPath = join(scriptDir, 'retired-marketing-claims.json');
const excludedDirectories = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.git', '.cache',
  '.replit-artifact',
]);
const textExtensions = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.css', '.scss',
  '.html', '.json', '.md', '.mdx', '.txt', '.svg', '.yaml', '.yml',
]);

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name) ? [] : sourceFiles(path);
    }
    return entry.isFile() && textExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function phrasePattern(phrase) {
  const words = phrase.trim().split(/\s+/).map(
    (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  // Match case-insensitively, including phrases wrapped across source lines.
  return new RegExp(`\\b${words.join('\\s+')}\\b`, 'gi');
}

export function checkDirectory(root = defaultRoot, policy = JSON.parse(readFileSync(policyPath, 'utf8'))) {
  if (!Array.isArray(policy.retiredPhrases) || !policy.retiredPhrases.length ||
      policy.retiredPhrases.some((phrase) => typeof phrase !== 'string' || !phrase.trim()) ||
      !Array.isArray(policy.allowedContexts)) {
    throw new Error('Retired-claims policy must contain nonempty retiredPhrases and allowedContexts arrays.');
  }
  for (const context of policy.allowedContexts) {
    if (!context.file || !context.text || !context.reason) {
      throw new Error('Every allowed context needs an exact file, text, and review reason.');
    }
  }
  const files = sourceFiles(root);
  if (!files.length) throw new Error(`No source files found in ${root}; refusing to report a pass.`);
  const problems = [];
  for (const file of files) {
    const path = relative(root, file).split('\\').join('/');
    const text = readFileSync(file, 'utf8');
    const allowedSpans = [];
    for (const context of policy.allowedContexts.filter((entry) => entry.file === path)) {
      const start = text.indexOf(context.text);
      // An exception covers one occurrence only, not a duplicate badge elsewhere.
      if (start !== -1) allowedSpans.push([start, start + context.text.length]);
    }
    for (const phrase of policy.retiredPhrases) {
      for (const match of text.matchAll(phrasePattern(phrase))) {
        if (allowedSpans.some(([start, end]) =>
          match.index >= start && match.index + match[0].length <= end)) continue;
        const line = text.slice(0, match.index).split('\n').length;
        problems.push(`${path}:${line}: retired claim "${phrase}"`);
      }
    }
  }
  return { files: files.length, problems };
}

export function runCheck(root = defaultRoot) {
  try {
    const result = checkDirectory(root);
    if (result.problems.length) {
      console.error(`Retired marketing claims check failed (${result.problems.length}):`);
      for (const problem of result.problems) console.error(`  ${problem}`);
      console.error('Use custody-fact copy, such as "Creating an order moves no funds". Policy: scripts/retired-marketing-claims.json');
      return 1;
    }
    console.log(`Retired marketing claims check passed: ${result.files} files scanned.`);
    return 0;
  } catch (error) {
    console.error(`Retired marketing claims check failed: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCheck();
}