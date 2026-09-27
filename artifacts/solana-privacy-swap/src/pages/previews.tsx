import { useEffect } from 'react';
import { ArrowRight, FileText, Layers3, ScanSearch, Split } from 'lucide-react';
import { Link } from 'wouter';
import { Footer, Header } from '../components/swap-ui';
import './previews.css';

const features = [
  {
    number: '01',
    icon: ScanSearch,
    status: 'SEARCHABLE BETA',
    title: 'Screener Beta',
    copy: 'Search a dated, provider-reported catalog of Solana xStock and PreStock entries. No live prices or verified backing.',
    href: '/screener-beta',
    action: 'Search the catalog',
  },
  {
    number: '02',
    icon: Split,
    status: 'INTERACTIVE PREVIEW',
    title: 'Split Mixer for Solana',
    copy: 'Sketch a multi-recipient allocation and intended legs, manually or with CSV. This is a planning preview: no funds are pooled, mixed, or transferred.',
    href: '/split-mixer-preview',
    action: 'Open mixer draft',
  },
  {
    number: '03',
    icon: Layers3,
    status: 'CONCEPT PREVIEW',
    title: 'Privacy Bundle for Launchers',
    copy: 'Explore a launch-planning concept with a 1–12 hour funding window. On-chain activity remains analyzable; no privacy outcome is guaranteed.',
    href: '/privacy-bundle-preview',
    action: 'Explore the concept',
  },
] as const;

export default function Previews() {
  useEffect(() => {
    const original = document.title;
    document.title = 'Feature previews | DarkSwap';
    return () => { document.title = original; };
  }, []);

  return <div className="app-shell pv-page">
    <Header />
    <main className="pv-main">
      <div className="pv-eyebrow">DARKSWAP / WHAT'S NEXT</div>
      <h1>Ideas in <span>preview.</span></h1>
      <p className="pv-intro">Explore what we're working on without confusing a draft with a live route. The existing private route and Privacy swap are the open Solana-origin transaction flows.</p>
      <div className="pv-status"><FileText size={18} aria-hidden="true" /><span>Previews are for exploration. No wallet connection, payment, funding, or launch transaction is initiated here.</span></div>
      <div className="pv-grid">
        {features.map(feature => {
          const Icon = feature.icon;
          return <article className="pv-card" key={feature.href}>
            <div className="pv-card-top"><span>{feature.number} / {feature.status}</span><Icon size={25} aria-hidden="true" /></div>
            <h2>{feature.title}</h2>
            <p>{feature.copy}</p>
            <Link href={feature.href} className="pv-card-link">{feature.action} <ArrowRight size={17} aria-hidden="true" /></Link>
          </article>;
        })}
      </div>
      <p className="pv-footnote">Explore and public swaps remain closed beta. Research and planning previews do not indicate route or asset availability.</p>
    </main>
    <Footer />
  </div>;
}