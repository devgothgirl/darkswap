import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRewardsMe } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, RotateCw, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { Footer, Header, errorText } from '../components/swap-ui';
import { RewardEnrollment } from '../components/reward-enrollment';
import { useRewards } from '../hooks/use-rewards';

export default function RewardsPage() {
  const rewards = useRewards();
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const page = cursors.length;
  const history = useQuery({
    queryKey: ['rewards-history', page, cursors[page - 1]],
    enabled: rewards.ready && rewards.authenticated && rewards.enrolled,
    retry: 1,
    queryFn: async () => {
      const token = await rewards.getEnrolledToken();
      return getRewardsMe({ limit: 12, ...(cursors[page - 1] ? { cursor: cursors[page - 1] } : {}) }, { headers: { Authorization: `Bearer ${token}` } });
    },
  });
  const data = history.data || (page === 1 ? rewards.account : undefined);
  const tier = data?.tier;
  const progress = data && tier && data.nextThreshold !== null
    ? Math.max(0, Math.min(100, ((data.balance - tier.threshold) / Math.max(1, data.nextThreshold - tier.threshold)) * 100))
    : 100;
  const extra = data as (typeof data & { rules?: { version?: string; pointsPerSwap?: number; dailyCap?: number; tiers?: { id: string; name: string; threshold: number }[] } }) | undefined;
  return <div className="rewards-shell"><Header/>
    <main className="rewards-main">
      <div className="rewards-kicker">DARKSWAP / OPTIONAL RECOGNITION</div>
      <h1 className="rewards-title">Privacy first.<br/><span>Recognition by choice.</span></h1>
      <p className="rewards-lead">Swap without an account, as always. Email rewards are a separate decision: enroll, then choose whether each new order belongs to your account.</p>
      <div className="rewards-layout">
        <div>
          {rewards.available && rewards.authenticated && rewards.enrolled ? <>
            <section className="rewards-panel" aria-label="Rewards balance">
              <div className="rewards-overline">YOUR REWARDS / CURRENT BALANCE</div>
              {rewards.accountLoading && !data ? <><div className="rewards-loading"/><div className="rewards-loading" style={{ width: '45%' }}/></>
                : data ? <>
                  <div className="rewards-stat">{data.balance.toLocaleString()}</div>
                  <div className="rewards-stat-label">Points · no cash value</div>
                  <div className="rewards-tier-list">{extra?.rules?.tiers?.length ? extra.rules.tiers.map(item => <span className={`rewards-tier ${item.id === tier?.id ? 'current' : ''}`} key={item.id}>{item.name} · {item.threshold.toLocaleString()}</span>) : <span className="rewards-tier current">{tier?.name} tier · from {tier?.threshold.toLocaleString()} points</span>}</div>
                  <div className="rewards-progress" role="progressbar" aria-label="Progress toward next tier" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }}/></div>
                  <p>{data.nextThreshold === null ? 'Highest available tier reached.' : `${Math.max(0, data.nextThreshold - data.balance).toLocaleString()} points until the next tier at ${data.nextThreshold.toLocaleString()}.`}</p>
                  {extra?.rules && <p className="rewards-note">Rules {extra.rules.version || 'current'}{typeof extra.rules.pointsPerSwap === 'number' ? ` · ${extra.rules.pointsPerSwap} points per eligible completed swap` : ''}{typeof extra.rules.dailyCap === 'number' ? ` · daily cap ${extra.rules.dailyCap}` : ''}. Eligibility is determined by the server.</p>}
                </> : <p className="rewards-error">Account data is unavailable. Retry below.</p>}
            </section>
            <section className="rewards-panel rewards-history" aria-label="Points activity">
              <div className="rewards-overline">ACCOUNT LEDGER / PAGE {page}</div>
              <h2 style={{ marginTop: 11 }}>Points activity</h2>
              {history.isLoading ? <><div className="rewards-loading"/><div className="rewards-loading"/><div className="rewards-loading" style={{ width: '55%' }}/></>
                : history.isError ? <><p className="rewards-error" role="alert">{errorText(history.error)}</p><button className="rewards-action secondary" type="button" onClick={() => void history.refetch()}><RotateCw size={15}/> Retry activity</button></>
                : !history.data?.history.length ? <div className="rewards-note"><strong>{page === 1 ? 'No points activity yet.' : 'No more activity on this page.'}</strong><p>Only eligible new orders explicitly linked at creation can earn points after completion. Guest and historical orders are never backfilled.</p></div>
                : history.data.history.map(entry => <div className="rewards-entry" key={entry.id}><div><strong>{entry.reason.replaceAll('_', ' ')}</strong><small>{entry.route ? `${entry.route === 'houdini' ? 'Private route' : 'Privacy swap'} · ` : ''}{new Date(entry.createdAt).toLocaleString()}</small></div><b>{entry.points > 0 ? '+' : ''}{entry.points.toLocaleString()}</b></div>)}
              <div className="rewards-pagination">
                <button className="rewards-action secondary" type="button" disabled={page === 1 || history.isFetching} onClick={() => setCursors(value => value.slice(0, -1))}><ArrowLeft size={15}/> Previous</button>
                <span className="rewards-overline">Page {page}</span>
                <button className="rewards-action secondary" type="button" disabled={!history.data?.nextCursor || history.isFetching} onClick={() => { if (history.data?.nextCursor) setCursors(value => [...value, history.data!.nextCursor!]); }}>Next <ArrowRight size={15}/></button>
              </div>
            </section>
          </> : rewards.accountError && rewards.authenticated ? <div className="rewards-panel"><h2>We could not load your account.</h2><p className="rewards-error">{errorText(rewards.accountError)}</p><button className="rewards-action secondary" onClick={() => void rewards.refresh()}>Retry account</button><p>You can always continue swapping as a guest.</p></div>
            : <RewardEnrollment/>}
        </div>
        <aside className="rewards-panel">
          <ShieldCheck size={28} color="#c9acff" strokeWidth={1.5}/>
          <h2 style={{ marginTop: 19 }}>Your route. Your call.</h2>
          <p>An email is never required to compare quotes, create a guest order, or track a swap. Verifying an email alone does not enroll you or attach it to an order.</p>
          <p>Once enrolled, order association is still off by default. Select it at final review before order creation. That choice cannot be undone for that order.</p>
          <div className="rewards-note">Points are account ledger entries, not money or crypto. They have no cash value, cannot be transferred or redeemed, and do not promise any current or future discount. A completed order may be subject to eligibility and daily caps. Reversed or adjusted points can reduce the balance.</div>
          <Link href="/swap" className="rewards-action" style={{ textDecoration: 'none' }}>Swap as a guest <ArrowRight size={15}/></Link>
          <p><Link href="/docs#privacy">Read the privacy limitations</Link></p>
          {rewards.authenticated && <button className="rewards-action secondary" type="button" onClick={() => void rewards.logout()}>Sign out of email</button>}
        </aside>
      </div>
    </main><Footer/>
  </div>;
}