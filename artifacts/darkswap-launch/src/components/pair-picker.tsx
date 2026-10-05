import { useMemo, useState } from 'react';
import { Lock, Search, Check, AlertTriangle, Star } from 'lucide-react';
import { Input } from '@workspace/darkswap-design-system/components/ui/input';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import type { LaunchConfig, StonkfunPair, StonkfunPairGroup } from '@workspace/api-client-react';
import { TokenAvatar, Pill } from './bits';
import { shortAddr, DARK_ACTIVATION_COPY } from '@/lib/api';
import { cn } from '@workspace/darkswap-design-system/lib/utils';

export const pairSelectable = (p: StonkfunPair) => p.enabled && p.launchable && p.launchLabReady === true;

const GROUPS: { id: Exclude<StonkfunPairGroup, 'dark'>; title: string; note: string }[] = [
  { id: 'near', title: 'NEAR ecosystem pairs', note: 'Evidence-backed NEAR-symbol Solana mints. No native NEAR-chain execution is implied.' },
  { id: 'stablecoin', title: 'Stablecoin pairs', note: 'Grouped by verified mint, not ticker.' },
  { id: 'other', title: 'Other available pairs', note: 'Launchable on the discovery source.' },
];

function PairRow({ p, selected, onSelect, featured }: { p: StonkfunPair; selected: boolean; onSelect: () => void; featured?: boolean }) {
  const ok = pairSelectable(p);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={!ok}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border bg-card/60 p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
        !ok && 'cursor-not-allowed opacity-55',
      )}
      data-testid={`radio-pair-${p.mint}`}
    >
      <TokenAvatar src={p.logoUrl} label={p.symbol} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{p.symbol}</span>
          <span className="truncate text-xs text-muted-foreground">{p.name}</span>
          {featured && <Pill tone="purple" className="!normal-case">Featured</Pill>}
          {p.symbolAmbiguous && <Pill tone="warn"><AlertTriangle className="h-3 w-3" />Ambiguous ticker</Pill>}
        </div>
        <div className={cn('mt-0.5 font-mono text-[11px] text-muted-foreground', p.symbolAmbiguous && 'text-foreground/80')}>
          {p.symbolAmbiguous ? p.mint : shortAddr(p.mint, 6)}
        </div>
        {!ok && (
          <div className="mt-1 text-[11px] text-chart-5">
            {!p.enabled ? 'Disabled by DarkSwap' : !p.launchable ? 'Not launchable upstream' : 'Launch lab readiness not confirmed upstream'}
          </div>
        )}
      </div>
      {selected && <Check className="h-4 w-4 text-primary" />}
    </button>
  );
}

export function PairPicker({ pairs, config, value, onChange, stale = false }: { stale?: boolean; pairs: StonkfunPair[]; config?: LaunchConfig; value: string | null; onChange: (mint: string | null) => void }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const dark = pairs.find((p) => p.group === 'dark');
  const darkLive = !!config?.darkPairAvailable && !!dark;
  // Featured pair: badge + first within its own group, only if current, fresh and selectable. Never outranks DARK or group order.
  const fm = config?.featuredPair?.mint ?? null;
  const featuredMint = fm && !stale && pairs.some((p) => p.mint === fm && p.group !== 'dark' && pairSelectable(p)) ? fm : null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return pairs.filter((p) => p.group !== 'dark' && (!s || p.symbol.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || p.mint.toLowerCase() === s || p.mint.toLowerCase().startsWith(s)));
  }, [pairs, q]);

  let shown = 0;
  return (
    <div className="space-y-6" role="radiogroup" aria-label="Pair">
      {darkLive && dark ? (
        <div className={cn('rounded-2xl border p-5', value === dark.mint ? 'border-primary bg-primary/10' : 'border-primary/40 bg-gradient-to-br from-accent/60 to-card')}>
          <div className="mb-3 flex flex-wrap gap-1.5"><Pill tone="purple"><Star className="h-3 w-3" />Recommended</Pill><Pill tone="purple">DarkSwap Ecosystem Pair</Pill></div>
          <PairRow p={dark} selected={value === dark.mint} onSelect={() => onChange(dark.mint)} />
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-accent/60 to-card p-5" data-testid="card-dark-pair-locked">
          <div className="mb-3 flex flex-wrap gap-1.5"><Pill tone="purple"><Star className="h-3 w-3" />Recommended</Pill><Pill tone="purple">DarkSwap Ecosystem Pair</Pill></div>
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl border border-primary/40 bg-background/50"><Lock className="h-5 w-5 text-accent-foreground" /></div>
            <div>
              <div className="font-display text-xl font-bold">$DARK</div>
              <p className="text-sm text-muted-foreground">{config?.darkPairMessage || DARK_ACTIVATION_COPY}</p>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} placeholder={`Search ${pairs.length} pairs by ticker, name or mint`} className="h-11 pl-9" aria-label="Search pairs" data-testid="input-pair-search" />
      </div>

      {GROUPS.map((g) => {
        const items = filtered.filter((p) => p.group === g.id).sort((a, b) => Number(b.mint === featuredMint) - Number(a.mint === featuredMint));
        if (items.length === 0) return null;
        const room = Math.max(0, limit - shown);
        const visible = items.slice(0, room);
        shown += visible.length;
        return (
          <section key={g.id}>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="font-display text-base font-bold">{g.title}</h3>
              <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{g.note}</p>
            <div className="grid gap-2 md:grid-cols-2">
              {visible.map((p) => <PairRow key={p.mint} p={p} featured={p.mint === featuredMint} selected={value === p.mint} onSelect={() => onChange(p.mint)} />)}
            </div>
            {visible.length < items.length && <p className="mt-2 text-xs text-muted-foreground">{items.length - visible.length} more in this group.</p>}
          </section>
        );
      })}
      {filtered.length > limit && (
        <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + 60)} data-testid="button-more-pairs">Show more pairs</Button>
      )}
      {filtered.length === 0 && <p className="text-sm text-muted-foreground">No pairs match "{q}".</p>}
    </div>
  );
}
