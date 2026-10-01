import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Link, useLocation } from 'wouter';
import { ArrowRight, X } from 'lucide-react';
import './token-launch-popup.css';

// Change the announcement key whenever the announcement content is revised.
const ANNOUNCEMENT_KEY = 'darkswap:dark-mechanics-v2-dismissed';

function wasDismissed() {
  try {
    return sessionStorage.getItem(ANNOUNCEMENT_KEY) === '1';
  } catch {
    // Storage can be blocked; in-memory dismissal still works for this visit.
    return false;
  }
}

export function TokenLaunchPopup() {
  const [location] = useLocation();
  const [dismissed, setDismissed] = useState(wasDismissed);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(ANNOUNCEMENT_KEY, '1');
    } catch {
      // Do not prevent closing the announcement when browser storage is unavailable.
    }
  }

  return (
    <Dialog.Root open={location === '/' && !dismissed} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dk-overlay" />
        <Dialog.Content
          className="dk-popup"
          data-testid="dialog-token-launch"
          onCloseAutoFocus={(event) => {
            // An automatic dialog has no trigger to restore focus to.
            event.preventDefault();
            document.querySelector<HTMLElement>('main a[href], main button')?.focus();
          }}
        >
          <header className="dk-head">
            <span className="dk-mark" aria-hidden="true">D</span>
            <div className="dk-head-text">
              <Dialog.Title className="dk-title">Planned $DARK mechanics</Dialog.Title>
              <p className="dk-status" data-testid="status-token-launch">
                <i aria-hidden="true" /> Coming soon
              </p>
            </div>
            <Dialog.Close className="dk-close" aria-label="Close token announcement" data-testid="button-token-launch-close">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </header>

          <Dialog.Description className="dk-lede">
            Launch plan: $DARK paired with $NEAR on StonkFun, using its 3% holder-rewards tax.
            Dividends earned by team-held $DARK fund two DarkSwap flywheels:
          </Dialog.Description>

          <div className="dk-split" role="list">
            <div className="dk-row" role="listitem" data-testid="text-token-split-burn">
              <span className="dk-pct">50%</span>
              <div>
                <h3>Buyback and burn</h3>
                <p>Used to buy back $DARK and burn it.</p>
              </div>
            </div>
            <div className="dk-row" role="listitem" data-testid="text-token-split-zec">
              <span className="dk-pct">50%</span>
              <div>
                <h3>Converted to ZEC</h3>
                <p>For qualifying holders maintaining more than 100,000 $DARK consecutively, with rewards scaled by wallet weight.</p>
              </div>
            </div>
          </div>

          <p className="dk-terms">
            Proposed eligibility: three days, checked at 12-hour snapshots. The weighting formula and
            payout networks are not finalized. The 3% is not a yield or APY; returns are not guaranteed.
          </p>

          <div className="dk-actions">
            <Link href="/tokenomics" onClick={dismiss} className="dk-primary" data-testid="link-token-launch-details">
              Read the tokenomics <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <Dialog.Close className="dk-secondary" data-testid="button-token-launch-not-now">
              Not now
            </Dialog.Close>
          </div>

          <p className="dk-safety">
            $DARK and payouts are not live. No official token address has been announced. Verify launch details on this site.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
