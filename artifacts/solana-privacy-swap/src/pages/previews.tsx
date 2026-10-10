import { useEffect } from 'react';
import { ArrowRight, FileText, Layers3, ScanSearch, ShieldEllipsis, Split, TrendingUp, Waves } from 'lucide-react';
import { Link } from 'wouter';
import { Footer, Header } from '../components/swap-ui';
import { trackEvent } from '../lib/analytics';
import './previews.css';

const features = [
  {
    number: '06',
    id: 'shielded_zcash',
    icon: ShieldEllipsis,
    status: 'CONCEPT PREVIEW / NOT OPEN',
    title: 'Solana ZEC to shielded Zcash',
    copy: 'See the planned flow for sending the Solana ZEC token from your own wallet to a shielded address in your Zcash wallet. It opens only after a routing partner confirms direct shielded delivery.',
    href: '/shielded-zcash-preview',
    action: 'See the planned flow',
    featured: true,
  },
  {
    number: '04',
    id: 'near_trends',
    icon: TrendingUp,
    status: 'RESEARCH / THIRD-PARTY DATA',
    title: 'NEAR trends',
    copy: 'Explore public NEAR pool activity using third-party market data. Informational research only—not a live quote or trading route.',
    href: '/near-trends',
    action: 'Open NEAR trends',
  },
  {
    number: '05',
    id: 'near_discovery',
    icon: Waves,
    status: 'RESEARCH / THIRD-PARTY DATA',
    title: 'Pool discovery',
    copy: 'Search NEAR pools using third-party market data. A listing is not liquidity verification, an endorsement, or an executable trading route.',
    href: '/near-discovery',
    action: 'Open pool discovery',
  },
  {
    number: '00',
    id: 'terminal',
    icon: ScanSearch,
    status: 'READ-ONLY DEMO',
    title: 'Cross-chain trading terminal with NEAR Intents',
    copy: 'Preview our planned cross-chain trading experience with fictional tokens, mock market data and simulated buy or sell calculations. No wallet, deposits or transactions.',
    href: '/terminal-preview',
    action: 'Open terminal preview',
  },
  {
    number: '01',
    id: 'screener',
    icon: ScanSearch,
    status: 'SEARCHABLE BETA',
    title: 'Screener Beta',
    copy: 'Search a dated, provider-reported catalog of Solana xStock and PreStock entries. No live prices or verified backing.',
    href: '/screener-beta',
    action: 'Search the catalog',
  },
  {
    number: '02',
    id: 'split_mixer',
    icon: Split,
    status: 'INTERACTIVE PREVIEW',
    title: 'Split Mixer for Solana',
    copy: 'Sketch a multi-recipient allocation and intended legs, manually or with CSV. This is a planning preview: no funds are pooled, mixed, or transferred.',
    href: '/split-mixer-preview',
    action: 'Open mixer draft',
  },
  {
    number: '03',
    id: 'privacy_bundle',
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
    document.title = 'Founder previews | DarkSwap';
    return () => { document.title = original; };
  }, []);

  return <div className="app-shell pv-page">
    <Header />
    <main className="pv-main">
      <div className="pv-eyebrow">DARKSWAP / FOUNDER PREVIEWS</div>
      <h1>Founder <span>previews.</span></h1>
      <p className="pv-intro">Demos, drafts and research tools, kept apart from the product. Only the private route and Privacy swap are live swap flows. Nothing here is a launch.</p>
      <div className="pv-status"><FileText size={18} aria-hidden="true" /><span>Founder previews are for exploration. The DARK holder rewards program is tracked on the rewards site, not here. No wallet connection, payment, funding, or launch transaction is initiated here.</span></div>
      <div className="pv-grid">
        {features.map(feature => {
          const Icon = feature.icon;
          return <article className="pv-card" key={feature.href} data-featured={'featured' in feature ? 'true' : undefined}>
            <div className="pv-card-top"><span>{feature.number} / {feature.status}</span><Icon size={25} aria-hidden="true" /></div>
            <h2>{feature.title}</h2>
            <p>{feature.copy}</p>
            <Link href={feature.href} className="pv-card-link" onClick={() => trackEvent('preview_opened', { feature: feature.id })}>{feature.action} <ArrowRight size={17} aria-hidden="true" /></Link>
          </article>;
        })}
      </div>
      <p className="pv-footnote">Research tools and planning previews do not indicate route or asset availability. Explore and public swaps remain closed beta.</p>
    </main>
    <Footer />
  </div>;
}