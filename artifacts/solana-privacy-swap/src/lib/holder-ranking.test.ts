import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUnits, rankHolders, toBaseUnits } from './holder-ranking.ts';

test('aggregates token accounts per wallet and ranks largest holdings first', () => {
  const ranked = rankHolders([
    { wallet: 'wallet-a', raw: '150', decimals: 2 },
    { wallet: 'wallet-b', amount: '3.01', decimals: 2 },
    { wallet: 'wallet-a', raw: '200', decimals: 2 },
  ]);
  assert.deepEqual(ranked, [
    { rank: 1, wallet: 'wallet-a', units: 350n, display: '3.5' },
    { rank: 2, wallet: 'wallet-b', units: 301n, display: '3.01' },
  ]);
});

test('preserves differences above the JavaScript safe-integer limit', () => {
  const ranked = rankHolders([
    { wallet: 'smaller', raw: '9007199254740992', decimals: 9 },
    { wallet: 'larger', raw: '9007199254740993', decimals: 9 },
  ]);
  assert.equal(ranked[0].wallet, 'larger');
  assert.equal(ranked[0].display, '9,007,199.254740993');
});

test('equal holdings share a rank and wallet-address order is deterministic', () => {
  const balances = [
    { wallet: 'wallet-b', raw: '100', decimals: 0 },
    { wallet: 'wallet-c', raw: '50', decimals: 0 },
    { wallet: 'wallet-a', raw: '100', decimals: 0 },
  ];
  const ranked = rankHolders(balances);
  assert.deepEqual(ranked.map(({ wallet, rank }) => [wallet, rank]), [
    ['wallet-a', 1], ['wallet-b', 1], ['wallet-c', 3],
  ]);
  assert.deepEqual(rankHolders([...balances].reverse()), ranked);
  assert.equal(balances[0].wallet, 'wallet-b');
});

test('formats zero, integer tokens, and exact fractional base units', () => {
  assert.deepEqual(rankHolders([]), []);
  assert.equal(formatUnits(0n, 9), '0');
  assert.equal(formatUnits(123456n, 0), '123,456');
  assert.equal(formatUnits(1n, 9), '0.000000001');
  assert.equal(toBaseUnits({ wallet: 'a', amount: '100000.000000001', decimals: 9 }), 100000000000001n);
  assert.equal(toBaseUnits({ wallet: 'a', amount: '1.2300', decimals: 2 }), 123n);
});

test('rejects malformed, ambiguous, missing and incompatible balance data', () => {
  for (const raw of ['-1', '1e5', '1.2', '', 'NaN']) {
    assert.throws(() => toBaseUnits({ wallet: 'a', raw, decimals: 9 }));
  }
  assert.throws(() => toBaseUnits({ wallet: 'a', amount: '1.001', decimals: 2 }));
  assert.throws(() => toBaseUnits({ wallet: 'a', raw: '1', amount: '2', decimals: 0 }));
  assert.throws(() => toBaseUnits({ wallet: 'a', decimals: 0 }));
  assert.throws(() => toBaseUnits({ wallet: 'a', raw: '1', decimals: -1 }));
  assert.throws(() => rankHolders([{ wallet: ' ', raw: '1', decimals: 0 }]));
  assert.throws(() => rankHolders([
    { wallet: 'a', raw: '1', decimals: 0 },
    { wallet: 'b', raw: '1', decimals: 9 },
  ]));
});