import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, LockKeyhole, Menu, Shield, X } from "lucide-react";
import "./_group.css";
import "./QuietControl.css";

// Independent exploration of the extracted Current homepage.
// Route descriptions are local disclosures, never quotes, orders, or live links.
const faqs = [
  { question: "What does “maximum privacy” mean?", answer: "It describes DarkSwap’s design goal, not a verified privacy ranking or an absolute result. The product is built around private routing, an order that moves no funds when created, and a deposit you make yourself. Privacy depends on the route and its providers. Solana deposits remain public, and destination transfers may be public." },
  { question: "Do I connect a wallet?", answer: "Not for the two live Solana-origin swap routes. You request a quote without connecting a wallet to DarkSwap. After reviewing the quote and creating an order, you send the exact deposit amount yourself from your Solana wallet. DarkSwap does not send a transaction for you." },
  { question: "What should I check before sending?", answer: "Check the selected asset, destination network, recipient and any refund address, quote, fees, limits, estimated time, and deposit instructions. Creating an order does not move your funds. Make a deposit only after checking the exact address, amount, network and any time limit shown in that order." },
  { question: "Are all assets and destinations supported?", answer: "No. Availability depends on the route, selected amount and destination. A live quote is the source of truth. Private execution may take longer than a direct swap, and execution is not guaranteed. This local preview does not request quotes or create orders." },
  { question: "Are holder rewards live?", answer: "No. NEAR + ZEC loyalty is a planned DARK holder incentive, not yield or active payouts. The proposal starts with a three-day holder streak for eligibility; the daily progression formula and rates are not finalized. Rewards accrued by team allocations would be split 50% toward holder-streak bonuses and 50% toward buyback + burn. Funding and verified eligibility rules still apply." },
];
const process = [
  { title: "Choose what arrives, and where.", copy: "Select a Solana asset and a supported destination. Enter the receiving address. Nothing moves at this step." },
  { title: "Review the quote before the order.", copy: "Check the quote, fees, limits, recipient and estimated time. If the details do not work for you, stop here. Nothing has been sent." },
  { title: "Make the deposit yourself.", copy: "Create the order, then check its deposit instructions. Manually send the exact amount on Solana and track the order as the route progresses." },
];
type Panel = "Docs" | "Tokenomics" | "Founder previews";

export function QuietControl() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [routeOpen, setRouteOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); setPanel(null); }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    if (!panel) return;
    previousFocus.current = document.activeElement as HTMLElement;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = dialog?.querySelectorAll<HTMLElement>("button, a[href], [tabindex='0']");
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", trap); document.body.style.overflow = oldOverflow; previousFocus.current?.focus(); };
  }, [panel]);
  const openPanel = (name: Panel) => { setMenuOpen(false); setPanel(name); };
  const showRoute = (name: string) => { setRouteOpen(name); setMenuOpen(false); };
  const brand = <><img src="/__mockup/images/maximum-privacy/icon.png" alt="" /><img src="/__mockup/images/maximum-privacy/wordmark.png" alt="DarkSwap" /></>;

  return (
    <div className="qc-page" id="qc-top">
      <header className="qc-header">
        <div className="qc-wrap qc-header-inner">
          <a className="qc-brand" href="#qc-top" aria-label="DarkSwap home">{brand}</a>
          <button className="qc-menu" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="qc-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>
          <nav id="qc-navigation" className={`qc-nav ${menuOpen ? "qc-open" : ""}`} aria-label="Main navigation">
            <a href="#qc-routes" onClick={() => showRoute("private")}>Private route</a>
            <a href="#qc-routes" onClick={() => showRoute("privacy")}>Privacy swap</a>
            <button type="button" onClick={() => openPanel("Tokenomics")}>Tokenomics</button>
            <button type="button" onClick={() => openPanel("Docs")}>Docs</button>
            <a href="#qc-process" className="qc-nav-cta" onClick={() => setMenuOpen(false)}>How it works</a>
          </nav>
        </div>
      </header>
      <main>
        <section className="qc-wrap qc-hero" aria-labelledby="qc-promise">
          <div>
            <div className="qc-label"><i className="qc-dot" /> Solana origin · private beta</div>
            <h1 id="qc-promise">Maximum privacy,<br /><span>as intended.</span></h1>
            <p className="qc-promise">Our design goal, not an absolute guarantee.<br />Privacy varies by route. Solana deposits remain public.</p>
            <p className="qc-lede">Choose a route. Review the quote.<br />Send only when you’re ready.</p>
            <div className="qc-hero-actions">
              <a className="qc-button" href="#qc-routes">Explore the live routes <ArrowRight size={18} /></a>
              <a className="qc-text-link" href="#qc-process">See the steps</a>
            </div>
            <p className="qc-preview-note">Local preview only. No quotes, orders or funds.</p>
          </div>
          <div className="qc-control" aria-label="Illustrated manual-deposit process, not a live order">
            <div className="qc-control-cap"><span>THE MANUAL-DEPOSIT MODEL</span><img src="/__mockup/images/maximum-privacy/shield.png" alt="" /></div>
            <h2>Nothing moves until you do.</h2>
            <ol className="qc-sequence">
              <li><span className="qc-number">1</span><div><strong>You choose</strong><p>The route, asset and receiving address.</p></div></li>
              <li><span className="qc-number">2</span><div><strong>You review</strong><p>The quote and its details before an order.</p></div></li>
              <li><span className="qc-number">3</span><div><strong>You send</strong><p>A manual deposit from your Solana wallet.</p></div></li>
            </ol>
            <div className="qc-control-foot"><LockKeyhole size={16} /> No automatic send. Creating an order moves no funds.</div>
          </div>
        </section>
        <div className="qc-wrap qc-assurance" aria-label="Product essentials">
          <span><LockKeyhole /> Creating an order moves no funds</span>
          <span><Check /> A quote before commitment</span>
          <span><ArrowUpRight /> A deposit you send yourself</span>
        </div>

        <section className="qc-wrap qc-process" id="qc-process">
          <div className="qc-heading">
            <div className="qc-label">01 / A deliberate flow</div>
            <h2>A clear decision<br />at every step.</h2>
            <p>DarkSwap prepares the order. You decide whether to fund it. Private routing should be understandable before it becomes a transaction.</p>
            <a className="qc-text-link" href="#qc-questions">What to check before sending <ArrowRight size={16} /></a>
          </div>
          <div className="qc-process-list">
            {process.map((step, index) => <article key={step.title}><span className="qc-label">0{index + 1}</span><div><h3>{step.title}</h3><p>{step.copy}</p></div></article>)}
            <p className="qc-process-note"><Clock3 size={16} /> Availability and timing vary. Private execution can take longer than a direct swap.</p>
          </div>
        </section>

        <section className="qc-route-section" id="qc-routes">
          <div className="qc-wrap">
            <div className="qc-route-heading">
              <div className="qc-heading"><div className="qc-label">02 / Route overview</div><h2>Two routes. Your decision.</h2></div>
              <p>Both start on Solana and use a manual deposit. Explore the descriptions here; this preview does not open a live swap.</p>
            </div>
            <div className="qc-routes">
              <article className="qc-route">
                <div className="qc-route-top"><img src="/__mockup/images/maximum-privacy/atom.png" alt="" /><span>LIVE IN PRIVATE BETA</span></div>
                <h3>Existing private route</h3>
                <p>A Solana-origin swap or bridge when a live quote is available. Review the supported destination, then decide whether to deposit.</p>
                <button className="qc-text-link" type="button" aria-expanded={routeOpen === "private"} aria-controls="qc-private-detail" onClick={() => setRouteOpen(routeOpen === "private" ? null : "private")}>View private route details <ArrowRight size={16} /></button>
                <div className="qc-route-detail" id="qc-private-detail" hidden={routeOpen !== "private"}><strong>Local route description — not an order</strong><p>Creating an order moves no funds. In the live flow, request and review a quote, create an order, then manually send its exact Solana deposit.</p><p>Assets, destinations, limits and timing depend on the live quote. Privacy varies by provider and route; there is no anonymity guarantee.</p></div>
              </article>
              <article className="qc-route">
                <div className="qc-route-top"><Shield strokeWidth={1.3} /><span>LIVE IN PRIVATE BETA</span></div>
                <h3>Privacy swap</h3>
                <p>Request confidential handling for a supported Solana-origin route. Review the quote, recipient and refund addresses before a manual deposit.</p>
                <button className="qc-text-link" type="button" aria-expanded={routeOpen === "privacy"} aria-controls="qc-privacy-detail" onClick={() => setRouteOpen(routeOpen === "privacy" ? null : "privacy")}>View Privacy swap details <ArrowRight size={16} /></button>
                <div className="qc-route-detail" id="qc-privacy-detail" hidden={routeOpen !== "privacy"}><strong>Local route description — not an order</strong><p>Creating an order moves no funds. The live flow requests confidential handling, shows available quotes, and lets you review recipient and refund addresses before creating an order.</p><p>You fund that order manually. Solana deposits remain public; destination transfers may be public. Confidential handling is not an anonymity guarantee.</p></div>
              </article>
            </div>
            <p className="qc-route-bottom">Supported assets and destinations are determined by the live quote, not this overview.</p>
          </div>
        </section>

        <section className="qc-wrap qc-faq" id="qc-questions">
          <div className="qc-heading"><div className="qc-label">03 / Before you send</div><h2>Plain answers.<br />Better decisions.</h2><p>A private route is not a promise of invisibility. Know what the flow does, and what it does not.</p></div>
          <div>{faqs.map((faq, index) => <div className="qc-faq-item" key={faq.question}><h3><button type="button" aria-expanded={openFaq === index} aria-controls={`qc-answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{faq.question}<ChevronDown size={18} /></button></h3><div id={`qc-answer-${index}`} hidden={openFaq !== index}><p>{faq.answer}</p></div></div>)}</div>
        </section>

        <section className="qc-wrap qc-close"><div><h2>Start with the details.</h2><p>Understand the route first. The decision to send stays yours.</p></div><a href="#qc-routes" className="qc-button">Review the route overview <ArrowRight size={18} /></a></section>
      </main>
      <footer className="qc-footer">
        <div className="qc-wrap">
          <div className="qc-footer-main"><a href="#qc-top" className="qc-brand" aria-label="DarkSwap home">{brand}</a><nav aria-label="Footer"><button onClick={() => openPanel("Tokenomics")} type="button">Tokenomics</button><button onClick={() => openPanel("Docs")} type="button">Docs</button><button onClick={() => openPanel("Founder previews")} type="button">Founder previews</button></nav></div>
          <div className="qc-footer-note"><p>Privacy depends on the route and its providers. Solana deposits remain public; destination transfers may be public. Routes carry financial and execution risk.</p><p>EXPLORATION ONLY<br />No live requests. No real funds.</p></div>
        </div>
      </footer>
      {panel && <div className="qc-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setPanel(null); }}><div ref={dialogRef} className="qc-dialog" role="dialog" aria-modal="true" aria-labelledby="qc-dialog-title"><div className="qc-dialog-head"><h2 id="qc-dialog-title">{panel}</h2><button type="button" onClick={() => setPanel(null)} aria-label="Close information"><X size={20} /></button></div><div className="qc-label">Local preview · information only</div>
        {panel === "Docs" && <><p><strong>Private routing, explained.</strong> The live Solana-origin routes request a quote without a wallet connection. Review quote details, fees, limits, timing and addresses before creating an order.</p><p>Creating an order does not move funds. Check the deposit address, amount, network and any time limit. If you choose to continue, send the deposit yourself and track the order.</p><p>Privacy varies by route and provider. Solana deposits remain public; destination transfers may be public. There is no guarantee of anonymity or execution.</p><p>This is a local summary for evaluating the homepage, not the full product documentation or a live transaction flow.</p></>}
        {panel === "Tokenomics" && <><p><strong>NEAR + ZEC loyalty is planned.</strong> It is a DARK holder proposal, not active payouts, native ZEC staking, yield or a guaranteed return.</p><p>Rewards accrued by team allocations would be split <strong>50% toward holder-streak bonuses</strong> and <strong>50% toward buyback + burn</strong>.</p><p>The ZEC proposal starts with a three-day holder streak for eligibility. Daily progression is planned, but the formula and rates are not finalized. NEAR-related distributions depend on verified StonkFun rules; ZEC distributions depend on a funded treasury and eligibility.</p><p>This local summary does not calculate rewards or represent the complete tokenomics documentation.</p></>}
        {panel === "Founder previews" && <><p><strong>Separate from the live private routes.</strong> The planned cross-chain trading terminal with NEAR Intents is a wallet-based trading experience. Its demo is read-only; live terminal trading is not enabled.</p><p>Founder demos and research tools are not live swaps or a promise of privacy. This homepage mockup provides an information-only summary, with no connection to those tools.</p></>}
      </div></div>}
    </div>
  );
}