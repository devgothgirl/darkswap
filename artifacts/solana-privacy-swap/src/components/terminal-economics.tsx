import { useEffect } from 'react';
import { rewardsProposalDate, rewardsSources } from './rewards-proposal';
import './terminal-economics.css';

const sections = [
  { title: 'Team accrual split: 50% / 50%', paragraphs: [
    'Proposal: rewards accrued by DARK team allocations (NEAR from applicable StonkFun token fee distributions) are split. 50% funds streak bonuses, planned as additional ZEC. 50% funds DARK buyback and burn.',
    'This is 50% of the team’s accrued rewards. It is not all trading volume and not a 50% token tax. It replaces the earlier proposal that sent 50% to terminal funding; that allocation no longer applies.',
  ] },
  { title: 'Daily progression after eligibility', paragraphs: [
    'A three-day snapshot streak (more than 100,000 DARK at 12-hour snapshots; at or below resets) unlocks eligibility. Daily progression with compounding is planned afterwards.',
    'The exact rate and formula are not set. No multiplier, APY or return is implied.',
  ] },
  { title: 'Unresolved items', paragraphs: [
    'The token is unlaunched. Mint address, supply, authorities and any venue-specific 3% tax details are unresolved. The $20-or-more holdings threshold is the existing factual figure for proposed NEAR mechanics and is unverified with the provider.',
  ] },
];

const gates = [
  'Owner approval and legal review, including provider geographic restrictions.',
  'Provider confirmation of the holdings threshold, price source and whether DARK team allocations qualify for distributions.',
  'Published mint, supply, authority inspection and venue-specific tax details.',
  'A funded, publicly addressed treasury, with NEAR and ZEC balances connected to a real data source.',
  'A tested route for NEAR to ZEC conversion and for buyback and burn.',
  'A set daily progression formula, published before any streak is counted.',
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
    <h2 id="terminal-economics-title">Proposed DARK team accrual allocation.</h2>
    <p>No token is minted, fee activated, or reward paid by this preview. This is separate from DarkSwap’s non-cash email account points.</p>
    <p><strong>Research checked {rewardsProposalDate}.</strong> Provider documentation describes general mechanics, not verified DARK entitlements.</p>
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
      <summary>Evidence required before launch. Nothing is activated.</summary>
      <ul>{gates.map(gate => <li key={gate}>{gate}</li>)}</ul>
    </details>
    <details>
      <summary>Sources and verification limits</summary>
      <p>Public documentation can change. Exact eligibility oracle and DARK-specific routes remain unverified. No live funds were sent.</p>
      <ul>{rewardsSources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a></li>)}</ul>
    </details>
  </section>;
}
