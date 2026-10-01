// Dependency-free mocked browser regression. Requires Chromium and Node's WebSocket.
// Run: node scripts/verify-near-funding-browser.mjs
// All /api requests are intercepted. This script cannot create a real order.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.env.NEAR_TEST_BASE_URL || 'http://localhost:80';
const profile = await mkdtemp(join(tmpdir(), 'near-browser-'));
const chrome = spawn(process.env.CHROMIUM_PATH || 'chromium', [
  '--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
let seq = 0;
const pending = new Map();
const errors = [];
const calls = [];
const address = '11111111111111111111111111111111';
const requestId = 'bcfbe86a-4edf-4160-9f11-9e354b9221e8';
const from = { id: 'nep141:sol.omft.near', chain: 'sol', chainName: 'Solana', symbol: 'SOL', decimals: 9, price: 100 };
const to = { id: 'nep141:eth.omft.near', chain: 'eth', chainName: 'Ethereum', symbol: 'ETH', decimals: 18 };
let eligibility = 'allowed';
let lifecycle = 'PENDING_DEPOSIT';
let minOut = '0.0495';
let receiptFailure = false;
let statusFailure = false;
let freeze = false;
let deadline = new Date(Date.now() + 600_000).toISOString();
let clockOffset = 0;
let quoteLifetime = 40_000;
const service = () => ({
  sourceUrl: 'https://partners.near-intents.org/shield/status',
  lastSuccessAt: new Date(Date.now() + clockOffset).toISOString(),
  freshUntil: new Date(Date.now() + clockOffset + 60_000).toISOString(),
  state: 'fresh', eligibility,
  reason: eligibility === 'allowed' ? 'No matching reported incident; availability is not guaranteed.' : 'Route impact unverified. Funding guidance is paused.',
  activeIncidents: eligibility === 'allowed' ? [] : [{
    id: 'mock-incident', scopeType: 'bridge', scopeValue: 'mock', status: 'active',
    createdAt: new Date().toISOString(), impact: 'unverified',
  }],
  recentlyResolved: [],
});
const order = () => ({
  from, to, requestId, depositAddress: address, depositMemo: 'mock-memo',
  amountIn: '1', amountOut: '0.05', minAmountOut: minOut,
  recipient: '0x1111111111111111111111111111111111111111',
  refundTo: 'So11111111111111111111111111111111111111112',
  deadline, estimatedSeconds: 60, status: lifecycle, routeStatus: service(),
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function intercept(event) {
  const { request, requestId: intercepted } = event;
  const url = new URL(request.url);
  calls.push({ path: url.pathname, method: request.method });
  if (freeze && url.pathname.startsWith('/api/swap/near/')) return; // held until page close
  let body;
  let code = 200;
  if (url.pathname.endsWith('/service-status')) body = service();
  else if (url.pathname.endsWith('/tokens')) body = { tokens: url.searchParams.get('side') === 'source' ? [from] : [to] };
  else if (url.pathname.endsWith('/quote')) body = {
    ...order(), quoteId: requestId, validUntil: new Date(Date.now() + quoteLifetime).toISOString(),
  };
  else if (url.pathname.endsWith('/orders') && request.method === 'POST') body = order();
  else if (url.pathname.endsWith('/status')) {
    body = statusFailure ? { error: 'Mock status unavailable. Do not send funds.' } : order();
    if (statusFailure) code = 503;
  } else if (url.pathname.includes('/swap/near/orders/')) {
    body = receiptFailure ? { error: 'No verified receipt. Do not send funds.' } : order();
    if (receiptFailure) code = 409;
  } else if (url.pathname === '/api/rewards/config') body = { enabled: false };
  else { body = { error: 'Not used in mocked test' }; code = 503; }
  await send('Fetch.fulfillRequest', {
    requestId: intercepted, responseCode: code,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(JSON.stringify(body)).toString('base64'),
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ' ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
const selector = id => `[data-testid="${id}"]`;
const exists = id => evaluate(`!!document.querySelector(${JSON.stringify(selector(id))})`);
async function wait(check, label) {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function click(id) {
  await wait(() => evaluate(`!!document.querySelector(${JSON.stringify(selector(id))}) && !document.querySelector(${JSON.stringify(selector(id))}).disabled`), id);
  await evaluate(`document.querySelector(${JSON.stringify(selector(id))}).click()`);
}
async function fill(id, value) {
  await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector(id))}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
}
async function navigate(path) {
  await send('Page.navigate', { url: base + path });
  await wait(() => exists('near-service-notice'), 'route notice');
}
async function blocked(label) {
  await wait(async () => !(await exists('waiting-deposit-card')), label);
  assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Copy deposit address"], button[aria-label="Copy deposit memo"], button[aria-label="Copy exact amount"]')`), false, `${label}: no historical copy controls`);
}
async function fundable() {
  await click('button-accept-near-live-terms');
  await wait(() => exists('waiting-deposit-card'), 'reviewed funding card');
}
async function refreshOrder() {
  const before = calls.filter(c => c.path.endsWith('/status')).length;
  await click('button-refresh-near-order');
  await wait(() => calls.filter(c => c.path.endsWith('/status')).length > before, 'new status request');
  await sleep(300);
}
async function screenshot(name) {
  await mkdir('screenshots/near-safety', { recursive: true });
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(`screenshots/near-safety/${name}.png`, Buffer.from(result.data, 'base64'));
}

try {
  let port;
  await wait(async () => {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; return !!port; }
    catch { return false; }
  }, 'Chromium startup');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const result = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) result?.reject(new Error(message.error.message));
      else result?.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') intercept(message.params).catch(error => errors.push(error.message));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/near-swap');
  await click('button-near-source-asset');
  await click(`button-near-source-token-${from.id}`);
  await click('button-near-destination-asset');
  await click('button-near-destination-chain-eth');
  await click(`button-near-destination-token-${to.id}`);
  await fill('input-near-amount', '1');
  await fill('input-near-recipient', order().recipient);
  await fill('input-near-refund', order().refundTo);
  if (process.argv.includes('--expired-preview')) {
    quoteLifetime = 100;
    await click('button-request-near-quote');
    await wait(() => evaluate(`document.body.innerText.includes('This quote has expired.')`), 'expired preview');
    assert.equal(await exists('button-review-near-route'), false);
    assert.equal(await exists('button-confirm-near-order'), false);
    assert.equal(calls.some(c => c.path.endsWith('/orders') && c.method === 'POST'), false);
    console.log('PASS expired dry preview cannot create an order; all API requests mocked');
  } else {
  await click('button-request-near-quote');
  await click('button-review-near-route');
  await click('button-confirm-near-order');
  await wait(() => exists('button-view-near-instructions'), 'final creation review');
  assert.equal(await evaluate('location.pathname'), '/near-swap');
  await blocked('new order remains unreviewed');
  await screenshot('desktop-final-review');
  await click('button-view-near-instructions');
  await wait(() => exists('button-accept-near-live-terms'), 'tracker final review');
  await blocked('tracker requires fresh final acceptance');
  await fundable();
  console.log('PASS creation stays in final review; tracker requires explicit acceptance');

  minOut = '0.048';
  await refreshOrder();
  await wait(() => exists('button-accept-near-live-terms'), 'changed terms revoke acceptance');
  await blocked('material term change');
  await fundable();
  eligibility = 'unverified';
  await click('button-refresh-near-service');
  await blocked('unknown incident');
  eligibility = 'allowed';
  await click('button-refresh-near-service');
  await refreshOrder();
  await wait(() => exists('waiting-deposit-card'), 'resolved route restoration');
  console.log('PASS material term and incident transitions remove funding controls');

  // Explicit browser connectivity events without touching the actual network.
  await evaluate(`Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}); window.dispatchEvent(new Event('offline'))`);
  await blocked('offline');
  await evaluate(`Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true}); window.dispatchEvent(new Event('online'))`);
  await refreshOrder();
  await click('button-refresh-near-service');
  await wait(() => exists('waiting-deposit-card'), 'online restoration');
  for (const value of ['INCOMPLETE_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'SUCCESS', 'REFUNDED', 'FAILED']) {
    lifecycle = value;
    await refreshOrder();
    await blocked(value);
  }
  lifecycle = 'PENDING_DEPOSIT';
  deadline = new Date(Date.now() - 1_000).toISOString();
  await refreshOrder();
  await blocked('expired deadline');
  console.log('PASS offline, partial, processing, terminal and expired orders cannot fund');

  deadline = new Date(Date.now() + 600_000).toISOString();
  await navigate(`/near-order?address=${address}&memo=mock-memo`);
  await blocked('direct link resets review');
  await fundable();
  await send('Page.reload', { ignoreCache: true });
  await wait(() => exists('button-accept-near-live-terms'), 'reload resets review');
  await blocked('reload');
  await navigate(`/near-order?requestId=${requestId}`);
  await wait(() => exists('button-accept-near-live-terms'), 'recovered order review');
  await blocked('recovery');
  await fundable();
  statusFailure = true;
  await refreshOrder();
  await wait(() => exists('status-near-order-error'), 'failed live refresh');
  await blocked('status failure');
  statusFailure = false;
  receiptFailure = true;
  await navigate(`/near-order?requestId=${requestId}`);
  await wait(() => exists('status-near-receipt-error'), 'receipt error');
  assert.match(await evaluate('document.body.innerText'), /Do not create a replacement order/);
  assert.doesNotMatch(await evaluate('document.body.innerText'), /If this does not resolve, request a fresh quote/);
  console.log('PASS direct/reloaded/recovered orders require review; failures preserve no-replacement guidance');

  receiptFailure = false;
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate(`/near-order?address=${address}&memo=mock-memo`);
  await wait(() => exists('button-accept-near-live-terms'), 'mobile review');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'mobile page should not overflow');
  await screenshot('mobile-final-review');
  await fundable();
  // Time advancing without successful responses must independently revoke funding.
  freeze = true;
  clockOffset = 31_000;
  await evaluate(`window.__realNow = Date.now; Date.now = () => window.__realNow() + 31000; window.dispatchEvent(new Event('focus'))`);
  await blocked('aged successful response');
  await screenshot('mobile-stale-block');
  console.log('PASS mobile layout and stale successful-response cutoff');
  assert.deepEqual(errors, []);
  assert.equal(calls.filter(c => c.path.endsWith('/orders') && c.method === 'POST').length, 1, 'exactly one intercepted creation');
  console.log('All browser checks passed. Every API call was mocked; no real orders or funds.');
  }
} finally {
  ws?.close();
  chrome.kill('SIGTERM');
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}