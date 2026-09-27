import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Link } from 'wouter';
import { Footer, Header } from '../components/swap-ui';
import './closed-beta.css';

export default function ClosedBetaPage({ areaName }: { areaName: string }) {
  return <div className="app-shell">
    <Header />
    <main className="closed-beta-page page-enter">
      <span className="eyebrow"><span className="eyebrow-line" /> DARKSWAP / CLOSED BETA</span>
      <div className="closed-beta-mark"><LockKeyhole size={25} strokeWidth={1.5} /></div>
      <p className="closed-beta-label">NOT OPEN YET</p>
      <h1>{areaName}<br /><span>is in closed beta.</span></h1>
      <p className="closed-beta-copy">This area is not currently available. The only open route is the private Houdini route for supported Solana-origin swaps or bridges; availability depends on its live quote.</p>
      <div className="closed-beta-actions">
        <Link href="/" className="secondary-button">Back to DarkSwap home <ArrowRight size={14} /></Link>
        <Link href="/swap" className="primary-button">Open the private route <ArrowRight size={15} /></Link>
      </div>
    </main>
    <Footer />
  </div>;
}