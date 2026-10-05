import { ArrowUpRight, CalendarCheck, Info } from "lucide-react";
import { Link } from "wouter";
import "./loyalty-explainer.css";

const steps = [
  { code: "01", title: "Creator fees arrive in wNEAR", body: "Fees from $DARK trading are collected in wNEAR." },
  { code: "02", title: "Half goes to holders", body: "Shared with qualifying holders, weighted by balance. ZEC rewards are planned." },
  { code: "03", title: "Half compounds as ZEC", body: "Converted to ZEC and held in the creator wallet." },
] as const;

export function LoyaltyExplainer() {
  return (
    <section className="loyalty-section" id="loyalty-rewards" aria-labelledby="loyalty-title" data-testid="section-loyalty-rewards">
      <div className="loyalty-inner">
        <header className="loyalty-header">
          <div>
            <span className="loyalty-overline"><span className="loyalty-square" /> wNEAR DISTRIBUTED · ZEC PLANNED</span>
            <h2 id="loyalty-title">Creator fees.<br /><em>Two DarkSwap flywheels.</em></h2>
          </div>
          <p>Fees flow back to holders and the token. Seven airdrops so far, all verified on-chain.</p>
        </header>

        <div className="loyalty-status" role="note" data-testid="status-loyalty-live">
          <span className="loyalty-pill">wNEAR DISTRIBUTED</span>
          <span>Every confirmed payout is listed on the <a href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer">DARK Rewards console ↗</a>. Past distributions do not guarantee future payouts.</span>
        </div>

        <div className="loyalty-grid">
          <ol className="loyalty-flow" aria-label="How creator fees are allocated">
            {steps.map((step, i) => (
              <li key={step.code} className={`loyalty-step${i === 0 ? " is-pool" : ""}`} data-testid={`card-loyalty-step-${step.code}`}>
                <span className="loyalty-step-code">{step.code}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  {i === 1 && (
                    <div className="loyalty-tokens" aria-label="Reward asset">
                      <span className="tok tok-zec">ZEC</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <aside className="loyalty-side">
            <div className="loyalty-card loyalty-weekly">
              <div className="loyalty-card-top"><CalendarCheck size={18} /><h3>Eligibility</h3></div>
              <p>Hold at least 100,000 $DARK through every snapshot. Snapshots are taken at random times, and shares follow your lowest balance.</p>
            </div>
            <div className="loyalty-card loyalty-clarify">
              <div className="loyalty-card-top"><Info size={18} /><h3>Fine print</h3></div>
              <p>Rewards vary with holdings. No schedule or return is promised.</p>
            </div>
          </aside>
        </div>

        <div className="loyalty-foot">
          <p><b>Next: Phase 2, Dark Pool.</b> Details soon.</p>
          <a href="https://rewards.darkswap.app" className="loyalty-link" target="_blank" rel="noopener noreferrer" data-testid="link-rewards-site">View confirmed rewards <ArrowUpRight size={15} /></a>
        </div>
      </div>
    </section>
  );
}
