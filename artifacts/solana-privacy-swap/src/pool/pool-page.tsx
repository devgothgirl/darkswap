// The shielded pool section (TESTNET). Rendered outside the rewards provider,
// so no wallet SDK loads here, and with the site's analytics tracker switched
// off for these pages (see also the inline script in index.html).
import './buffer-shim';
import { useEffect } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import {
  WidgetShell, WidgetShellBody, WidgetShellHeader, WidgetShellTab, WidgetShellTabs,
} from '@workspace/darkswap-design-system/components/ui/widget-shell';
import { TestnetWarning } from './testnet-warning';
import { StatusPill } from '@workspace/darkswap-design-system/components/ui/status-pill';
import { Header } from '@/components/swap-ui';
import { poolThemeStyle } from './theme';
import { PoolProvider, usePool } from './use-pool';
import { Choice } from './ui';
import { ActivateTab, ReceiveTab } from './tabs/activate-tab';
import { ShieldTab } from './tabs/shield-tab';
import { SendTab, UnshieldTab } from './tabs/transfer-tabs';
import { ActivityTab, FeesTab } from './tabs/ledger-tabs';
import { WhatStaysPublic } from './what-stays-public';

const TABS = [
  { id: 'activate', label: 'Activate', Component: ActivateTab },
  { id: 'shield', label: 'Shield', Component: ShieldTab },
  { id: 'send', label: 'Send', Component: SendTab },
  { id: 'unshield', label: 'Unshield', Component: UnshieldTab },
  { id: 'receive', label: 'Receive', Component: ReceiveTab },
  { id: 'activity', label: 'Activity', Component: ActivityTab },
  { id: 'fees', label: 'Fees', Component: FeesTab },
] as const;

const ANALYTICS_MARK = 'darkswap.poolAnalyticsOff';

function useNoAnalytics() {
  useEffect(() => {
    try {
      localStorage.setItem('umami.disabled', '1');
      localStorage.setItem(ANALYTICS_MARK, '1');
    } catch { /* storage blocked: nothing to switch off */ }
    return () => {
      try {
        if (localStorage.getItem(ANALYTICS_MARK)) {
          localStorage.removeItem('umami.disabled');
          localStorage.removeItem(ANALYTICS_MARK);
        }
      } catch { /* ignore */ }
    };
  }, []);
}

export default function PoolSection() {
  useNoAnalytics();
  const [isPublicPage] = useRoute('/pool/what-stays-public');
  useEffect(() => {
    document.title = isPublicPage ? 'What stays public · DarkSwap Pool (testnet)' : 'DarkSwap Pool (testnet)';
  }, [isPublicPage]);
  return (
    <div className="app-shell">
      <Header />
      <main className="pool-scope dark min-h-[70vh] bg-background px-4 py-8 font-sans text-foreground" style={poolThemeStyle}>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <TestnetWarning />
          <PoolProvider>{isPublicPage ? <WhatStaysPublic /> : <Terminal />}</PoolProvider>
        </div>
      </main>
    </div>
  );
}

function Terminal() {
  const [, params] = useRoute('/pool/:tab');
  const [, navigate] = useLocation();
  const { chains, chain, setChainId, chainsError, keys, lock } = usePool();
  const active = TABS.find((t) => t.id === params?.tab) ?? TABS[0];
  const Active = active.Component;
  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold">Shielded pool</h1>
          <StatusPill tone="caution" size="sm">Testnet</StatusPill>
        </div>
        <p className="text-sm text-muted-foreground">
          Hold, send and withdraw funds without linking them to your wallet. <Link href="/pool/what-stays-public" className="text-ring underline-offset-2 hover:underline" data-testid="link-what-stays-public">What stays public</Link>
        </p>
      </div>
      {chainsError && <p className="text-sm text-destructive-foreground">{chainsError}</p>}
      {chains.length > 0 && (
        <Choice label="Chain" value={chain?.id ?? null} onChange={setChainId}
          options={chains.map((c) => ({ value: c.id, label: c.live ? c.label : `${c.label} · soon` }))} />
      )}
      <WidgetShell className="max-w-none">
        <WidgetShellHeader className="overflow-x-auto">
          <WidgetShellTabs aria-label="Pool actions">
            {TABS.map((t) => (
              <WidgetShellTab key={t.id} id={`pool-tab-${t.id}`} aria-controls="pool-action-panel" active={t.id === active.id} onClick={() => navigate(`/pool/${t.id}`)} data-testid={`tab-${t.id}`}>{t.label}</WidgetShellTab>
            ))}
          </WidgetShellTabs>
        </WidgetShellHeader>
        <WidgetShellBody className="p-4" role="tabpanel" id="pool-action-panel" aria-labelledby={`pool-tab-${active.id}`}>
          <Active />
        </WidgetShellBody>
      </WidgetShell>
      {keys && active.id !== 'activate' && (
        <button type="button" onClick={lock} className="self-end text-xs text-muted-foreground underline-offset-2 hover:underline" data-testid="button-lock-footer">
          Lock shielded account
        </button>
      )}
    </>
  );
}
