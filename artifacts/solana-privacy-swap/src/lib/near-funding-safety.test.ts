import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NearOrder, NearServiceStatus } from '@workspace/api-client-react';
import { nearFundingReady, nearOrderFingerprint, nearRouteReady, type NearFundingReadiness } from './near-funding-safety';

const now = Date.parse('2026-10-01T12:00:00Z');
const route: NearServiceStatus = {
  sourceUrl: 'https://partners.near-intents.org/shield/status',
  lastSuccessAt: new Date(now - 1_000).toISOString(),
  freshUntil: new Date(now + 59_000).toISOString(),
  state: 'fresh', eligibility: 'allowed', reason: 'No matching reported incident.',
  activeIncidents: [], recentlyResolved: [],
};
const order: NearOrder = {
  requestId: 'bcfbe86a-4edf-4160-9f11-9e354b9221e8',
  depositAddress: '11111111111111111111111111111111', depositMemo: 'example-memo',
  from: { id: 'nep141:sol.omft.near', symbol: 'SOL', chain: 'sol', chainName: 'Solana', decimals: 9 },
  to: { id: 'nep141:eth.omft.near', symbol: 'ETH', chain: 'eth', chainName: 'Ethereum', decimals: 18 },
  amountIn: '1', amountOut: '0.05', minAmountOut: '0.0495',
  recipient: '0x1111111111111111111111111111111111111111',
  refundTo: 'So11111111111111111111111111111111111111112',
  deadline: new Date(now + 60_000).toISOString(), estimatedSeconds: 60,
  status: 'PENDING_DEPOSIT', routeStatus: route,
};
const ready: NearFundingReadiness = {
  order, acceptedFingerprint: nearOrderFingerprint(order),
  orderUpdatedAt: now - 1_000, orderError: false, orderFetchStatus: 'idle',
  routeStatus: route, routeUpdatedAt: now - 1_000, routeError: false, routeFetchStatus: 'idle',
  online: true, now,
};

test('fresh pending live terms with explicit exact review are necessary for funding', () => {
  assert.equal(nearFundingReady(ready), true);
  // A new page, recovered receipt, or directly opened URL starts unaccepted.
  for (const entry of ['new', 'recovered', 'direct', 'reload']) {
    assert.equal(nearFundingReady({ ...ready, acceptedFingerprint: null }), false, entry);
  }
  assert.equal(nearFundingReady({ ...ready, order: undefined }), false);
  assert.equal(nearFundingReady({ ...ready, acceptedFingerprint: 'other-order' }), false);
});

test('every material term invalidates prior review; polling metadata does not', () => {
  const changes: Partial<NearOrder>[] = [
    { requestId: 'different' }, { depositAddress: order.refundTo }, { depositMemo: 'changed' },
    { from: { ...order.from, contractAddress: 'different-mint' } },
    { from: { ...order.from, id: 'different-asset' } },
    { to: { ...order.to, chain: 'arb' } },
    { amountIn: '2' }, { amountOut: '0.06' }, { minAmountOut: '0.04' },
    { withdrawFee: '0.001' }, { refundFee: '0.01' },
    { recipient: 'different' }, { refundTo: order.depositAddress },
    { deadline: new Date(now + 120_000).toISOString() }, { estimatedSeconds: 120 },
  ];
  for (const change of changes) {
    const changed = { ...order, ...change };
    assert.notEqual(nearOrderFingerprint(changed), ready.acceptedFingerprint);
    assert.equal(nearFundingReady({ ...ready, order: changed }), false);
  }
  assert.equal(nearOrderFingerprint({
    ...order, status: 'PROCESSING', updatedAt: new Date(now).toISOString(),
    from: { ...order.from, price: 999 }, routeStatus: { ...route, eligibility: 'paused' },
  }), ready.acceptedFingerprint);
});

test('offline, error, paused and aged responses fail closed, including future timestamps', () => {
  const changes: Partial<NearFundingReadiness>[] = [
    { online: false }, { orderError: true }, { routeError: true },
    { orderFetchStatus: 'paused' }, { routeFetchStatus: 'paused' },
    { orderUpdatedAt: now - 30_001 }, { routeUpdatedAt: now - 30_001 },
    { orderUpdatedAt: 0 }, { routeUpdatedAt: 0 },
    { orderUpdatedAt: now + 1 }, { routeUpdatedAt: now + 1 },
    { orderUpdatedAt: NaN }, { routeUpdatedAt: NaN },
    { routeStatus: undefined },
  ];
  for (const change of changes) assert.equal(nearFundingReady({ ...ready, ...change }), false, JSON.stringify(change));
  assert.equal(nearFundingReady({ ...ready, orderUpdatedAt: now - 30_000 }), true);
});

test('partial, detected, processing and terminal states never invite a deposit', () => {
  for (const status of ['INCOMPLETE_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'SUCCESS', 'REFUNDED', 'FAILED', 'UNKNOWN']) {
    assert.equal(nearFundingReady({ ...ready, order: { ...order, status } }), false, status);
  }
  for (const deadline of [new Date(now).toISOString(), new Date(now - 1).toISOString(), 'invalid']) {
    const expired = { ...order, deadline };
    assert.equal(nearFundingReady({ ...ready, order: expired, acceptedFingerprint: nearOrderFingerprint(expired) }), false);
  }
});

test('route incident transitions revoke funding even when review and order remain current', () => {
  const blocked: Partial<NearServiceStatus>[] = [
    { eligibility: 'paused' }, { eligibility: 'unverified' },
    { state: 'stale' }, { state: 'invalid' }, { state: 'unavailable' },
    { freshUntil: new Date(now).toISOString() }, { freshUntil: null }, { freshUntil: 'invalid' },
  ];
  for (const change of blocked) {
    const status = { ...route, ...change };
    assert.equal(nearFundingReady({ ...ready, routeStatus: status }), false);
    // The creation/status response's newer blocked evidence also vetoes an
    // older independent "allowed" result.
    assert.equal(nearFundingReady({ ...ready, order: { ...order, routeStatus: status } }), false);
  }
  assert.equal(nearFundingReady(ready), true, 'fresh confirmed eligibility can restore already-reviewed terms');
  assert.equal(nearRouteReady({
    status: route, updatedAt: now, error: false, fetchStatus: 'idle', online: true, now: now + 60_000,
  }), false, 'time passing alone removes funding eligibility');
});