import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { NearToken } from '@workspace/api-client-react';
import { flipTarget, MAX_ADDRESS_LENGTH, networksOf, readClipboardAddress, sourceTokenParams } from './near-route-form';

const token = (id: string, chain: string, chainName: string, originEligible?: boolean): NearToken =>
  ({ id, symbol: id.toUpperCase(), chain, chainName, decimals: 6, ...(originEligible === undefined ? {} : { originEligible }) });
const SOL = token('sol', 'sol', 'Solana', true);
const USDC_BASE = token('usdc-base', 'base', 'Base', true);
const BTC = token('btc', 'btc', 'Bitcoin', false);

test('the Privacy swap always asks for Solana origins; the bridge asks for every enabled origin', () => {
  assert.deepEqual(sourceTokenParams('solana', ''), { side: 'source', chain: 'sol' });
  assert.deepEqual(sourceTokenParams('solana', 'usdc'), { side: 'source', chain: 'sol', term: 'usdc' });
  assert.deepEqual(sourceTokenParams('bridge', 'usdc'), { side: 'source' });
});

test('a flip only sends from an enabled, origin-eligible catalog entry', () => {
  const sources = [SOL, USDC_BASE];
  assert.equal(flipTarget('bridge', USDC_BASE, sources), USDC_BASE);
  assert.equal(flipTarget('solana', USDC_BASE, sources), null);
  assert.equal(flipTarget('bridge', BTC, [...sources, BTC]), null);
  // Eligible in the destination list but not enabled as an origin here.
  assert.equal(flipTarget('bridge', token('eth-op', 'op', 'Optimism', true), sources), null);
  // Receipts and destinations without the flag never flip.
  assert.equal(flipTarget('bridge', token('sol', 'sol', 'Solana'), sources), null);
  assert.equal(flipTarget('bridge', USDC_BASE, undefined), null);
  assert.equal(flipTarget('bridge', null, sources), null);
});

test('networks come from the token list, once each, in catalog order', () => {
  assert.deepEqual(networksOf([USDC_BASE, SOL, token('eth-base', 'base', 'Base', true), BTC]),
    [{ id: 'base', name: 'Base' }, { id: 'sol', name: 'Solana' }, { id: 'btc', name: 'Bitcoin' }]);
});

test('clipboard reads are trimmed and fail silently', async () => {
  assert.equal(await readClipboardAddress({ readText: async () => '  0xabc  ' }), '0xabc');
  assert.equal(await readClipboardAddress({ readText: async () => '   ' }), null);
  assert.equal(await readClipboardAddress({ readText: async () => 'x'.repeat(MAX_ADDRESS_LENGTH + 1) }), null);
  assert.equal(await readClipboardAddress({ readText: async () => { throw new Error('denied'); } }), null);
  assert.equal(await readClipboardAddress({ readText: () => { throw new Error('no permission'); } }), null);
  assert.equal(await readClipboardAddress(undefined), null);
  assert.equal(await readClipboardAddress(null), null);
});
