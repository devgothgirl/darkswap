import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NearOrder, NearToken } from '@workspace/api-client-react';
import { DepositCard, InfoTips, SwapPair } from './waiting';
import { NearOrderReview } from './near-order-review';
import { originTerms } from '../lib/origin-terms';

// Markup recorded from these components before multi-network origins. The
// Houdini route and every Solana-funded receipt must render exactly as before.
const golden: Record<string, string> = JSON.parse(readFileSync(new URL('./__fixtures__/order-components.golden.json', import.meta.url), 'utf8'));
const html = (element: ReactElement) => renderToStaticMarkup(element);
const text = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const SOL_RECIPIENT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM_RECIPIENT = '0x1111111111111111111111111111111111111111';
const SOL_DEPOSIT = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const EVM_DEPOSIT = '0x2a5e0b8f6b1e3e9c4d7f00a1b2c3d4e5f6a7b8c9';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_BASE_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

// Receipts saved before multi-network origins carry no chain, native or originEligible fields.
const legacySol = { id: 'nep141:sol.omft.near', symbol: 'SOL' } as NearToken;
const legacyUsdc = { id: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', contractAddress: USDC_MINT } as NearToken;
const currentSol: NearToken = { ...legacySol, chain: 'sol', chainName: 'Solana', decimals: 9, native: true, originEligible: true };
const currentUsdc: NearToken = { ...legacyUsdc, chain: 'sol', chainName: 'Solana', decimals: 6, native: false, originEligible: true };
const usdcBase: NearToken = { id: `nep141:base-${USDC_BASE_CONTRACT}.omft.near`, symbol: 'USDC', chain: 'base', chainName: 'Base', decimals: 6, contractAddress: USDC_BASE_CONTRACT, native: false, originEligible: true };
const ethArb: NearToken = { id: 'nep141:arb.omft.near', symbol: 'ETH', chain: 'arb', chainName: 'Arbitrum', decimals: 18, native: true, originEligible: true };

const order = (from: NearToken, overrides: Partial<NearOrder> = {}): NearOrder => ({
  from, to: usdcBase, amountIn: '0.2', amountOut: '25.1', minAmountOut: '24.8', withdrawFee: '0.01', refundFee: '0.0001',
  recipient: EVM_RECIPIENT, refundTo: SOL_RECIPIENT, depositAddress: SOL_DEPOSIT,
  deadline: '2026-10-10T20:00:00.000Z', estimatedSeconds: 120, status: 'PENDING_DEPOSIT', ...overrides,
});
const noop = () => {};

test('Houdini order components render exactly as before', () => {
  assert.equal(html(<DepositCard amount="0.015" symbol="BTC" assetKind="unknown" address="bc1qexampledepositaddress000000000000" memo="MEMO-1" recipient={SOL_RECIPIENT} recipientTag="42" deadlineText="Oct 10, 2026, 1:00 PM" remainingText="12m 5s left"/>), golden.houdiniDeposit);
  assert.equal(html(<SwapPair inAmount="0.015" inSymbol="BTC" outAmount="10.5" outSymbol="SOL" estimated/>), golden.houdiniPair);
  assert.equal(html(<InfoTips assetKind="unknown" symbol="BTC" hasMemo={false}/>), golden.houdiniTips);
  assert.equal(html(<InfoTips assetKind="unknown" symbol="BTC" hasMemo/>), golden.houdiniTipsMemo);
});

test('Solana-funded tracking renders exactly as before, with or without origin metadata', () => {
  for (const [usdc, sol] of [[legacyUsdc, legacySol], [currentUsdc, currentSol]]) {
    const usdcOrigin = originTerms(usdc);
    const solOrigin = originTerms(sol);
    assert.equal(html(<DepositCard amount="25" symbol="USDC" assetKind={usdcOrigin.kind} mint={usdcOrigin.contract} origin={usdcOrigin} address={SOL_DEPOSIT} recipient={EVM_RECIPIENT} deadlineText="unused" deadlineInSidePanel actions={<button>Show</button>}/>), golden.solSplDeposit);
    assert.equal(html(<DepositCard amount="0.2" symbol="SOL" assetKind={solOrigin.kind} origin={solOrigin} address={SOL_DEPOSIT} memo="12345" recipient={EVM_RECIPIENT} deadlineText="unused" deadlineInSidePanel/>), golden.solNativeDeposit);
    assert.equal(html(<SwapPair tracking inAmount="25" inSymbol="USDC" outAmount="0.01" outSymbol="ETH" outNetwork="Base" inNetwork={usdcOrigin.network} estimated/>), golden.solTrackingPair);
    assert.equal(html(<InfoTips assetKind={usdcOrigin.kind} symbol="USDC" hasMemo={false} origin={usdcOrigin} contract={usdcOrigin.contract} showPrivacyTip tracking/>), golden.solTipsSpl);
    assert.equal(html(<InfoTips assetKind={solOrigin.kind} symbol="SOL" hasMemo origin={solOrigin} showPrivacyTip tracking/>), golden.solTipsNative);
  }
  // Callers that pass no origin keep the same Solana defaults.
  assert.equal(html(<DepositCard amount="25" symbol="USDC" assetKind="token" mint={USDC_MINT} address={SOL_DEPOSIT} recipient={EVM_RECIPIENT} deadlineText="unused" deadlineInSidePanel actions={<button>Show</button>}/>), golden.solSplDeposit);
  assert.equal(html(<InfoTips assetKind="native" symbol="SOL" hasMemo showPrivacyTip tracking/>), golden.solTipsNative);
});

test('live review of a Solana-funded receipt is unchanged, with or without origin metadata', () => {
  for (const sol of [legacySol, currentSol]) {
    assert.equal(html(<NearOrderReview order={order(sol)} accepted={false} canReview onAccept={noop}/>), golden.reviewSolNative);
  }
  for (const usdc of [legacyUsdc, currentUsdc]) {
    assert.equal(html(<NearOrderReview order={order(usdc)} accepted canReview onAccept={noop}/>), golden.reviewSolSpl);
  }
});

test('an ERC-20 deposit names the network, token contract and both EVM warnings', () => {
  const origin = originTerms(usdcBase);
  const deposit = text(html(<DepositCard amount="25" symbol="USDC" assetKind={origin.kind} mint={origin.contract} origin={origin} address={EVM_DEPOSIT} recipient={SOL_RECIPIENT} deadlineText="unused" deadlineInSidePanel/>));
  assert.match(deposit, /on the Base network as an ERC-20 token transfer to:/);
  assert.match(deposit, /BASE DEPOSIT WALLET · USDC \(ERC-20 TOKEN\)/);
  assert.match(deposit, new RegExp(`Token contract: ${USDC_BASE_CONTRACT}`));
  assert.match(deposit, /Send on Base only\. This address looks the same on every EVM network; funds sent on another network may not be recoverable\./);
  assert.match(deposit, new RegExp(`Send USDC as a token transfer from contract ${USDC_BASE_CONTRACT}\\.`));
  assert.match(deposit, /Send manually from your own Base wallet\./);
  const tips = text(html(<InfoTips assetKind={origin.kind} symbol="USDC" hasMemo={false} origin={origin} contract={origin.contract} showPrivacyTip tracking/>));
  assert.match(tips, /Send on Base only\..*Send USDC as a token transfer from contract/);
  assert.match(tips, /Base deposits are visible on-chain\./);
  const pair = text(html(<SwapPair tracking inAmount="25" inSymbol="USDC" outAmount="0.01" outSymbol="ETH" outNetwork="Arbitrum" inNetwork={origin.network} estimated/>));
  for (const output of [deposit, tips, pair]) assert.doesNotMatch(output, /Solana|SPL/);
});

test('a native EVM deposit asks for a plain transfer of the network coin', () => {
  const origin = originTerms(ethArb);
  const deposit = text(html(<DepositCard amount="0.01" symbol="ETH" assetKind={origin.kind} origin={origin} address={EVM_DEPOSIT} recipient={SOL_RECIPIENT} deadlineText="unused" deadlineInSidePanel/>));
  assert.match(deposit, /on the Arbitrum network as native ETH to:/);
  assert.match(deposit, /ARBITRUM DEPOSIT WALLET · NATIVE ETH/);
  assert.match(deposit, /Send on Arbitrum only\./);
  assert.match(deposit, /Send ETH as a plain transfer\./);
  assert.match(deposit, /Native ETH \(not an ERC-20 token\)/);
  assert.doesNotMatch(deposit, /Solana|SPL|Token contract/);
});

test('live review of an EVM-funded order shows the contract, refund network and public-origin notice', () => {
  const review = text(html(<NearOrderReview order={order(usdcBase, { to: ethArb, amountIn: '25', amountOut: '0.0098', minAmountOut: '0.0097', withdrawFee: '0.00002', refundFee: '0.03', recipient: EVM_RECIPIENT, refundTo: EVM_RECIPIENT, depositAddress: EVM_DEPOSIT })} accepted={false} canReview onAccept={noop}/>));
  assert.match(review, /Exact input 25 USDC · Base/);
  assert.match(review, new RegExp(`Origin asset ${usdcBase.id} ${USDC_BASE_CONTRACT} ERC-20 token transfer`));
  assert.match(review, /Possible refund fee 0\.03 USDC/);
  assert.match(review, /Withdrawal fee 0\.00002 ETH \(included in output\)/);
  assert.match(review, /Refund address · Base/);
  assert.match(review, /Base origin deposits are public\./);
  assert.doesNotMatch(review, /Solana|SPL/);
});
