import assert from 'node:assert/strict';
import test from 'node:test';
import type { NearTrendPool } from '@workspace/api-client-react';
import { getSearchNearPoolsQueryKey } from '@workspace/api-client-react';
import { selectNearPoolState } from './near-trends-state';

const pool = (id: string) => ({ id }) as NearTrendPool;
const feed = { data: { pools: [pool('first-page')], source: 'GeckoTerminal', updatedAt: '2026-01-01' }, isPending: false, isError: false, isFetching: false };
const matches = { data: { pools: [pool('older-pool')], source: 'GeckoTerminal', updatedAt: '2026-01-01' }, isPending: false, isError: false, isFetching: false };
const pending = { isPending: true, isError: false, isFetching: true };

test('the feed stays separate from older search results through debounce, loading, and clearing', () => {
  assert.deepEqual(selectNearPoolState('', '', feed, pending).activeData?.pools.map(p => p.id), ['first-page']);
  assert.equal(selectNearPoolState('o', '', feed, pending).state, 'short');
  const debounce = selectNearPoolState('older', '', feed, matches);
  assert.equal(debounce.state, 'loading');
  assert.equal(debounce.searchReady, false);
  assert.equal(debounce.activeData, undefined, 'neither feed nor previous results appear during debounce');
  const loading = selectNearPoolState('older', 'older', feed, pending);
  assert.equal(loading.state, 'loading');
  assert.equal(loading.activeData, undefined);
  const found = selectNearPoolState('older', 'older', feed, matches);
  assert.equal(found.state, 'list');
  assert.deepEqual(found.activeData?.pools.map(p => p.id), ['older-pool']);
  assert.deepEqual(selectNearPoolState('', 'older', feed, matches).activeData?.pools.map(p => p.id), ['first-page']);
});

test('search error and empty states do not display a cached feed row', () => {
  const error = selectNearPoolState('missing', 'missing', feed, { isPending: false, isError: true, isFetching: false });
  assert.equal(error.state, 'error');
  assert.equal(error.activeData, undefined);
  const empty = selectNearPoolState('missing', 'missing', feed, { ...matches, data: { ...matches.data, pools: [] } });
  assert.equal(empty.state, 'empty');
  assert.deepEqual(empty.activeData?.pools, []);
  assert.equal(selectNearPoolState('', '', { ...feed, data: { ...feed.data, pools: [] } }, matches).state, 'empty');
  assert.equal(selectNearPoolState('', '', { ...feed, isPending: true }, matches).state, 'loading');
  assert.equal(selectNearPoolState('', '', { ...feed, isError: true }, matches).state, 'error');
});

test('search pages have distinct cache keys and never display another page under the current label', () => {
  const first = getSearchNearPoolsQueryKey({ query: 'older', page: 1 });
  const second = getSearchNearPoolsQueryKey({ query: 'older', page: 2 });
  assert.notDeepEqual(first, second);
  assert.notDeepEqual(second, getSearchNearPoolsQueryKey({ query: 'different', page: 2 }));
  const pageOne = { ...matches, data: { ...matches.data, page: 1 } };
  const switching = selectNearPoolState('older', 'older', feed, pageOne, 2);
  assert.equal(switching.activeData, undefined);
  assert.equal(switching.state, 'loading');
  const pageTwo = { ...matches, data: { ...matches.data, page: 2, pools: [pool('second-page')] } };
  const ready = selectNearPoolState('older', 'older', feed, pageTwo, 2);
  assert.deepEqual(ready.activeData?.pools.map(p => p.id), ['second-page']);
  const failed = selectNearPoolState('older', 'older', feed, { ...pageOne, isError: true }, 2);
  assert.equal(failed.state, 'error');
  assert.equal(failed.activeData, undefined);
  const empty = selectNearPoolState('older', 'older', feed, { ...pageTwo, data: { ...pageTwo.data, pools: [] } }, 2);
  assert.equal(empty.state, 'empty');
  assert.deepEqual(selectNearPoolState('', 'older', feed, pageTwo, 1).activeData?.pools.map(p => p.id), ['first-page']);
});