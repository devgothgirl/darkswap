import { useEffect, useState } from 'react';
import { getGetNearServiceStatusQueryKey, useGetNearServiceStatus } from '@workspace/api-client-react';
import { nearRouteReady } from '../lib/near-funding-safety';

export function useNearRouteSafety(fromChain?: string, toChain?: string) {
  const [now, setNow] = useState(Date.now());
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const connectivity = () => { setOnline(navigator.onLine); tick(); };
    const timer = setInterval(tick, 1000);
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  const params = { ...(fromChain ? { fromChain } : {}), ...(toChain ? { toChain } : {}) };
  const query = useGetNearServiceStatus(params, { query: {
    queryKey: getGetNearServiceStatusQueryKey(params), refetchInterval: 15_000,
    refetchOnMount: 'always', refetchOnWindowFocus: 'always', staleTime: 0, retry: 1,
  } });
  const ready = nearRouteReady({
    status: query.data, updatedAt: query.dataUpdatedAt, error: query.isError || !query.isFetchedAfterMount,
    fetchStatus: query.fetchStatus, online, now,
  });
  return { query, ready, online, now };
}

export function NearServiceNotice({ safety }: { safety: ReturnType<typeof useNearRouteSafety> }) {
  const { query, ready, online, now } = safety;
  const data = query.data;
  const expired = !!data && (!data.freshUntil || Date.parse(data.freshUntil) <= now ||
    now - query.dataUpdatedAt > 30_000);
  const pendingVerification = query.fetchStatus === 'paused' || !query.isFetchedAfterMount;
  const state = !online ? 'Offline' : query.isError ? 'Check failed' : pendingVerification || !data ? 'Checking' :
    expired || data.state === 'stale' ? 'Stale' : data.state === 'fresh' ? 'Fresh check' : data.state === 'invalid' ? 'Invalid feed' : 'Unavailable';
  return <aside className={`near-notice near-service-notice${ready ? '' : ' near-notice--warn'}`} aria-label="Privacy swap service status" data-testid="near-service-notice">
    <div role="status" aria-live="polite"><strong>Route incident check · {state}</strong>
      <p>{!online ? 'You are offline. New orders and deposit guidance are paused.' :
        query.isError || pendingVerification || !data || expired ? 'Current route impact cannot be verified. New orders and deposit guidance stay paused until a fresh check succeeds.' :
        data.reason}</p>
    </div>
    <p className="near-hint">Last successful check: {data?.lastSuccessAt ? new Date(data.lastSuccessAt).toLocaleString() : 'Not available'}. This feed is separate from your order status. No reported matching incident is not a guarantee of route availability, privacy, or settlement.</p>
    {!!data?.activeIncidents.length && <details><summary>Reported active incidents ({data.activeIncidents.length})</summary>
      <ul>{data.activeIncidents.map(incident => <li key={incident.id}>{incident.scopeType}: {incident.scopeValue || 'unspecified'} · {incident.impact === 'matching' ? 'Matches this route' : incident.impact === 'unrelated' ? 'Other supported chain' : 'Route impact unverified'} · {incident.status}</li>)}</ul>
    </details>}
    {!!data?.recentlyResolved.length && <details><summary>Recently resolved · historical information only</summary>
      <ul>{data.recentlyResolved.map(incident => <li key={incident.id}>{incident.scopeType}: {incident.scopeValue || 'unspecified'}{incident.resolvedAt ? ` · ${new Date(incident.resolvedAt).toLocaleString()}` : ''}</li>)}</ul>
    </details>}
    <div className="near-service-actions"><a href="https://partners.near-intents.org/shield/status" target="_blank" rel="noopener noreferrer">Public incident source ↗</a>
      <button type="button" className="near-button near-button--text" disabled={query.isFetching || !online} onClick={() => void query.refetch()} data-testid="button-refresh-near-service">{query.isFetching ? 'Checking…' : 'Check route status'}</button>
    </div>
  </aside>;
}