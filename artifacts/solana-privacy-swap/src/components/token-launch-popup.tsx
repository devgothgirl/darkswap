import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useLocation } from 'wouter';
import { ArrowRight, X } from 'lucide-react';
import { CopyButton } from './swap-ui';
import { trackEvent } from '../lib/analytics';
import tokenIdentity from '../token-identity.json';
import './token-identity.css';
import './token-launch-popup.css';

// Change the announcement key whenever the announcement content is revised.
const ANNOUNCEMENT_KEY = 'darkswap:darkpool-phase-2-v1-dismissed';

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
  const open = location === '/' && !dismissed;
  useEffect(() => { if (open) trackEvent('announcement_viewed', { announcement: 'dark_pool_phase_2' }); }, [open]);

  function dismiss() {
    trackEvent('announcement_action', { announcement: 'dark_pool_phase_2', action: 'dismissed' });
    setDismissed(true);
    try {
      sessionStorage.setItem(ANNOUNCEMENT_KEY, '1');
    } catch {
      // Do not prevent closing the announcement when browser storage is unavailable.
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) dismiss(); }}>
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
          <div className="dk-hero">
            <img
              src={`${import.meta.env.BASE_URL}brand/darkpool-phase-2.jpg`}
              alt="DarkSwap Darkpool"
              width="1040"
              height="585"
              decoding="async"
              data-testid="img-darkpool-announcement"
            />
            <Dialog.Close className="dk-close" aria-label="Close announcement" data-testid="button-token-launch-close">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <header className="dk-head">
            <p className="dk-status" data-testid="status-token-launch">
              <i aria-hidden="true" /> Phase 2
            </p>
            <Dialog.Title className="dk-title">Unveiling Phase 2: Dark Pool</Dialog.Title>
          </header>

          <Dialog.Description className="dk-lede">
            Something is surfacing. Follow DarkSwap on X for the reveal.
          </Dialog.Description>

          <section className="dark-token-identity dark-token-identity--compact" aria-label="Official $DARK contract address">
            <div className="dark-token-identity__heading"><strong>$DARK contract address (CA)</strong></div>
            <div className="dark-token-identity__address">
              <code data-testid="text-token-identity-address-announcement">{tokenIdentity.address}</code>
              <CopyButton value={tokenIdentity.address} name="DARK token address" />
            </div>
          </section>

          <div className="dk-actions">
            <a href="https://x.com/darkswapapp" target="_blank" rel="noopener noreferrer" className="dk-primary" data-testid="link-token-launch-x" onClick={() => trackEvent('announcement_action', { announcement: 'dark_pool_phase_2', action: 'follow_x' })}>
              Follow @darkswapapp on X <ArrowRight size={15} aria-hidden="true" />
            </a>
            <Dialog.Close className="dk-secondary" data-testid="button-token-launch-not-now">
              Not now
            </Dialog.Close>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
