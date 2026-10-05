import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('announcement shows only official identity and X, not a rewards proposal', async () => {
  const popup = await source('./src/components/token-launch-popup.tsx');
  assert.match(popup, /Unveiling Phase 2: Dark Pool/);
  assert.match(popup, /brand\/darkpool-phase-2\.jpg/);
  assert.match(popup, /CopyButton value=\{tokenIdentity.address\}/);
  assert.match(popup, /href="https:\/\/x.com\/darkswapapp" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(popup, /50%|rewards plan|creator.fee|flywheel|100,000|\/tokenomics|<TokenIdentity/);
  assert.match(popup, /darkpool-phase-2-v1-dismissed/);
  assert.match(popup, /sessionStorage\.setItem\(ANNOUNCEMENT_KEY, '1'\)/);
  assert.match(popup, /button-token-launch-close/);
  assert.match(popup, /button-token-launch-not-now/);
});

test('official token links preserve the exact mint and distinguish listing from reward funding', async () => {
  const identity = JSON.parse(await source('./src/token-identity.json'));
  const mint = '7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3';
  assert.equal(identity.address, mint);
  assert.equal(identity.explorerUrl, `https://solscan.io/token/${mint}`);
  assert.equal(identity.listingUrl, `https://www.stonkfun.xyz/token/${mint}`);
  const component = await source('./src/components/token-identity.tsx');
  assert.match(component, /href=\{tokenIdentity\.listingUrl\}/);
  assert.match(component, /CopyButton value=\{tokenIdentity\.address\}/);
  assert.match(component, /StonkFun reports \$DARK as graduated/);
  assert.match(component, /wNEAR rewards have been distributed to qualifying holders/);
  assert.match(component, /does not verify supply, mint\/freeze authorities, liquidity or reward funding/);
});