import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackEvent, trackPublicNavigation } from './analytics.ts';

test('analytics is safe without a browser or injected tracker', () => {
  assert.doesNotThrow(() => trackPublicNavigation('help', 'footer'));
  Object.assign(globalThis, { window: {} });
  try {
    assert.doesNotThrow(() => trackEvent('order_lookup_opened', { location: 'header' }));
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('analytics failures cannot interrupt navigation, including async rejection', async () => {
  Object.assign(globalThis, { window: { umami: { track() { throw new Error('tracker unavailable'); } } } });
  try {
    assert.doesNotThrow(() => trackPublicNavigation('docs', 'header'));
    Object.assign(globalThis, { window: { umami: { track() { return Promise.reject(new Error('offline')); } } } });
    assert.doesNotThrow(() => trackPublicNavigation('swap', 'footer'));
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('private receipt tracking never calls custom analytics, even if the tracker ignores its disabled flag', () => {
  let calls = 0;
  Object.assign(globalThis, { window: {
    location: { pathname: '/near-order' },
    umami: { track() { calls++; } },
  } });
  try {
    trackEvent('order_status_viewed', { route: 'privacy_swap', status: 'processing' });
    trackPublicNavigation('docs', 'header');
    assert.equal(calls, 0);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('navigation uses only fixed public labels and distinguishes swap routes', () => {
  const received: { name: string; data: unknown }[] = [];
  Object.assign(globalThis, { window: { umami: { track(name: string, data: unknown) { received.push({ name, data }); } } } });
  try {
    const cases = [
      ['swap', 'swap_entry_clicked', { route: 'private_route' }],
      ['privacy_swap', 'swap_entry_clicked', { route: 'privacy_swap' }],
      ['bridge', 'swap_entry_clicked', { route: 'bridge' }],
      ['rewards_console', 'rewards_console_opened', {}],
      ['pool', 'pool_preview_opened', {}],
      ['docs', 'docs_opened', {}],
      ['account_points', 'rewards_page_opened', {}],
      ['founder', 'preview_opened', { feature: 'founder' }],
      ['help', 'help_opened', {}],
      ['near_intents', 'near_intents_opened', {}],
    ] as const;
    for (const location of ['header', 'footer'] as const) {
      for (const [destination, name, extra] of cases) {
        trackPublicNavigation(destination, location);
        assert.deepEqual(received.at(-1), { name, data: { location, ...extra } });
        assert.match(name, /^[a-z_]{1,49}$/);
      }
    }
    assert.equal(received.length, 20);
    // Even an unexpected runtime destination cannot become an event payload.
    trackPublicNavigation('user-entered-order-id' as 'help', 'header');
    assert.equal(received.length, 20);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('shared UI wires lookup and mobile-menu events only on open actions', () => {
  const ui = readFileSync(new URL('../components/swap-ui.tsx', import.meta.url), 'utf8');
  assert.match(ui, /trackEvent\('order_lookup_opened', \{ location: 'header' \}\)/);
  assert.equal((ui.match(/onClick=\{openLookup\}/g) || []).length, 2);
  assert.match(ui, /if \(!menuOpen\) trackEvent\('mobile_navigation_opened', \{ location: 'header' \}\)/);
  assert.match(ui, /trackPublicNavigation\('help', 'footer'\)/);
  assert.match(ui, /trackPublicNavigation\('pool', 'header'\)/);
  assert.match(ui, /trackPublicNavigation\('bridge', 'header'\)/);
});

test('route tabs report only fixed route names, including the bridge', () => {
  const tabs = readFileSync(new URL('../components/route-tabs.tsx', import.meta.url), 'utf8');
  assert.match(tabs, /\{ id: 'bridge', href: '\/bridge', label: 'Bridge', hint: 'Any network' \}/);
  assert.match(tabs, /trackEvent\('swap_route_tab_clicked', \{ to_route: TAB_ROUTE\[route\.id\] \}\)/);
  assert.match(tabs, /bridge: 'bridge'/);
});
