import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Footer, Header } from '../components/swap-ui';
import './docs.css';
import './whitepaper.css';
import { sections } from './whitepaper-content';

export default function DocsDarkPool() {
  const section = sections.find(s => s.id === 'darkpool');
  useEffect(() => {
    const previous = document.title;
    document.title = 'The dark pool on NEAR | DarkSwap Docs';
    return () => { document.title = previous; };
  }, []);
  if (!section) throw new Error('Whitepaper v0.3 section 05 is missing.');
  return <div className="app-shell docs-shell wp-shell">
    <Header />
    <div className="docs-banner"><BookOpen size={17} aria-hidden="true"/><span>DARKSWAP / DOCS</span><span className="docs-banner-rule"/><span>Dark pool on NEAR</span></div>
    <div className="docs-layout wp-layout">
      <aside className="docs-sidebar" aria-label="Related documentation">
        <div className="docs-sidebar-top"><span>DOCUMENTATION</span></div>
        <nav className="docs-nav-group" aria-label="Reference">
          <span>REFERENCE</span>
          <Link href="/docs">Docs overview</Link>
          <Link href="/docs/whitepaper">Whitepaper v0.3</Link>
          <Link href="/docs/confidential-routing">Confidential routing &amp; ZK</Link>
        </nav>
      </aside>
      <main className="docs-main docs-article-main wp-main">
        <header className="docs-intro">
          <p className="docs-kicker">DARKSWAP / SCHEDULED</p>
          <h1>{section.title}</h1>
        </header>
        <div className="docs-content">
          <section id="darkpool" className="docs-section wp-section">
            <div className="wp-section-head"><span className="docs-section-num">{section.num}</span><span className="wp-tags"><span className="wp-tag wp-tag-scheduled">scheduled</span></span></div>
            {section.body}
            <p>Scheduled. Not available to use. Target: late October 2026, subject to NEAR enabling access.</p>
            <p className="docs-resource-note"><Link href="/docs">Docs overview</Link> · <Link href="/docs/whitepaper">Whitepaper v0.3</Link></p>
            <div className="docs-end"><img src={`${import.meta.env.BASE_URL}brand/shield.png`} alt=""/><div><strong>Status: scheduled, not live.</strong><p>Target: late October 2026, subject to NEAR enabling access. It is a target, not a commitment. Private swaps are the live product today.</p><Link className="docs-inline-link" href="/near-swap">Check a live quote <ArrowRight size={17} aria-hidden="true"/></Link></div></div>
          </section>
        </div>
      </main>
    </div>
    <Footer/>
  </div>;
}
