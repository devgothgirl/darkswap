import { useEffect } from 'react';
import { rewardsProposalDate, rewardsSources } from './rewards-proposal';
import './terminal-economics.css';

const sections = [
  { title: 'Received creator-fee proceeds: 50% / 50%', paragraphs: [
    'Creator-fee proceeds actually received in wNEAR are split. 50% goes to holder rewards: wNEAR has been distributed, and ZEC payouts to holders remain planned. 50% is converted to ZEC and compounded in the creator wallet.',
    'This is not team-held DARK dividends, inaccessible unclaimed pool fees, all trading volume or a 50% token tax. The dev wallet is distinct from the pool-fee creator and cannot claim that unclaimed amount. The earlier terminal-funding allocation no longer applies.',
  ] },
  { title: 'Holder eligibility', paragraphs: [
    'Hold the 100,000 DARK minimum in every snapshot of the period. One snapshot is taken at a random moment in each 10-minute window; your share is weighted by the lowest balance you held.',
    'Completed airdrops paid wNEAR direct to eligible holders, with no claim needed and verified on-chain. The DARK Rewards console at rewards.darkswap.app is the record of what was paid, to how many wallets and when; past distributions do not guarantee future payouts. No multiplier, APY or return is implied.',
  ] },
  { title: 'Known listing, unverified fee configuration', paragraphs: [
    'StonkFun reports DARK graduated with a NEAR pairing and market activity. The reported creator fee is 1%, paid only in wNEAR, not DARK; its configuration and claim authority remain unverified.',
    'Supply, mint/freeze authorities, transfer-tax details and independent liquidity verification remain unresolved. Treasury balances are unavailable, not zero; no verified balance source is connected.',
  ] },
];

const gates = [
  'Owner approval and legal review, including provider geographic restrictions.',
  'Verification of the reported 1% wNEAR creator-fee configuration, claim authority and actual received proceeds.',
  'Verified supply, mint/freeze authorities, transfer-tax details and pool liquidity for the official Solana mint.',
  'Verified treasury funding, with wNEAR and ZEC balances connected to a real data source.',
  'A verified wNEAR-to-ZEC conversion route for the compounded half.',
];

export function TerminalEconomics() {
  useEffect(() => {
    // A hard navigation can resolve the fragment before React has mounted it.
    if (window.location.hash === '#rewards-proposal') {
      document.getElementById('rewards-proposal')?.scrollIntoView();
    }
  }, []);
  return <section className="terminal-economics" id="rewards-proposal" aria-labelledby="terminal-economics-title">
    <span className="te-label">TOKEN DESIGN / PROPOSAL ONLY</span>
    <h2 id="terminal-economics-title">Proposed DARK creator-fee allocation.</h2>
    <p>No token is minted, fee activated, or reward paid by this preview. This is separate from DarkSwap’s non-cash email account points.</p>
    <p><strong>Research checked {rewardsProposalDate}.</strong> The official listing shows provider-reported graduation and market activity; general provider documentation does not verify DARK fee configuration or claim authority.</p>
    <div className="te-grid">
      {sections.map(section => <article key={section.title}>
        <h3>{section.title}</h3>
        {section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </article>)}
      <article>
        <h3>Demo fees are not route prices</h3>
        <p>The simulated terminal order uses an arbitrary 0.3% demo fee, excludes slippage and rewards, and must not be used to estimate a live trade.</p>
      </article>
    </div>
    <details open>
      <summary>Evidence required before incentive activation</summary>
      <ul>{gates.map(gate => <li key={gate}>{gate}</li>)}</ul>
    </details>
    <details>
      <summary>Sources and verification limits</summary>
      <p>Public documentation can change. The listing does not verify fee receipts, claim authority or incentive eligibility. The ZEC conversion and compounding route remains unverified; this preview sends no funds.</p>
      <ul>{rewardsSources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul>
    </details>
  </section>;
}
