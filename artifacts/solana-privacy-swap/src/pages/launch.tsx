import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, ChevronDown, Clock3, LockKeyhole, Menu, X } from "lucide-react";
import { trackEvent, trackLandingClick } from "../lib/analytics";
import { RiskDisclaimer } from "../components/risk-disclaimer";
import { RewardsEstimate } from "../components/rewards-estimate";
import { ZecDarkLiquidity } from "../components/zec-dark-liquidity";
import "./launch.css";

const base = import.meta.env.BASE_URL;

const faqs = [
  {
    topic: "wallets",
    question: "Do I connect a wallet?",
    answer:
      "No. You review the quote, then send the deposit yourself from any Solana wallet. DarkSwap never signs a transaction for you and never holds your funds.",
  },
  {
    topic: "privacy",
    question: "What does “private route” mean here?",
    answer:
      "Routes are designed to keep more of your swap off the public record. Your Solana deposit is still public, and no route guarantees anonymity.",
  },
  {
    topic: "loyalty_rewards",
    question: "How do $DARK rewards work?",
    answer:
      "Half of received $DARK creator fees funds qualifying holders in wNEAR. Scheduled payouts run at 6 a.m. and 6 p.m. Pacific, each from a fresh snapshot: hold at least 100,000 DARK, and shares follow qualifying balances in that snapshot. The other half buys ZEC tokens on Solana for the protocol treasury in the creator wallet. ZEC here is a token on Solana, not native or shielded Zcash. One ZEC-token award has been paid to holders; further awards require separate approval. The DARK Rewards console is the record. Past distributions do not guarantee future payouts.",

  },
  {
    topic: "phase_2",
    question: "What is Phase 2?",
    answer: "The dark pool on NEAR Confidential Intents. It is scheduled, not live. Target: late October 2026, subject to NEAR enabling access.",
  },
  {
    topic: "near_intents",
    question: "What is DarkSwap built on?",
    answer:
      "Privacy swap runs on the NEAR Intents 1Click API with basic confidential handling, and the planned trading terminal is being built on NEAR Intents too. The private route uses a separate routing provider. Every route needs its own live quote; a listed asset does not promise an executable route.",
  },
] as const;

export default function Launch() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <div className="ds-launch" onClickCapture={(event) => trackLandingClick(event.target)}>
      <div className="launch-ribbon"><span className="ribbon-dot" /> Live beta · Private swaps on Solana · Built on NEAR Intents</div>

      <header className="launch-header">
        <div className="launch-shell launch-header-inner">
          <Link href="/" className="launch-brand" aria-label="DarkSwap home">
            <img className="launch-brand-icon" src={`${base}brand/icon.png`} alt="" />
            <img className="launch-brand-wordmark" src={`${base}brand/wordmark.png`} alt="DarkSwap" />
          </Link>
          <button className="mobile-menu-toggle" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-controls="launch-navigation" aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}>
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <nav id="launch-navigation" className={`launch-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
            <span className="launch-nav-label">Live routes</span>
            <Link href="/swap" onClick={() => setMenuOpen(false)}>Private route</Link>
            <Link href="/near-swap" onClick={() => setMenuOpen(false)}>Privacy swap</Link>
            <span className="launch-nav-label">More</span>
            <a href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)} data-testid="link-launch-rewards">Rewards ↗</a>
            <Link className="header-cta" href="/near-swap" onClick={() => setMenuOpen(false)}>Open swap <ArrowUpRight size={15} /></Link>
          </nav>
        </div>
      </header>
      {menuOpen && <button className="launch-menu-backdrop" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <main id="top">
        <section className="launch-shell launch-hero">
          <span className="overline"><span className="overline-square" /> Live beta</span>
          <h1><span>Go dark.</span><em>On NEAR Intents.</em></h1>
          <p className="hero-lede">DarkSwap is a privacy terminal built on NEAR Intents. Swap privately from Solana today. The dark pool on NEAR is next. Our own ZK pools follow after an audit.</p>
          <div className="hero-actions">
            <Link className="hero-cta" href="/near-swap">Open Privacy swap <ArrowRight size={17} /></Link>
            <Link className="hero-cta hero-cta-ghost" href="/swap">Private route <ArrowUpRight size={16} /></Link>
          </div>
          <div className="hero-facts">
            <div><strong>No custody</strong><span>DarkSwap never holds your funds</span></div>
            <div><strong>Manual deposit</strong><span>Nothing moves until you send</span></div>
            <div><strong>Solana origin</strong><span>Swap or bridge out from Solana</span></div>
          </div>
          <p className="section-note hero-near"><Link href="/docs">Read the guide</Link> · <a href={`${base}docs/DarkSwap_Litepaper_v0.3.pdf`} target="_blank" rel="noopener noreferrer" data-testid="link-launch-litepaper">Litepaper (PDF)</a> · <Link href="/docs/whitepaper">Whitepaper v0.3</Link> · Built on <a href="https://near-intents.org/" target="_blank" rel="noopener noreferrer">NEAR Intents</a> — the cross-chain intents network behind Privacy swap.</p>
        </section>

        <section className="launch-shell launch-section" id="scope">
          <div className="section-head">
            <div>
              <span className="overline"><span className="overline-square" /> Beta, with boundaries</span>
              <h2>Four parts, each tagged.</h2>
            </div>
            <p>Read the tag before the text: live, built, scheduled or proposed.</p>
          </div>
          <div className="routes-grid">
            <article className="route-card">
              <div className="route-card-top"><span className="route-status"><i /> live</span><span className="route-code">01</span></div>
              <h3>Private swaps</h3>
              <p>Quote, review, then send the deposit yourself from your own wallet. No account. Confidential routing on NEAR Intents.</p>
              <Link href="/near-swap" className="route-link">Open Privacy swap <ArrowUpRight size={15} /></Link>
              <Link href="/swap" className="route-link">Open private route <ArrowUpRight size={15} /></Link>
            </article>
            <article className="route-card">
              <div className="route-card-top"><span className="route-status is-quiet"><i /> scheduled</span><span className="route-code">02</span></div>
              <h3>Dark pool on NEAR</h3>
              <p>A hidden balance you can deposit into, hold, swap inside and withdraw from. Target: late October 2026, subject to NEAR enabling access.</p>
              <Link href="/docs/dark-pool" className="route-link">Read the dark pool page <ArrowUpRight size={15} /></Link>
            </article>
            <article className="route-card">
              <div className="route-card-top"><span className="route-status is-quiet"><i /> built</span><span className="route-code">03</span></div>
              <h3>Our own ZK pools</h3>
              <p>Zero-knowledge pools for Solana, Ethereum and Base. Local-development preview. Not deployed on any public network. Held back until public testnets, a production setup ceremony and an independent audit.</p>
              <Link href="/pool" className="route-link">Open the ZK pool <ArrowUpRight size={15} /></Link>
            </article>
            <article className="route-card">
              <div className="route-card-top"><span className="route-status"><i /> live</span><span className="route-code">04</span></div>
              <h3>$DARK rewards</h3>
              <p>Paid in wNEAR twice a day, with no claim step. The rewards console is the record.</p>
              <a href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer" className="route-link">Rewards console <ArrowUpRight size={15} /></a>
            </article>
          </div>
        </section>

        <section className="launch-shell launch-section split-section" id="how-it-works">
          <div className="split-copy">
            <span className="overline"><span className="overline-square" /> How it works</span>
            <h2>You make the send.</h2>
            <p>DarkSwap prepares the order and shows you the exact deposit — the transfer always comes from your own wallet.</p>
            <div className="steps-grid">
              <article className="step-card">
                <span className="step-count">01 / QUOTE</span>
                <h3>Pick a route</h3>
                <p>Choose what you send and where it should land.</p>
                <span className="step-foot">No wallet connected</span>
              </article>
              <article className="step-card">
                <span className="step-count">02 / REVIEW</span>
                <h3>Check the details</h3>
                <p>See the estimate, the fee and the address before anything happens.</p>
                <span className="step-foot">Quote before commitment</span>
              </article>
              <article className="step-card">
                <span className="step-count">03 / SEND</span>
                <h3>Deposit yourself</h3>
                <p>Send the exact amount from your own wallet, then track the order.</p>
                <span className="step-foot">You control the send</span>
              </article>
            </div>
            <p className="section-note"><Clock3 size={15} /> Timing and availability vary with the live quote.</p>
          </div>
          <div className="split-poster">
            <img className="poster" src={`${base}brand/poster-you-make-the-send.jpg`} alt="DarkSwap campaign art: a hand pressing the send button on its own deposit" loading="lazy" decoding="async" width="1024" height="1024" />
          </div>
        </section>

        <section className="launch-shell launch-section split-section" id="boundaries">
          <div className="split-poster">
            <img className="poster" src={`${base}brand/poster-public-by-default.jpg`} alt="DarkSwap campaign art: public by default" loading="lazy" decoding="async" width="1254" height="1254" />
          </div>
          <div className="split-copy">
            <span className="overline"><span className="overline-square" /> Privacy, precisely</span>
            <h2>Public by default.</h2>
            <p>A chain records everything by default. A private route changes part of that picture, not all of it — so here is the line.</p>
            <ul className="split-list">
              <li><i /><span><b>Still public:</b> your Solana deposit, its amount and the wallet it came from.</span></li>
              <li><i /><span><b>Not shared with us:</b> your keys and your signature. You never connect a wallet to DarkSwap.</span></li>
              <li><i /><span><b>Depends on the route:</b> how much of the onward path stays off the public record. No route guarantees anonymity.</span></li>
            </ul>
          </div>
        </section>

        <ZecDarkLiquidity />

        <section className="record-section launch-section" id="rewards">
          <div className="launch-shell record-grid">
            <div>
              <span className="overline"><span className="overline-square" /> wNEAR rewards · ZEC treasury</span>
              <h2>Check the record.</h2>
              <p>Half of received $DARK creator fees funds qualifying holders in wNEAR. The other half purchases ZEC tokens on Solana for the protocol treasury in the creator wallet. Treasury holdings, separately authorized liquidity deployments, LP fee compounding, and completed holder payouts are tracked separately.</p>
              <ul className="record-fees">
                <li><span>01</span>Received creator fees arrive in wNEAR from $DARK trading.</li>
                <li><span>02</span>Half funds qualifying holders in wNEAR, from a fresh snapshot at each 6 a.m. and 6 p.m. Pacific payout. 100,000 DARK minimum.</li>
                <li><span>03</span>Half buys ZEC tokens on Solana for the treasury. Holding them is not compounding; liquidity deployments are separate.</li>
              </ul>
              <a className="record-link" href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer" data-testid="link-confirmed-rewards">Every payout, listed on the rewards console <ArrowUpRight size={15} /></a>
            </div>
            <div>
              <RewardsEstimate />
            </div>
          </div>
        </section>

        <section className="launch-shell launch-section" id="questions">
          <div className="section-head">
            <div>
              <span className="overline"><span className="overline-square" /> Before you send</span>
              <h2>Good to know.</h2>
            </div>
            <p>The short version.</p>
          </div>
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div className={`faq-item ${openFaq === index ? "faq-open" : ""}`} key={faq.question}>
                <h3>
                  <button type="button" aria-expanded={openFaq === index} aria-controls={`faq-answer-${index}`} onClick={() => {
                    if (openFaq !== index) trackEvent("faq_opened", { topic: faq.topic });
                    setOpenFaq(openFaq === index ? null : index);
                  }}>
                    <span className="faq-num">0{index + 1}</span><span>{faq.question}</span><ChevronDown size={17} />
                  </button>
                </h3>
                <div id={`faq-answer-${index}`} className="faq-answer" hidden={openFaq !== index}><p>{faq.answer}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="closing-cta">
          <div className="launch-shell">
            <h2>Start with a quote.<br /><em>Decide from there.</em></h2>
            <p>Nothing moves until you send.</p>
            <div className="closing-actions">
              <Link className="hero-cta" href="/near-swap">Open Privacy swap <ArrowRight size={17} /></Link>
              <Link className="hero-cta hero-cta-ghost" href="/swap">Private route <ArrowUpRight size={16} /></Link>
            </div>
            <span className="closing-note"><LockKeyhole size={13} /> Creating an order moves no funds</span>
          </div>
        </section>
      </main>

      <RiskDisclaimer showDocsLink={false} />
      <footer className="launch-shell launch-footer">
        <Link href="/" className="launch-brand footer-brand">
          <img className="launch-brand-icon" src={`${base}brand/icon.png`} alt="" />
          <img className="launch-brand-wordmark" src={`${base}brand/wordmark.png`} alt="DarkSwap" />
        </Link>
        <span className="footer-caption">Solana origin · Manual deposit · Built on NEAR Intents</span>
        <div className="footer-links">
          <a href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer">$DARK rewards <ArrowUpRight size={14} /></a>
          <Link href="/rewards">Account points <ArrowUpRight size={14} /></Link>
          <Link href="/docs">Docs <ArrowUpRight size={14} /></Link>
          <a href={`${base}docs/DarkSwap_Litepaper_v0.3.pdf`} target="_blank" rel="noopener noreferrer" data-testid="link-footer-litepaper">Litepaper (PDF) <ArrowUpRight size={14} /></a>
          <Link href="/docs/whitepaper">Whitepaper v0.3 <ArrowUpRight size={14} /></Link>
        </div>
      </footer>
    </div>
  );
}
