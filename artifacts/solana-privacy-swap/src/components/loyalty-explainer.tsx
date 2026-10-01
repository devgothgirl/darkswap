import { ArrowUpRight, CalendarCheck, Info } from "lucide-react";
import { Link } from "wouter";
import "./loyalty-explainer.css";

const steps = [
  { code: "01", title: "Hold $DARK. Accrue team dividends.", body: "Launch plan: $DARK paired with $NEAR on StonkFun at its 3% holder-rewards tax setting. The team holds $DARK and uses the platform rewards it receives to fund our own flywheels." },
  { code: "02", title: "50% converts to ZEC for holders", body: "Half of the team's accrued rewards would convert to ZEC for qualifying consecutive holders above 100,000 $DARK, with distributions scaled by wallet weight." },
  { code: "03", title: "50% buys back and burns DARK", body: "The other half would go to DARK buyback and burn." },
] as const;

export function LoyaltyExplainer() {
  return (
    <section className="loyalty-section" id="loyalty-rewards" aria-labelledby="loyalty-title" data-testid="section-loyalty-rewards">
      <div className="loyalty-inner">
        <header className="loyalty-header">
          <div>
            <span className="loyalty-overline"><span className="loyalty-square" /> PLANNED / NOT YET LIVE</span>
            <h2 id="loyalty-title">Team dividends.<br /><em>Two DarkSwap flywheels.</em></h2>
          </div>
          <p>$DARK is unlaunched. The plan: a three-day streak above 100,000 $DARK unlocks eligibility for wallet-weighted ZEC rewards. The exact allocation formula is not set.</p>
        </header>

        <div className="loyalty-status" role="note" data-testid="status-loyalty-not-live">
          <span className="loyalty-pill">NOT YET LIVE</span>
          <span>$DARK and payouts are not live. The 3% is a holder-rewards tax setting, not a yield or APY.</span>
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
              <p><b>Wallet weight:</b> planned ZEC rewards scale by wallet weight after eligibility. The exact weighting formula and any daily progression or compounding rate are not set.</p>
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
          <p><b>Next: Phase 2.</b> A DarkSwap flywheel launchpad featuring $DARK paired with new assets and reward concepts. Pairings and timing are still to be announced; the launchpad is not live.</p>
          <Link href="/tokenomics" className="loyalty-link" data-testid="link-tokenomics">Read the full tokenomics <ArrowUpRight size={15} /></Link>
        </div>
      </div>
    </section>
  );
}
