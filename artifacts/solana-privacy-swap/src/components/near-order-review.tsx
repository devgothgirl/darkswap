import type { NearOrder } from '@workspace/api-client-react';

/** Plain text terms only. Actionable deposit controls live behind funding readiness. */
export function NearOrderReview({ order, accepted, canReview, onAccept }: {
  order: NearOrder; accepted: boolean; canReview: boolean; onAccept: () => void;
}) {
  return <section className="near-order-card near-review-terms" aria-labelledby="near-live-review-title" data-testid="near-live-order-review">
    <div className="near-kicker">FINAL LIVE ORDER TERMS</div>
    <h2 id="near-live-review-title">{accepted ? 'Final terms reviewed' : 'Review this order before funding'}</h2>
    <p className="near-hint">These are the provider-issued terms, not the earlier dry preview. Review is required again after reloading or if any material terms change. Reviewing does not send funds.</p>
    <div className="near-detail"><span>Exact input</span><strong>{order.amountIn} {order.from.symbol} · {order.from.chainName}</strong></div>
    <div className="near-detail near-detail--stack"><span>Origin asset</span><strong>{order.from.id}<br/>{order.from.contractAddress || 'Native SOL (not an SPL token)'}</strong></div>
    <div className="near-detail"><span>Estimated output</span><strong>{order.amountOut} {order.to.symbol} · {order.to.chainName}</strong></div>
    <div className="near-detail near-detail--stack"><span>Destination asset</span><strong>{order.to.id}{order.to.contractAddress ? ` · ${order.to.contractAddress}` : ''}</strong></div>
    <div className="near-detail"><span>Minimum output</span><strong>{order.minAmountOut} {order.to.symbol}</strong></div>
    <div className="near-detail"><span>Withdrawal fee</span><strong>{order.withdrawFee !== undefined ? `${order.withdrawFee} ${order.to.symbol} (included in output)` : 'Not separately reported'}</strong></div>
    <div className="near-detail"><span>Possible refund fee</span><strong>{order.refundFee !== undefined ? `${order.refundFee} ${order.from.symbol}` : 'Not separately reported'}</strong></div>
    <div className="near-detail"><span>Max slippage</span><strong>1%</strong></div>
    <div className="near-detail near-detail--stack"><span>Recipient</span><strong>{order.recipient}</strong></div>
    <div className="near-detail near-detail--stack"><span>Refund address · Solana</span><strong>{order.refundTo}</strong></div>
    <div className="near-detail near-detail--stack"><span>Deposit address · record only until funding checks pass</span><strong>{order.depositAddress}</strong></div>
    <div className="near-detail near-detail--stack"><span>Deposit memo</span><strong>{order.depositMemo || 'None reported'}</strong></div>
    <div className="near-detail"><span>Deposit deadline</span><strong>{new Date(order.deadline).toLocaleString()}</strong></div>
    <div className="near-detail"><span>Estimated duration</span><strong>~{Math.ceil(order.estimatedSeconds / 60)} min</strong></div>
    <p className="near-hint">Solana origin deposits are public. Confidential mode is not a guarantee of anonymity, unlinkability, availability, or settlement. Do not send until fresh order and route checks permit deposit guidance below.</p>
    {!accepted && <button type="button" className="near-button near-button--wide" disabled={!canReview} onClick={onAccept} data-testid="button-accept-near-live-terms">I reviewed and accept these final terms</button>}
    {accepted && <p role="status" className="near-hint" data-testid="status-near-terms-accepted">These final terms are accepted for this visit. Funding still depends on fresh checks.</p>}
  </section>;
}