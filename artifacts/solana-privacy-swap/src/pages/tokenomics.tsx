import { useEffect } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Link } from 'wouter';
import { Footer, Header } from '../components/swap-ui';
import './tokenomics.css';
import { HolderLeaderboard, type LeaderboardSource } from '../components/holder-leaderboard';

const flow = [
  { n: '01', title: 'Team allocation holds DARK', body: 'The DARK team’s own token allocations are the source. Public holders’ rewards are not touched.' },
  { n: '02', title: 'StonkFun rewards fund our flywheels', body: 'Our launch plan pairs $DARK with $NEAR on StonkFun using its 3% holder-rewards tax. By holding $DARK, the team accrues platform reward distributions in the paired asset.' },
  { n: '03', title: 'Team rewards split 50 / 50', body: 'Planned: 50% of the team’s accrued rewards for $DARK buyback and burn. 50% converted to ZEC for qualifying consecutive holders, with distributions scaled by wallet weight.', split: true },
  { n: '04', title: 'Consecutive holding, weighted rewards', body: 'Hold more than 100,000 $DARK across consecutive snapshots for the proposed three-day eligibility period. Qualifying ZEC rewards scale by wallet weight; the exact weighting formula is not finalized.' },
];

const stats = [
  { k: 'Treasury balance (NEAR)', v: 'Not connected', n: 'Awaiting a verified public treasury address.' },
  { k: 'Treasury balance (ZEC)', v: 'Funding pending', n: 'Treasury funding and balances are not verified.' },
  { k: 'Holder count', v: 'Not connected', n: 'Awaiting the official token mint and data source.' },
  { k: 'Active streaks', v: 'Not active', n: 'Snapshots have not started.' },
  { k: 'ZEC distributed', v: 'Not active', n: 'No verified payout history is connected.' },
  { k: 'Buyback and burn totals', v: 'Not active', n: 'Awaiting verified buyback and burn transactions.' },
  { k: 'Fees accrued', v: 'Not connected', n: 'No fee source is linked.' },
  { k: 'DEX liquidity', v: 'Not connected', n: 'Awaiting a verified trading-pool address; separate from the rewards treasury.' },
  { k: 'Token mint / supply', v: 'Not launched', n: 'Address, supply and authorities are unresolved.' },
];

const reqs = [
  ['Token', 'Launch $DARK on StonkFun paired with $NEAR at the selected 3% holder-rewards tax; publish the mint, supply, authorities and pool configuration.'],
  ['Distributions', 'Verify actual StonkFun reward receipts from the team’s $DARK holdings before allocating funds to buybacks or loyalty airdrops.'],
  ['Treasury', 'A public treasury address, funded, with NEAR and ZEC balances read from a real source.'],
  ['Snapshots', 'A running 12-hour snapshot job and a published eligibility check for holders above 100,000 DARK.'],
  ['Formula', 'Published wallet-weighted allocation rules and any daily progression formula, finalized before snapshots or payouts begin.'],
  ['Routes', 'Tested NEAR to ZEC conversion and buyback and burn routes.'],
  ['Review', 'Owner approval, legal review and StonkFun regional eligibility checks.'],
];

export default function Tokenomics() {
  useEffect(() => {
    const original = document.title;
    document.title = 'Tokenomics | DarkSwap';
    return () => { document.title = original; };
  }, []);

  return <div className="app-shell tk-page">
    <Header />
    <main className="tk-main">
      <Breadcrumb/>
      <SubNav active="overview"/>
      <div className="tk-eyebrow">DARKSWAP / TOKENOMICS / PLAN ONLY</div>
       <h1>The $DARK <span>holder flywheel.</span></h1>
       <p className="tk-intro">We’re launching $DARK on StonkFun, paired with $NEAR using the 3% holder-rewards setting. Dividends from team-held $DARK will fund our own buyback-and-burn and Zcash loyalty flywheels. The token and treasury payouts are not live yet.</p>

      <div className="tk-triad" data-testid="section-status-triad">
        <div><span className="tk-tag is-live">LIVE</span><h3>Private swaps</h3><p>The private route and Privacy swap. <Link href="/swap" className="tk-link">Open route</Link></p></div>
        <div><span className="tk-tag">FOUNDER DEMO</span><h3>Founder previews</h3><p>Read-only demos and research tools, separate from live routes. Access through the Founder previews link in the footer.</p></div>
         <div><span className="tk-tag">PLANNED</span><h3>$DARK holder incentives</h3><p>Awaiting the token launch, verified treasury funding, and final distribution rules.</p></div>
      </div>

      <section className="tk-section" aria-labelledby="tk-flywheel">
        <h2 id="tk-flywheel">One reward source. Two DarkSwap flywheels.</h2>
         <p>StonkFun supplies the underlying holder-rewards mechanism. The team holds $DARK and accrues distributions from that mechanism, just as an eligible holder would. We then use the team’s dividends—not public holders’ rewards—to fund $DARK buyback and burn and separate loyalty airdrops in Zcash (ZEC).</p>
         <p>The selected 3% is StonkFun’s holder-rewards transfer-tax setting, not a 3% return or APY. Rewards depend on platform activity and actual distributions; they are not guaranteed.</p>
        <ol className="tk-flow">
          {flow.map(s => <li key={s.n} className={s.split ? 'is-split' : ''} data-testid={`card-flow-${s.n}`}><span className="n">{s.n}</span><h3>{s.title}</h3><p>{s.body}</p></li>)}
        </ol>
         <div className="tk-callout"><p><b>Scope of the 50%.</b> Of rewards accrued by the $DARK team’s allocations, 50% is planned for $DARK buyback and burn and 50% for conversion to ZEC, distributed to qualifying consecutive holders above 100,000 $DARK and scaled by wallet weight. The split does not take public holders’ rewards, apply to all trading volume, or create a 50% token tax.</p></div>
         <p>StonkFun can distribute a paired token on Solana. A token labelled NEAR is not automatically native NEAR, just as a token labelled ZEC is not native Zcash. Exact reward assets, conversion routes and payout networks must be verified and published before activation.</p>
      </section>

      <section className="tk-section" aria-labelledby="tk-streak">
        <h2 id="tk-streak">Holder streak</h2>
        <div className="tk-two">
          <div className="tk-box"><h3>Three-day snapshot streak</h3><p>Proposed: hold more than 100,000 DARK at 12-hour snapshots for three days. At or below 100,000 resets the streak. This is an existing proposal, not live.</p></div>
          <div className="tk-box"><h3>Wallet-weighted ZEC rewards</h3><p>After eligibility, planned ZEC distributions scale by wallet weight rather than paying every qualifying wallet the same amount. The exact weighting formula and any daily progression or compounding rate remain unfinalized. No multiplier, APY or example return is promised.</p></div>
          <div className="tk-box" data-testid="card-stonkfun-threshold"><h3>StonkFun’s $20 holder rule</h3><p>The $20-or-more holding threshold is StonkFun’s rule for its platform holder rewards, not an additional rule created by DarkSwap. It is separate from our planned ZEC loyalty eligibility: more than 100,000 $DARK held across consecutive snapshots.</p></div>
          <div className="tk-box"><h3>Three separate things</h3><ul>
            <li>Treasury incentive pool: the NEAR and ZEC set aside for rewards.</li>
            <li>DEX liquidity: trading depth for DARK, never the incentive pool.</li>
            <li>Account points: non-cash email points. <Link href="/rewards" className="tk-link">Account points</Link></li>
          </ul></div>
        </div>
      </section>

      <section className="tk-section" aria-labelledby="tk-roadmap" data-testid="section-token-roadmap">
        <h2 id="tk-roadmap">The rollout</h2>
        <div className="tk-two">
          <div className="tk-box" data-testid="card-token-phase-one">
            <span className="tk-tag">PHASE 1 / PLANNED</span>
            <h3>$DARK × $NEAR</h3>
            <p>Launch on StonkFun with the 3% holder-rewards setting. Use dividends earned by the team’s $DARK holdings to fund the 50 / 50 split: $DARK buyback and burn, and wallet-weighted ZEC loyalty airdrops.</p>
          </div>
          <div className="tk-box" data-testid="card-token-phase-two">
            <span className="tk-tag">PHASE 2 / PLANNED</span>
            <h3>The DarkSwap flywheel launchpad</h3>
            <p>Introduce our own flywheel launchpad featuring $DARK paired with a wider range of assets and new reward concepts. The ambition is open-ended; supported pairings, launch mechanics and release timing will be announced as they are developed and validated.</p>
            <p>The launchpad is a future product, not a live token-creation or trading service.</p>
          </div>
        </div>
      </section>

      <section className="tk-section" aria-labelledby="tk-status">
        <h2 id="tk-status">Current status</h2>
         <p>Mint, treasury and trading-pool addresses are not available yet. This dashboard will need verified data sources before showing balances, holder counts or payout history. Unavailable does not mean zero.</p>
        <dl className="tk-stats">
          {stats.map(s => <div className="tk-stat" key={s.k} data-testid={`stat-${s.k.toLowerCase().replace(/[^a-z]+/g, '-')}`}><dt>{s.k}</dt><dd>{s.v}</dd><small>{s.n}</small></div>)}
        </dl>
      </section>

      <section className="tk-section" aria-labelledby="tk-reqs">
        <h2 id="tk-reqs">Treasury and launch requirements</h2>
        <p>Before any of this can be described as active, each item must be done and shown publicly.</p>
        <ul className="tk-reqs">
          {reqs.map(([k, v]) => <li key={k}><b>{k}</b><span>{v}</span></li>)}
        </ul>
      </section>

      <section className="tk-section" aria-labelledby="tk-unresolved">
        <h2 id="tk-unresolved">Launch details still to publish</h2>
         <p>Our launch direction is set: <a className="tk-link" href="https://stonkfun.xyz" target="_blank" rel="noopener noreferrer" data-testid="link-stonkfun-platform">StonkFun (external) <ArrowUpRight size={14} style={{display:'inline',verticalAlign:'middle'}} /></a>, a $NEAR pairing and the 3% holder-rewards setting. The official token address, supply, authorities, treasury and pool addresses, exact asset representations, payout networks and loyalty weighting formula still need to be published. Platform terms and regional restrictions apply; launching on StonkFun does not imply its endorsement of DarkSwap.</p>
        <div className="tk-ctas">
          <Link href="/swap" className="primary-button" style={{textDecoration:'none'}} data-testid="link-tokenomics-swap">Use the live private route <ArrowRight size={16} /></Link>
          <Link href="/docs" className="secondary-button" style={{textDecoration:'none'}} data-testid="link-tokenomics-docs">Read the docs</Link>
        </div>
      </section>
    </main>
    <Footer />
  </div>;
}

const PRELAUNCH: LeaderboardSource = {
  status: 'unavailable',
  reason: '$DARK has not launched and its mint address is not confirmed, so there are no holder balances to read. Rankings will appear only after launch, once on-chain balances can be verified.',
};

function Breadcrumb({ leaf }: { leaf?: string }) {
  return <nav className="tk-crumbs" aria-label="Breadcrumb"><ol>
    <li>{leaf ? <Link href="/tokenomics" data-testid="link-crumb-tokenomics">Tokenomics</Link> : <span aria-current="page">Tokenomics</span>}</li>
    {leaf && <li><span aria-current="page">{leaf}</span></li>}
  </ol></nav>;
}

function SubNav({ active }: { active: 'overview' | 'leaderboard' }) {
  return <nav className="tk-subnav" aria-label="Tokenomics sections">
    <Link href="/tokenomics" className={active === 'overview' ? 'active' : ''} aria-current={active === 'overview' ? 'page' : undefined} data-testid="link-tokenomics-overview">Proposal</Link>
    <Link href="/tokenomics/leaderboard" className={active === 'leaderboard' ? 'active' : ''} aria-current={active === 'leaderboard' ? 'page' : undefined} data-testid="link-tokenomics-leaderboard">Holder leaderboard</Link>
  </nav>;
}

export function TokenomicsLeaderboard() {
  return <div className="app-shell tk-page"><Header/>
    <main className="tk-main page-enter">
      <Breadcrumb leaf="Leaderboard"/>
      <SubNav active="leaderboard"/>
      <div className="tk-eyebrow">DARKSWAP / TOKENOMICS / HOLDER LEADERBOARD</div>
      <h1>Holder <span>leaderboard.</span></h1>
      <p className="tk-intro">When live, Solana wallets will be ranked by $DARK holdings, largest first. Equal holdings share a rank.</p>
      <HolderLeaderboard source={PRELAUNCH}/>
      <ul className="tk-notes">
        <li>Not a rewards program. Appearing on this list does not earn points or payouts.</li>
        <li>The scheduled loyalty streak checker is on hold and is not shown here.</li>
        <li>No wallet connection, signature or enrollment is requested.</li>
      </ul>
    </main>
  <Footer/></div>;
}
