import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NearQuote, NearToken } from '@workspace/api-client-react';
import { NearRouteForm } from './near-route-form';
import type { NearFormMode } from '../lib/near-route-form';

// Runs in a jsdom document (scripts/test-ui-setup.mjs) against a mocked API.

const token = (fields: Pick<NearToken, 'id' | 'symbol' | 'chain' | 'chainName'> & Partial<NearToken>): NearToken =>
  ({ decimals: 6, price: 1, native: false, originEligible: true, ...fields });
const SOL = token({ id: 'nep141:sol.omft.near', symbol: 'SOL', chain: 'sol', chainName: 'Solana', decimals: 9, price: 150, native: true });
const USDC_SOL = token({ id: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', chain: 'sol', chainName: 'Solana', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' });
const ETH_BASE = token({ id: 'nep141:base.omft.near', symbol: 'ETH', chain: 'base', chainName: 'Base', decimals: 18, price: 2500, native: true });
const USDC_BASE = token({ id: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', chain: 'base', chainName: 'Base', contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' });
const BTC = token({ id: 'nep141:btc.omft.near', symbol: 'BTC', chain: 'btc', chainName: 'Bitcoin', decimals: 8, price: 60_000, originEligible: false });
const ZEC = token({ id: 'nep141:zec.omft.near', symbol: 'ZEC', chain: 'zec', chainName: 'Zcash', decimals: 8, price: 100, native: true, originEligible: false });
const SOURCES = [SOL, USDC_SOL, ETH_BASE, USDC_BASE];
const DESTINATIONS = [SOL, USDC_SOL, USDC_BASE, BTC, ZEC];
const SOL_ADDRESS = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM_ADDRESS = '0x2222222222222222222222222222222222222222';

let requests: string[] = [];
let honourChainFilter = true;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
  requests.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
  if (url.pathname === '/api/swap/near/tokens') {
    const list = url.searchParams.get('side') === 'source' ? SOURCES : DESTINATIONS;
    const chain = url.searchParams.get('chain');
    return json({ tokens: honourChainFilter && chain ? list.filter(asset => asset.chain === chain) : list });
  }
  if (url.pathname === '/api/swap/near/service-status') {
    const now = Date.now();
    return json({ sourceUrl: 'https://status.near-intents.org', lastSuccessAt: new Date(now).toISOString(), freshUntil: new Date(now + 60_000).toISOString(), state: 'fresh', activeIncidents: [], recentlyResolved: [], eligibility: 'allowed', reason: 'No active incidents' });
  }
  if (url.pathname === '/api/swap/near/quote') {
    const body = JSON.parse(String(init?.body));
    const quote: NearQuote = {
      quoteId: 'quote-1', from: SOURCES.find(asset => asset.id === body.from)!, to: DESTINATIONS.find(asset => asset.id === body.to)!,
      amountIn: body.amount, amountOut: '0.0612', minAmountOut: '0.0606', withdrawFee: '0.000005', refundFee: '0.02', appFeeBps: 25,
      recipient: body.recipient, refundTo: body.refundTo, validUntil: new Date(Date.now() + 120_000).toISOString(), estimatedSeconds: 75,
    };
    return json(quote);
  }
  return json({ error: 'Not found' }, 404);
}) as typeof fetch;

let client: QueryClient | undefined;
function renderForm(mode: NearFormMode) {
  // No garbage-collection timers, so the test process can exit as soon as the tests finish.
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><NearRouteForm mode={mode}/></QueryClientProvider>);
}
afterEach(() => {
  cleanup();
  client?.clear();
  requests = [];
  honourChainFilter = true;
  delete (window as { umami?: unknown }).umami;
});

const input = (testId: string) => screen.getByTestId(testId) as HTMLInputElement;
const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const flipButton = () => screen.getByTestId('button-near-flip') as HTMLButtonElement;
const quoteStatus = () => screen.getByTestId('status-near-quote').textContent ?? '';
async function pick(side: 'source' | 'destination', asset: NearToken, viaNetwork = true) {
  fireEvent.click(screen.getByTestId(`button-near-${side}-asset`));
  if (viaNetwork) fireEvent.click(await screen.findByTestId(`button-near-${side}-chain-${asset.chain}`));
  fireEvent.click(await screen.findByTestId(`button-near-${side}-token-${asset.id}`));
}
function setClipboard(readText: () => Promise<string>) {
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { readText } });
}
function captureAnalytics() {
  const events: { name: string; data: unknown }[] = [];
  (window as { umami?: unknown }).umami = { track: (name: string, data: unknown) => { events.push({ name, data }); } };
  return events;
}
/** A complete bridge request: USDC on Base to SOL, with both addresses. */
async function fillBridgeRequest() {
  await pick('source', USDC_BASE);
  type('input-near-amount', '10');
  await pick('destination', SOL);
  type('input-near-recipient', SOL_ADDRESS);
  type('input-near-refund', EVM_ADDRESS);
}

test('the Privacy swap stays Solana-only, even if a catalog ignored the chain filter', async () => {
  honourChainFilter = false;
  renderForm('solana');
  assert.ok(screen.getByRole('heading', { name: 'Privacy swap from Solana.' }));
  fireEvent.click(screen.getByTestId('button-near-source-asset'));
  await screen.findByTestId(`button-near-source-token-${SOL.id}`);
  assert.ok(screen.getByTestId(`button-near-source-token-${USDC_SOL.id}`));
  assert.equal(screen.queryByTestId(`button-near-source-token-${USDC_BASE.id}`), null);
  assert.equal(screen.queryByTestId(`button-near-source-token-${ETH_BASE.id}`), null);
  assert.equal(screen.queryByTestId('button-near-source-chain-base'), null);
  const sourceRequests = requests.filter(request => request.startsWith('GET /api/swap/near/tokens?side=source'));
  assert.ok(sourceRequests.length > 0);
  for (const request of sourceRequests) assert.match(request, /[?&]chain=sol(?:&|$)/);
  assert.equal(screen.queryByTestId('button-near-flip'), null);
  assert.equal(screen.queryByTestId('button-paste-near-recipient'), null);
  assert.equal(screen.queryByTestId('button-paste-near-refund'), null);
  assert.ok(screen.getByText('Use an address you control on Solana. A refund, if applicable, is not guaranteed.'));
});

test('the bridge offers API networks and words the form for the chosen origin', async () => {
  renderForm('bridge');
  assert.ok(screen.getByRole('heading', { name: 'Bridge between networks.' }));
  assert.ok(screen.getByText('Move assets across the networks listed below with confidential routing built on NEAR Intents. You send from your own wallet. DarkSwap prepares the order and never holds your funds.'));
  assert.equal(document.querySelector('.sx-tab.is-active strong')?.textContent, 'Bridge');
  const notice = () => screen.getByTestId('near-bridge-notice').textContent ?? '';
  assert.equal(notice(), 'Confidential routing, not ZK shielding.This route requests confidential execution inside NEAR Intents. Your deposit on the origin network is public, and the destination transfer may be public. This does not deposit into a shielded pool.');
  fireEvent.click(screen.getByTestId('button-near-source-asset'));
  assert.ok(await screen.findByTestId('button-near-source-chain-sol'));
  assert.ok(screen.getByTestId('button-near-source-chain-base'));
  fireEvent.click(screen.getByTestId('button-near-source-chain-base'));
  fireEvent.click(await screen.findByTestId(`button-near-source-token-${USDC_BASE.id}`));
  const sourceRequests = requests.filter(request => request.startsWith('GET /api/swap/near/tokens?side=source'));
  assert.ok(sourceRequests.length > 0);
  for (const request of sourceRequests) assert.doesNotMatch(request, /chain=/);
  assert.ok(screen.getByText('Refund address · Base'));
  assert.equal(input('input-near-refund').placeholder, 'Your Base address for a possible refund');
  assert.ok(screen.getByText('Use an address you control on Base. If a refund applies, it is sent to this address.'));
  assert.match(notice(), /Your deposit on Base is public, and the destination transfer may be public\./);
  type('input-near-amount', '10');
  await pick('destination', SOL);
  type('input-near-recipient', SOL_ADDRESS);
  assert.equal(screen.getByTestId('status-near-quote-blocker').textContent, 'Enter a Base refund address');
});

test('a bridge quote shows the confidential route and every fee in its own unit', async () => {
  const events = captureAnalytics();
  renderForm('bridge');
  await fillBridgeRequest();
  fireEvent.click(screen.getByTestId('button-request-near-quote'));
  assert.equal((await screen.findByTestId('text-near-quote-route')).textContent, 'NEAR Intents · confidential');
  assert.equal(screen.getByTestId('text-near-quote-output').textContent, '0.0612 SOL');
  assert.equal(screen.getByTestId('text-near-quote-minimum').textContent, '0.0606 SOL');
  assert.equal(screen.getByTestId('text-near-quote-appfee').textContent, '0.25%');
  assert.equal(screen.getByTestId('text-near-quote-withdraw-fee').textContent, '0.000005 SOL');
  assert.equal(screen.getByTestId('text-near-quote-refund-fee').textContent, '0.02 USDC');
  for (const label of ['Estimated time', 'Max slippage', 'Route', 'DarkSwap fee', 'Withdrawal fee', 'Possible refund fee']) assert.ok(screen.getByText(label));
  assert.equal(screen.getByTestId('text-near-bridge-fee-note').textContent, 'Fees are included in the quote. Your wallet also pays its usual network fee to send the deposit.');
  const quoteRequest = requests.find(request => request.startsWith('POST /api/swap/near/quote'));
  assert.ok(quoteRequest);
  // Analytics carry the static route only: no addresses, amounts or asset choices.
  assert.deepEqual(events, [{ name: 'swap_quote_requested', data: { route: 'bridge', outcome: 'received' } }]);
  // Editing any input withdraws the preview.
  type('input-near-amount', '11');
  assert.equal(screen.queryByTestId('text-near-quote-route'), null);
  assert.match(quoteStatus(), /^Nothing is reserved yet\./);
});

test('flipping swaps the sides, clears both addresses and the quote, and keeps the amount', async () => {
  renderForm('bridge');
  await fillBridgeRequest();
  fireEvent.click(screen.getByTestId('button-request-near-quote'));
  await screen.findByTestId('text-near-quote-route');
  await waitFor(() => assert.equal(flipButton().disabled, false));
  fireEvent.click(flipButton());
  assert.match(screen.getByTestId('button-near-source-asset').textContent ?? '', /SOL/);
  assert.match(screen.getByTestId('button-near-destination-asset').textContent ?? '', /USDC/);
  assert.equal(input('input-near-recipient').value, '');
  assert.equal(input('input-near-refund').value, '');
  assert.equal(input('input-near-amount').value, '10');
  assert.equal(screen.queryByTestId('text-near-quote-route'), null);
  assert.match(quoteStatus(), /^Nothing is reserved yet\./);
  assert.ok(screen.getByText('Refund address · Solana'));
  // A destination that cannot be an origin cannot be flipped into one.
  await pick('destination', BTC);
  assert.equal(flipButton().disabled, true);
});

test('native Zcash offers shielded-only payout, accepts a long UA intact, blocks transparent input and cannot flip', async () => {
  renderForm('bridge');
  await pick('source', USDC_SOL);
  await pick('destination', ZEC);
  type('input-near-amount', '10');
  type('input-near-refund', SOL_ADDRESS);
  const recipient = "u1x08faycv384llwet8r8zedp0w8axcjtckhpv03sj0anft683j2ku9lfamp5q60avusdt4xkg2rlf6nq7pxy444jm3lwtequrzwxm5d8dgcy023fjl4hh4j68c8uuy79v6dk4j5w042zl5wk3vgwatvfr8rlky09vwkjw5yltrqreyr3f";
  assert.equal(input('input-near-recipient').maxLength, 512);
  assert.match(screen.getByTestId('text-near-zcash-policy').textContent ?? '', /no transparent receiver/);
  assert.equal(flipButton().disabled, true);
  type('input-near-recipient', 't1Q879cLgqaCd7zKRi79wQYuGBenmNX6cKn');
  assert.match(screen.getByTestId('status-near-quote-blocker').textContent ?? '', /shielded-only/);
  const before = requests.filter(request => request.startsWith('POST /api/swap/near/quote')).length;
  fireEvent.click(screen.getByTestId('button-request-near-quote'));
  assert.equal(requests.filter(request => request.startsWith('POST /api/swap/near/quote')).length, before);
  setClipboard(async () => recipient);
  fireEvent.click(screen.getByTestId('button-paste-near-recipient'));
  await waitFor(() => assert.equal(input('input-near-recipient').value, recipient));
  fireEvent.click(screen.getByTestId('button-request-near-quote'));
  await screen.findByTestId('text-near-quote-output');
  assert.equal(input('input-near-recipient').value, recipient);
  await waitFor(() => assert.equal((screen.getByTestId('button-review-near-route') as HTMLButtonElement).disabled, false), { timeout: 2000 });
  fireEvent.click(screen.getByTestId('button-review-near-route'));
  assert.ok(await screen.findByText('Native Zcash · shielded-only · no transparent fallback'));
  assert.ok(screen.getByText(recipient));
});

test('Paste fills an address and fails silently when the clipboard is unavailable', async () => {
  renderForm('bridge');
  await pick('source', USDC_BASE);
  const clickPaste = (testId: string) => act(async () => {
    fireEvent.click(screen.getByTestId(testId));
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  setClipboard(async () => { throw new Error('Permission denied'); });
  await clickPaste('button-paste-near-refund');
  assert.equal(input('input-near-refund').value, '');
  setClipboard(async () => 'x'.repeat(121));
  await clickPaste('button-paste-near-refund');
  assert.equal(input('input-near-refund').value, '');
  assert.equal(screen.queryAllByRole('alert').length, 0);
  setClipboard(async () => `  ${EVM_ADDRESS}\n`);
  await clickPaste('button-paste-near-refund');
  assert.equal(input('input-near-refund').value, EVM_ADDRESS);
  setClipboard(async () => SOL_ADDRESS);
  await clickPaste('button-paste-near-recipient');
  assert.equal(input('input-near-recipient').value, SOL_ADDRESS);
});

test('the pickers keep keyboard focus in place', async () => {
  renderForm('bridge');
  const trigger = screen.getByTestId('button-near-source-asset');
  const search = () => screen.queryByTestId('input-search-near-source');
  fireEvent.click(trigger);
  assert.equal(document.activeElement, search());
  fireEvent.click(await screen.findByTestId('button-near-source-chain-base'));
  assert.equal(document.activeElement, search());
  fireEvent.keyDown(search()!, { key: 'Escape' });
  assert.equal(search(), null);
  assert.equal(document.activeElement, trigger);
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByTestId('button-near-source-chain-base'));
  fireEvent.click(await screen.findByTestId(`button-near-source-token-${USDC_BASE.id}`));
  assert.equal(search(), null);
  assert.equal(document.activeElement, trigger);
  assert.match(trigger.textContent ?? '', /USDC/);
});
