import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkTerms, originTerms, SOLANA_NETWORK_TERMS, withArticle } from './origin-terms';

const NATIVE_SOL = { id: 'nep141:sol.omft.near', symbol: 'SOL' };
const USDC_SOL = { id: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' };
const ETH_ARB = { id: 'nep141:arb.omft.near', symbol: 'ETH', chain: 'arb', chainName: 'Arbitrum', native: true };
const USDC_BASE = { id: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', chain: 'base', chainName: 'Base', contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', native: false };
const USDT_BSC = { id: 'nep245:v2_1.omni.hot.tg:56_2CMMyVTGZkeyNZTSvS5sarzfir6g', symbol: 'USDT', chain: 'bsc', chainName: 'BNB Chain', contractAddress: '0x55d398326f99059ff775485246999027b3197955', native: false };

test('receipts saved before multi-network origins keep the Solana wording', () => {
  // Legacy tokens carry no chain, native or originEligible fields.
  const sol = originTerms(NATIVE_SOL);
  assert.equal(sol.kind, 'native');
  assert.equal(sol.network, 'Solana');
  assert.equal(sol.networkLabel, 'Solana network');
  assert.equal(sol.transferKind, 'native SOL');
  assert.equal(sol.assetDescription, 'Native SOL (not an SPL token)');
  const usdc = originTerms(USDC_SOL);
  assert.equal(usdc.kind, 'token');
  assert.equal(usdc.tokenTransfer, 'SPL token transfer');
  assert.equal(usdc.contractLabel, 'Token mint');
  assert.equal(usdc.contract, USDC_SOL.contractAddress);
  assert.deepEqual(SOLANA_NETWORK_TERMS, networkTerms(undefined));
});

test('native status comes from the exact asset identity, never from a missing contract', () => {
  assert.equal(originTerms({ id: 'nep141:sol-unknown.omft.near', symbol: 'XYZ' }).kind, 'unknown');
  assert.equal(originTerms({ id: 'nep141:base-unlisted.omft.near', symbol: 'XYZ', chain: 'base', chainName: 'Base' }).kind, 'unknown');
  // An explicit flag from the API wins over the legacy inference.
  assert.equal(originTerms({ ...NATIVE_SOL, chain: 'sol', chainName: 'Solana', native: false }).kind, 'unknown');
});

test('EVM origins use native and ERC-20 terms with exact contracts', () => {
  const eth = originTerms(ETH_ARB);
  assert.equal(eth.evm, true);
  assert.equal(eth.kind, 'native');
  assert.equal(eth.transferKind, 'native ETH');
  assert.equal(eth.assetDescription, 'Native ETH (not an ERC-20 token)');
  assert.equal(eth.networkLabel, 'Arbitrum network');
  const usdc = originTerms(USDC_BASE);
  assert.equal(usdc.kind, 'token');
  assert.equal(usdc.tokenTransfer, 'ERC-20 token transfer');
  assert.equal(usdc.contractLabel, 'Token contract');
  assert.equal(usdc.contractNoun, 'contract');
  assert.equal(usdc.assetDescription, USDC_BASE.contractAddress);
  // A network name that already says Chain is not doubled.
  assert.equal(originTerms(USDT_BSC).networkLabel, 'BNB Chain');
  for (const token of [ETH_ARB, USDC_BASE, USDT_BSC]) {
    assert.doesNotMatch(JSON.stringify(originTerms(token)), /Solana|SPL/, token.id);
  }
});

test('network names take the right indefinite article', () => {
  assert.deepEqual(['Ethereum', 'Arbitrum', 'Optimism', 'Base', 'Polygon', 'BNB Chain', 'Solana'].map(withArticle),
    ['an Ethereum', 'an Arbitrum', 'an Optimism', 'a Base', 'a Polygon', 'a BNB Chain', 'a Solana']);
});
