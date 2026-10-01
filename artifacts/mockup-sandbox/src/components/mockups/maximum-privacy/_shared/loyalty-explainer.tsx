import { ArrowUpRight, CalendarCheck, Info } from "lucide-react";
import { Link } from "./preview-link";
import "./loyalty-explainer.css";

const steps = [
  { code: "01", title: "Team allocation accrues rewards", body: "Planned: DARK team allocations earn NEAR from applicable StonkFun token fee distributions. Provider entitlement is unverified." },
  { code: "02", title: "50% funds streak bonuses", body: "Half of the team's accrued rewards would back additional ZEC for holders on a streak." },
  { code: "03", title: "50% buys back and burns DARK", body: "The other half would go to DARK buyback and burn." },
] as const;

export function LoyaltyExplainer() {
  return (
    <section className="loyalty-section" id="loyalty-rewards" aria-labelledby="loyalty-title" data-testid="section-loyalty-rewards">
      <div className="loyalty-inner">
        <header className="loyalty-header">
          <div>
            <span className="loyalty-overline"><span className="loyalty-square" /> PLANNED / NOT YET LIVE</span>
            <h2 id="loyalty-title">A holder streak,<br /><em>not a yield promise.</em></h2>
          </div>
          <p>DARK is unlaunched. This is the plan in short: a three-day holder streak unlocks eligibility, then daily progression is planned. No rate or formula is set.</p>
        </header>

        <div className="loyalty-status" role="note" data-testid="status-loyalty-not-live">
          <span className="loyalty-pill">NOT YET LIVE</span>
          <span>No token, treasury or payout exists yet. Nothing here is an APY, return or guarantee.</span>
        </div>

        <div className="loyalty-grid">
          <ol className="loyalty-flow" aria-label="Planned flow of team accrued rewards">
            {steps.map((step, i) => (
              <li key={step.code} className={`loyalty-step${i === 0 ? " is-pool" : ""}`} data-testid={`card-loyalty-step-${step.code}`}>
                <span className="loyalty-step-code">{step.code}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  {i === 1 && (
                    <div className="loyalty-tokens" aria-label="Planned bonus asset">
                      <span className="tok tok-zec">ZEC</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <aside className="loyalty-side">
            <div className="loyalty-card loyalty-weekly">
              <div className="loyalty-card-top"><CalendarCheck size={18} /><h3>Daily / 3-day mechanism</h3></div>
              <p><b>3-day streak:</b> proposed eligibility is holding more than 100,000 DARK across 12-hour snapshots for three days. At or below 100,000 resets the streak.</p>
              <p><b>Daily progression:</b> planned after eligibility, with compounding. The exact rate and formula are not set.</p>
            </div>
            <div className="loyalty-card loyalty-clarify">
              <div className="loyalty-card-top"><Info size={18} /><h3>What this is not</h3></div>
              <ul>
                <li>It is 50% of the team's accrued rewards, not of trading volume.</li>
                <li>It is not a 50% token tax.</li>
                <li>It does not change non-cash account points.</li>
              </ul>
            </div>
          </aside>
        </div>

        <div className="loyalty-foot">
          <p><b>About this model.</b> Treasury balances, holder counts and payouts are not connected or active. The incentive pool is separate from DEX liquidity. No endorsement by StonkFun is implied.</p>
          <Link href="/tokenomics" className="loyalty-link" data-testid="link-tokenomics">Read the full tokenomics <ArrowUpRight size={15} /></Link>
        </div>
      </div>
    </section>
  );
}
