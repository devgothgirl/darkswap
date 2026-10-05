import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { checkDirectory } from './check-retired-marketing-claims.mjs';

const policy = {
  retiredPhrases: ['no wallet connection', 'no wallet required'],
  allowedContexts: [{
    file: 'src/FAQ.tsx',
    text: 'No wallet connection is needed to create an order. You manually send the deposit yourself.',
    reason: 'Reviewed factual order-creation explanation.',
  }],
};

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'retired-claims-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('detects case variants and multiline claims with file/line diagnostics', (t) => {
  const root = fixture(t, { 'src/Hero.tsx': 'header\nNO WALLET CONNECTION required\nNo\n wallet required' });
  assert.deepEqual(checkDirectory(root, policy).problems, [
    'src/Hero.tsx:2: retired claim "no wallet connection"',
    'src/Hero.tsx:3: retired claim "no wallet required"',
  ]);
});

test('permits only one exact reviewed context in its exact file', (t) => {
  const root = fixture(t, { 'src/FAQ.tsx': policy.allowedContexts[0].text });
  assert.equal(checkDirectory(root, policy).problems.length, 0);
  writeFileSync(join(root, 'src/FAQ.tsx'), `${policy.allowedContexts[0].text}\nNo wallet connection required`);
  assert.equal(checkDirectory(root, policy).problems.length, 1);
  writeFileSync(join(root, 'src/FAQ.tsx'), `${policy.allowedContexts[0].text}\n${policy.allowedContexts[0].text}`);
  assert.equal(checkDirectory(root, policy).problems.length, 1);
});

test('rejects copied and edited exceptions', (t) => {
  const root = fixture(t, {
    'src/Hero.tsx': policy.allowedContexts[0].text,
    'src/FAQ.tsx': policy.allowedContexts[0].text.replace('manually', 'automatically'),
  });
  assert.equal(checkDirectory(root, policy).problems.length, 2);
});

test('scans assets and documentation, skips generated output and dependencies', (t) => {
  const root = fixture(t, {
    'src/Card.tsx': 'Creating an order moves no funds',
    'public/banner.svg': '<text>No wallet required</text>',
    'README.md': 'No wallet connection',
    'node_modules/example/index.js': 'No wallet connection',
    'dist/index.html': 'No wallet required',
  });
  const result = checkDirectory(root, policy);
  assert.equal(result.files, 3);
  assert.equal(result.problems.length, 2);
});

test('new phrases in the policy are enforced without editing the scanner', (t) => {
  const root = fixture(t, { 'src/Card.tsx': 'Guaranteed anonymity' });
  assert.equal(checkDirectory(root, { ...policy, retiredPhrases: ['guaranteed anonymity'] }).problems.length, 1);
});

test('fails closed on empty roots and malformed policies', (t) => {
  const root = fixture(t, {});
  assert.throws(() => checkDirectory(root, policy), /No source files/);
  assert.throws(() => checkDirectory(root, { retiredPhrases: [] }), /policy/);
  assert.throws(() => checkDirectory(root, { ...policy, allowedContexts: [{ file: 'src/FAQ.tsx' }] }), /review reason/);
});

test('CLI returns nonzero for retired claims and zero for safe copy', (t) => {
  const root = fixture(t, { 'src/Card.tsx': 'No wallet required' });
  const invoke = () => spawnSync(process.execPath, [
    '--input-type=module', '-e',
    `import { runCheck } from ${JSON.stringify(new URL('./check-retired-marketing-claims.mjs', import.meta.url).href)}; process.exitCode = runCheck(${JSON.stringify(root)});`,
  ], { encoding: 'utf8' });
  const failed = invoke();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /src\/Card.tsx:1/);
  writeFileSync(join(root, 'src/Card.tsx'), 'Creating an order moves no funds');
  assert.equal(invoke().status, 0);
});