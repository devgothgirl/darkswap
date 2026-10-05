import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowRight, BookOpen, ChevronRight, Printer } from 'lucide-react';
import { Footer, Header } from '../components/swap-ui';
import { trackEvent } from '../lib/analytics';
import './docs.css';
import './whitepaper.css';
import { constants, paperMeta, sections, statusMeaning, underReview, type Status } from './whitepaper-content';

function StatusTags({ status }: { status: Status | Status[] }) {
  const list = Array.isArray(status) ? status : [status];
  return <span className="wp-tags" aria-label={`Status: ${list.join(', ')}`}>{list.map(s => <span key={s} className={`wp-tag wp-tag-${s}`}>{s}</span>)}</span>;
}

export default function Whitepaper() {
  const printMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('print');
  useEffect(() => {
    const previous = document.title;
    document.title = 'DarkSwap Whitepaper | Plain-language edition';
    trackEvent('whitepaper_opened', { mode: printMode ? 'print' : 'page' });
    if (printMode) document.documentElement.classList.add('wp-print');
    return () => { document.title = previous; document.documentElement.classList.remove('wp-print'); };
  }, [printMode]);

  return <div className="app-shell docs-shell wp-shell">
    {!printMode && <Header />}
    {!printMode && <div className="docs-banner"><BookOpen size={17} aria-hidden="true"/><span>DARKSWAP / WHITEPAPER</span><span className="docs-banner-rule"/><span>Plain-language edition</span></div>}
    <div className="docs-layout wp-layout">
      {!printMode && <aside className="docs-sidebar" aria-label="Whitepaper sections">
        <div className="docs-sidebar-top"><span>WHITEPAPER</span></div>
        <nav className="docs-nav-group" aria-label="Sections">
          <span>SECTIONS</span>
          {sections.map(s => <a key={s.id} href={`#${s.id}`} data-testid={`link-wp-${s.id}`} onClick={() => trackEvent('whitepaper_section_opened', { section: s.id })}>{s.title}<ChevronRight size={15} aria-hidden="true"/></a>)}
          <a href="#constants" data-testid="link-wp-constants" onClick={() => trackEvent('whitepaper_section_opened', { section: 'constants' })}>Key numbers<ChevronRight size={15} aria-hidden="true"/></a>
        </nav>
        <nav className="docs-nav-group" aria-label="Related documentation">
          <span>REFERENCE</span>
          <Link href="/docs" data-testid="link-wp-docs">Product guide <ChevronRight size={15} aria-hidden="true"/></Link>
          <Link href="/docs/confidential-routing" data-testid="link-wp-confidential">Confidential routing &amp; ZK <ChevronRight size={15} aria-hidden="true"/></Link>
        </nav>
        <div className="docs-sidebar-bottom"><span>PREFER A FILE?</span><a href="?print" target="_blank" rel="noopener" data-testid="link-wp-print" onClick={() => trackEvent('whitepaper_print_opened')}>Print or save as PDF <Printer size={16} aria-hidden="true"/></a></div>
      </aside>}
      <main className="docs-main docs-article-main wp-main">
        {!printMode && <div className="docs-breadcrumb"><Link href="/docs" data-testid="link-wp-breadcrumb">DOCUMENTATION</Link><ChevronRight size={13} aria-hidden="true"/><span>WHITEPAPER</span></div>}
        <header className="docs-intro" id="overview">
          <p className="docs-kicker">DARKSWAP WHITEPAPER · PLAIN-LANGUAGE EDITION</p>
          <h1>{paperMeta.title}</h1>
          <p className="docs-article-reviewed">{paperMeta.basedOn} Written for holders and users; the technical draft remains the reference for reviewers.</p>
          <p>{paperMeta.oneLine}</p>
        </header>

        <section className="wp-legend" aria-label="How to read the status tags">
          <h2>How to read this</h2>
          <p>Every section carries the same status tag the technical draft uses. The tag tells you how much weight to put on what follows.</p>
          <dl>
            {(Object.keys(statusMeaning) as Status[]).map(s => <div key={s}><dt><span className={`wp-tag wp-tag-${s}`}>{s}</span></dt><dd>{statusMeaning[s]}</dd></div>)}
          </dl>
        </section>

        <aside className="wp-review" aria-label="Items under review">
          <strong>Three items are deliberately left out of this edition until they are confirmed.</strong>
          <ul>{underReview.map(item => <li key={item}>{item}</li>)}</ul>
        </aside>

        <div className="docs-content">
          {sections.map(s => <section key={s.id} id={s.id} className="docs-section wp-section">
            <div className="wp-section-head"><span className="docs-section-num">{s.num}</span><StatusTags status={s.status} /></div>
            <h2>{s.title}</h2>
            {s.body}
          </section>)}

          <section id="constants" className="docs-section wp-section">
            <div className="wp-section-head"><span className="docs-section-num">11</span></div>
            <h2>Key numbers</h2>
            <p>The figures named in the draft, with their status. A proposed number is a design target, not a commitment.</p>
            <table className="wp-table">
              <thead><tr><th scope="col">Item</th><th scope="col">Value</th><th scope="col">Status</th></tr></thead>
              <tbody>{constants.map(([k, v, st]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td><td><span className={`wp-tag wp-tag-${st.toLowerCase()}`}>{st.toLowerCase()}</span></td></tr>)}</tbody>
            </table>
            <div className="docs-end"><img src={`${import.meta.env.BASE_URL}brand/shield.png`} alt=""/><div><strong>This edition explains; it does not promise.</strong><p>The technical draft, the deployed contracts and the live order instructions govern. Where this page and those disagree, they win.</p></div></div>
          </section>
        </div>
        {!printMode && <div className="docs-next"><span>USE WHAT IS LIVE</span><strong>Private swaps are open today.</strong><Link href="/swap">Check a live quote <ArrowRight size={18}/></Link></div>}
      </main>
    </div>
    {!printMode && <Footer/>}
  </div>;
}
