import type { NearOrder, NearServiceStatus } from '@workspace/api-client-react';

export const NEAR_RESPONSE_MAX_AGE_MS = 30_000;

/** Canonical material terms only: routine status updates must not revoke review. */
export function nearOrderFingerprint(order: NearOrder): string {
  const asset = (token: NearOrder['from']) => [
    token.id, token.chain, token.chainName, token.symbol, token.decimals, token.contractAddress ?? null,
  ];
  return JSON.stringify([
    order.requestId ?? null, asset(order.from), asset(order.to), order.depositAddress, order.depositMemo ?? null,
    order.amountIn, order.amountOut, order.minAmountOut,
    order.withdrawFee ?? null, order.refundFee ?? null,
    order.recipient, order.refundTo, order.deadline, order.estimatedSeconds,
  ]);
}

export interface NearRouteReadiness {
  status?: NearServiceStatus;
  updatedAt: number;
  error: boolean;
  fetchStatus: string;
  online: boolean;
  now: number;
}

function freshResponse(updatedAt: number, now: number): boolean {
  return Number.isFinite(updatedAt) && updatedAt > 0 &&
    now >= updatedAt && now - updatedAt <= NEAR_RESPONSE_MAX_AGE_MS;
}

export function nearRouteReady(input: NearRouteReadiness): boolean {
  const { status, updatedAt, error, fetchStatus, online, now } = input;
  const until = status?.freshUntil ? Date.parse(status.freshUntil) : NaN;
  return online && !error && fetchStatus !== 'paused' &&
    freshResponse(updatedAt, now) && status?.state === 'fresh' &&
    status.eligibility === 'allowed' && Number.isFinite(until) && until > now;
}

export interface NearFundingReadiness {
  order?: NearOrder;
  acceptedFingerprint: string | null;
  orderUpdatedAt: number;
  orderError: boolean;
  orderFetchStatus: string;
  routeStatus?: NearServiceStatus;
  routeUpdatedAt: number;
  routeError: boolean;
  routeFetchStatus: string;
  online: boolean;
  now: number;
}

export function nearFundingReady(input: NearFundingReadiness): boolean {
  const { order, now } = input;
  if (!order || order.status !== 'PENDING_DEPOSIT' ||
      !input.acceptedFingerprint || input.acceptedFingerprint !== nearOrderFingerprint(order) ||
      input.orderError || input.orderFetchStatus === 'paused' ||
      !freshResponse(input.orderUpdatedAt, now) || !(Date.parse(order.deadline) > now)) return false;
  // A newer blocked observation attached to the live order must veto an older
  // independent route query. Neither receipt data nor this field alone permits funding.
  if (order.routeStatus && !nearRouteReady({
    status: order.routeStatus, updatedAt: input.orderUpdatedAt, error: false,
    fetchStatus: input.orderFetchStatus, online: input.online, now,
  })) return false;
  return nearRouteReady({
    status: input.routeStatus, updatedAt: input.routeUpdatedAt, error: input.routeError,
    fetchStatus: input.routeFetchStatus, online: input.online, now,
  });
}