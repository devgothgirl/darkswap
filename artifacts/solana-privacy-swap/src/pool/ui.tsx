// Small compositions shared by the pool tabs, built from design system primitives.
// Radix portals are avoided here: they render outside the pool's themed root.
import { useState, type ReactNode } from 'react';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { CautionBanner, CautionBannerDescription } from '@workspace/darkswap-design-system/components/ui/caution-banner';
import { StatusPill } from '@workspace/darkswap-design-system/components/ui/status-pill';
import { cn } from '@workspace/darkswap-design-system/lib/utils';
import { txUrl, type PoolChainInfo } from './api';
import type { Asset } from './chain';
import { formatUnits, short } from './format';
import { usePool } from './use-pool';
import { connectEvm, connectSolana, findEvmWallets, findSolanaWallets } from './wallets';

export function Choice<T extends string>({ value, options, onChange, label }: {
  value: T | null; options: Array<{ value: T; label: string; disabled?: boolean }>; onChange(v: T): void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value} disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-8 rounded-md border px-3 text-sm font-semibold transition-colors hover-elevate',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
            value === o.value ? 'border-primary bg-secondary text-secondary-foreground' : 'border-border text-muted-foreground',
          )}
          data-testid={`choice-${o.value}`}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono tabular-nums">{children}</span>
    </div>
  );
}

export function Amount({ value, asset }: { value: bigint; asset: Pick<Asset, 'decimals' | 'symbol'> }) {
  return <>{formatUnits(value, asset.decimals)} {asset.symbol}</>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <CautionBanner tone="danger"><CautionBannerDescription>{children}</CautionBannerDescription></CautionBanner>
  );
}

export function TxLink({ chain, hash }: { chain: PoolChainInfo; hash: string }) {
  const url = txUrl(chain, hash);
  if (!url) return <span className="font-mono text-xs">{short(hash, 8)}</span>;
  return <a href={url} target="_blank" rel="noreferrer noopener" className="font-mono text-xs text-ring underline-offset-2 hover:underline">{short(hash, 8)}</a>;
}

export function Done({ chain, hash, children }: { chain: PoolChainInfo; hash: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-primary/40 bg-accent/40 p-3 text-sm" role="status">
      <span className="flex items-center gap-2"><StatusPill tone="brand" size="sm">✓ Confirmed</StatusPill>{children}</span>
      <TxLink chain={chain} hash={hash} />
    </div>
  );
}

/** Connects a browser-extension wallet of the kind the selected chain needs. */
export function WalletConnect({ purpose }: { purpose: string }) {
  const { chain, wallet, setWallet } = usePool();
  const [options, setOptions] = useState<Array<{ name: string; connect(): Promise<void> }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!chain) return null;
  if (wallet && wallet.kind === chain.kind) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="text-muted-foreground">{wallet.name}</span>
        <span className="font-mono">{short(wallet.address.toString(), 5)}</span>
        <Button variant="ghost" size="sm" onClick={() => setWallet(null)} data-testid="button-disconnect-wallet">Disconnect</Button>
      </div>
    );
  }
  const find = async () => {
    setError(null);
    const list = chain.kind === 'evm'
      ? (await findEvmWallets()).map((w) => ({ name: w.name, connect: async () => setWallet(await connectEvm(w.name, w.provider)) }))
      : findSolanaWallets().map((w) => ({ name: w.name, connect: async () => setWallet(await connectSolana(w.name, w.provider)) }));
    if (!list.length) setError(`No ${chain.kind === 'evm' ? 'EVM' : 'Solana'} browser wallet found. Install a wallet extension, or open this page in your wallet's browser.`);
    setOptions(list);
  };
  const run = (fn: () => Promise<void>) => fn().catch((e: Error) => setError(e.message || 'The wallet refused the request.'));
  return (
    <div className="flex flex-col gap-2">
      {!options?.length ? (
        <Button variant="outline" onClick={() => void find()} data-testid="button-find-wallet">Connect a wallet {purpose}</Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => <Button key={o.name} variant="outline" onClick={() => run(o.connect)}>{o.name}</Button>)}
        </div>
      )}
      {error && <p className="text-xs text-destructive-foreground">{error}</p>}
    </div>
  );
}

export function AssetChoice({ asset, onChange }: { asset: Asset | null; onChange(a: Asset): void }) {
  const { pool } = usePool();
  if (!pool) return null;
  return (
    <Choice label="Asset" value={asset?.assetId ?? null} onChange={(id) => onChange(pool.assets.find((a) => a.assetId === id)!)}
      options={pool.assets.map((a) => ({ value: a.assetId, label: a.symbol }))} />
  );
}

/** Tabs that need keys or a verified pool show why they cannot run yet. */
export function Requires({ keys = false, children }: { keys?: boolean; children: ReactNode }) {
  const ctx = usePool();
  if (!ctx.chain) return <p className="text-sm text-muted-foreground">Loading pools…</p>;
  if (!ctx.chain.live) return <p className="text-sm text-muted-foreground">{ctx.chain.label}: {ctx.chain.reason}</p>;
  if (ctx.poolError) return <ErrorNote>{ctx.poolError}</ErrorNote>;
  if (!ctx.pool) return <p className="text-sm text-muted-foreground">Reading the pool and checking it against the chain…</p>;
  if (keys && !ctx.keys) return <p className="text-sm text-muted-foreground">Activate or unlock your shielded account first, on the Activate tab.</p>;
  return <>{children}</>;
}
