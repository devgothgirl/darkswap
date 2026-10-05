import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, PauseCircle, Info } from 'lucide-react';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@workspace/darkswap-design-system/components/ui/sheet';
import { useGetLaunchConfig, getGetLaunchConfigQueryKey } from '@workspace/api-client-react';
import { WalletButton, ConnectDialog, AuthDialog } from './wallet-ui';
import { useWallet } from '@/lib/wallet';
import { asset } from '@/lib/api';
import { cn } from '@workspace/darkswap-design-system/lib/utils';

const NAV = [
  { href: '/explore', label: 'Explore' },
  { href: '/create', label: 'Create' },
  { href: '/creator', label: 'Creator' },
  { href: '/docs', label: 'Docs' },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
      <img src={asset('/icon.png')} alt="" className="h-8 w-8 rounded-lg" />
      <span className="font-display text-lg font-extrabold leading-none">
        DarkSwap <span className="text-primary">Launch</span>
      </span>
    </Link>
  );
}

export function Header() {
  const [loc] = useLocation();
  const { isAdmin } = useWallet();
  const [open, setOpen] = useState(false);
  const items = isAdmin ? [...NAV, { href: '/admin', label: 'Admin' }] : NAV;
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:rounded focus:bg-primary focus:px-3 focus:py-1 focus:text-primary-foreground">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-6">
        <Brand />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {items.map((n) => {
            const active = loc === n.href || loc.startsWith(n.href + '/');
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={cn('rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', active && 'bg-secondary text-foreground')}
                data-testid={`link-nav-${n.label.toLowerCase()}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <WalletButton />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="ghost" className="md:hidden" aria-label="Open menu" data-testid="button-menu"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="glass w-72">
              <SheetTitle className="font-display">Navigate</SheetTitle>
              <nav className="mt-6 flex flex-col gap-1" aria-label="Mobile">
                {[{ href: '/', label: 'Home' }, ...items].map((n) => (
                  <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-medium hover:bg-secondary">{n.label}</Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function ConfigBanners() {
  const { data } = useGetLaunchConfig({ query: { queryKey: getGetLaunchConfigQueryKey(), staleTime: 60_000 } });
  if (!data) return null;
  return (
    <>
      {data.paused && (
        <div className="border-b border-chart-5/30 bg-chart-5/10 px-4 py-2 text-center text-sm text-chart-5" role="status" data-testid="banner-paused">
          <PauseCircle className="mr-2 inline h-4 w-4" /> Launch preparation is paused by DarkSwap. Discovery remains available.
        </div>
      )}
      {data.banner && (
        <div className="border-b border-primary/25 bg-primary/10 px-4 py-2 text-center text-sm" role="status" data-testid="banner-config">
          <Info className="mr-2 inline h-4 w-4 text-accent-foreground" />{data.banner}
        </div>
      )}
    </>
  );
}

export function Footer() {
  const ext = [
    { href: 'https://darkswap.app', label: 'DarkSwap' },
    { href: 'https://darkswap.app/token', label: '$DARK' },
    { href: 'https://x.com/darkswapapp', label: 'X' },
  ];
  const int = [
    { href: '/', label: 'Launch' },
    { href: '/docs', label: 'Docs' },
    { href: '/terms', label: 'Terms' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/risk', label: 'Risk disclosure' },
  ];
  return (
    <footer className="mt-24 border-t border-border/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr] md:px-6">
        <div>
          <Brand />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Discovery and private launch preparation for Solana creators. Launch execution is not yet available; nothing here creates a token or charges a fee.
          </p>
        </div>
        <div>
          <div className="eyebrow mb-3">Ecosystem</div>
          <ul className="space-y-2 text-sm">
            {ext.map((l) => (
              <li key={l.label}><a href={l.href} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" data-testid={`link-footer-${l.label.toLowerCase().replace(/\W/g, '')}`}>{l.label}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <div className="eyebrow mb-3">Launch</div>
          <ul className="space-y-2 text-sm">
            {int.map((l) => (
              <li key={l.label}><Link href={l.href} className="text-muted-foreground hover:text-foreground" data-testid={`link-footer-${l.label.toLowerCase().replace(/\W/g, '')}`}>{l.label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-5 text-center font-mono text-[11px] text-muted-foreground">
        DarkSwap Launch · Solana mainnet-beta · Not financial advice · No anonymity guarantee
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header />
      <ConfigBanners />
      <main id="main" className="flex-1">{children}</main>
      <Footer />
      <ConnectDialog />
      <AuthDialog />
    </div>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14', className)}>{children}</div>;
}
