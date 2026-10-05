import { ArrowRight, LifeBuoy, ShieldAlert } from 'lucide-react';

// Public recovery guidance shared by the interactive page and initial HTML.
export function HelpRecoveryGuidance() {
  return <aside className="help-side"><div className="help-side-card"><LifeBuoy size={27}/><h3>Something went wrong with a deposit?</h3><p>Stop. Do not resend. Save your order reference and the hash of the transaction you sent. Recovery is not guaranteed.</p><a href="#contact-support" data-testid="link-help-report-issue">Report an issue <ArrowRight size={16}/></a></div><div className="help-side-note"><ShieldAlert size={17} style={{display:'block',marginBottom:10,color:'#d5baf4'}}/>Only send the exact specified asset on Solana before the deadline, including a memo if required. The active order page is the source of truth.</div></aside>;
}