// Run with Node and Chromium; every API request is mocked, with no wallet or orders.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.NEAR_TEST_BASE_URL || 'http://localhost:80';
const profile = await mkdtemp(join(tmpdir(), 'near-a11y-'));
const chrome = spawn(process.env.CHROMIUM_PATH || 'chromium', [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws, seq = 0, mode = 'list';
const pending = new Map();
const errors = [];
const pool = {
  id: 'test-pool', tokenSymbol: 'TEST', tokenName: 'Test pool', tokenImage: null,
  priceUsd: 1.23, priceChange24h: 2.5, volume24h: 10000, liquidityUsd: 50000,
  buys24h: 12, sells24h: 4, dex: 'Test DEX', url: 'https://example.com/pool',
  address: 'pool.near', tokenAddress: 'token.near', createdAt: null,
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result.value;
}
async function wait(check, label) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
const exists = selector => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function intercept({ requestId, request }) {
  const url = new URL(request.url);
  const feed = url.pathname === '/api/near/trends' || url.pathname === '/api/near/pools/search';
  if (feed && mode === 'loading') return;
  const body = feed
    ? { pools: mode === 'empty' ? [] : [pool], source: 'Mock', updatedAt: '2026-01-01T00:00:00Z', page: 1, hasNextPage: false }
    : url.pathname === '/api/rewards/config' ? { enabled: false } : { tokens: [] };
  await send('Fetch.fulfillRequest', {
    requestId, responseCode: feed && mode === 'error' ? 503 : 200,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    body: Buffer.from(JSON.stringify(body)).toString('base64'),
  });
}
async function panelRelationship() {
  assert.equal(await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const selected = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    const panel = document.querySelector('[role="tabpanel"]');
    return tabs.length === 2 && tabs.every(tab => document.getElementById(tab.getAttribute('aria-controls')) === panel)
      && panel.getAttribute('aria-labelledby') === selected.id;
  })()`), true, 'tabs control a panel named by the selected tab');
}

try {
  let port;
  await wait(async () => {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; return !!port; }
    catch { return false; }
  }, 'Chromium startup');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback?.reject(new Error(message.error.message));
      else callback?.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
      intercept(message.params).catch(error => errors.push(error.message));
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || 'Runtime exception');
    }
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  await send('Page.navigate', { url: base + '/near-swap' });
  await wait(() => evaluate(`(() => {
    const heading = document.querySelector('.near-panel-head h2');
    return heading?.textContent === 'Prepare your swap' && getComputedStyle(heading).fontSize === '17px';
  })()`), 'semantic swap heading with preserved styling');

  await send('Page.navigate', { url: base + '/near-trends' });
  await wait(() => exists('.trends-row'), 'pool results');
  await panelRelationship();
  for (const width of [1440, 1024, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate(`(() => {
      const cells = [...document.querySelectorAll('.trends-row td')];
      return cells.length === 8 && cells.every(cell => {
        const header = document.getElementById(cell.getAttribute('headers'));
        return header?.tagName === 'TH' && header.scope === 'col' && header.closest('table') === cell.closest('table');
      });
    })()`), true, `column associations at ${width}px`);
    const { nodes } = await send('Accessibility.getFullAXTree');
    const exposed = nodes.filter(node => !node.ignored);
    assert.ok(exposed.some(node => node.role.value === 'table' && node.name.value === 'NEAR pool metrics'));
    for (const label of ['Token / pool', 'Price', '24h change', '24h volume', 'Liquidity', 'Inspect',
      ...(width === 1024 ? [] : ['24h trades', 'DEX'])]) {
      assert.ok(exposed.some(node => node.role.value === 'columnheader' && node.name.value.toLowerCase() === label.toLowerCase()), `${width}px exposes ${label}`);
    }
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `no overflow at ${width}px`);
  }
  await click('[data-testid="button-details-test-pool"]');
  assert.equal(await evaluate(`document.querySelector('.trends-details-cell').colSpan`), 8);
  await click('[data-testid="button-view-new"]');
  await panelRelationship();
  await wait(() => exists('.trends-row'), 'new pool results');
  for (const state of ['empty', 'error', 'loading']) {
    mode = state;
    // Refetching cached/error data is not initial loading; use a fresh page for that state.
    if (state === 'loading') await send('Page.navigate', { url: base + '/near-trends' });
    else await click('[data-testid="button-refresh-pools"]');
    await wait(() => exists(`[data-testid="status-trends-${state}"]`), state);
    await panelRelationship();
    assert.equal(await evaluate(`!!document.querySelector('[role="tabpanel"] [data-testid="status-trends-${state}"]')`), true);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: swap heading, tab relationships in list/empty/error/loading states, desktop/tablet/mobile table headers, expanded details and responsive layout. All API requests mocked.');
} finally {
  ws?.close();
  chrome.kill('SIGKILL');
  await sleep(100);
  await rm(profile, { recursive: true, force: true });
}