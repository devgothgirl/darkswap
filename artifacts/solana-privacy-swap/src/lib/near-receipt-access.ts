// Private bearer receipts live in browser storage, never in tracking URLs.
// Session storage preserves the active receipt per tab; local storage retains
// the latest receipt across browser restarts, as the creation flow already did.
export const NEAR_RECENT_KEY = 'dark-swap:near-recent-order';
const ACTIVE_KEY = 'dark-swap:near-active-receipt';
type Receipt = { requestId: string; address: string; memo: string };

export function saveNearReceipt(requestId: string, address = '', memo = ''): void {
  const value = JSON.stringify({ requestId, address, memo });
  try { sessionStorage.setItem(ACTIVE_KEY, value); } catch { /* Try durable storage below. */ }
  try { localStorage.setItem(NEAR_RECENT_KEY, value); } catch { /* Tracking fails closed if both stores are unavailable. */ }
}

export function readNearReceipt(address = '', memo = ''): string {
  for (const kind of ['sessionStorage', 'localStorage'] as const) {
    try {
      const key = kind === 'sessionStorage' ? ACTIVE_KEY : NEAR_RECENT_KEY;
      const receipt = JSON.parse(window[kind].getItem(key) || 'null') as Receipt | null;
      if (receipt && typeof receipt.requestId === 'string' &&
          (!address || (receipt.address === address && receipt.memo === memo))) return receipt.requestId;
    } catch { /* Try the other store; never use a public address as authorization. */ }
  }
  return '';
}

export function nearTrackingLink(requestId: string, address = '', memo = ''): string {
  saveNearReceipt(requestId, address, memo);
  // Suppress platform pageviews before pushState, not after the page mounts.
  try {
    localStorage.setItem('umami.disabled', '1');
    localStorage.setItem('darkswap.privateAnalyticsOff', '1');
  } catch { /* The capability is still absent from the URL. */ }
  const query = new URLSearchParams();
  if (address) query.set('address', address);
  if (memo) query.set('memo', memo);
  return `/near-order${query.size ? `?${query}` : ''}`;
}
