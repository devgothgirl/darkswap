import { useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Inbox, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ago } from '@/lib/api';
import type { StonkfunSource } from '@workspace/api-client-react';

export function TokenAvatar({ src, label, size = 40, className }: { src?: string | null; label: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = (label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  return (
    <div
      className={cn('relative shrink-0 overflow-hidden rounded-xl border border-border bg-accent grid place-items-center', className)}
      style={{ width: size, height: size }}
    >
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <span className="font-mono text-[11px] font-semibold text-accent-foreground">{initials}</span>
      )}
    </div>
  );
}

export function Metric({ label, value, hint, testId }: { label: string; value: string | null; hint?: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4" data-testid={testId}>
      <div className="eyebrow !text-muted-foreground">{label}</div>
      {value == null ? (
        <div className="mt-2 font-mono text-sm text-muted-foreground/80">Unavailable</div>
      ) : (
        <div className="mt-1.5 font-display text-xl font-bold">{value}</div>
      )}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function SectionHead({ eyebrow, title, children, action }: { eyebrow?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h2 className="text-2xl font-extrabold md:text-3xl">{title}</h2>
        {children && <p className="mt-2 text-sm text-muted-foreground">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Could not load', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6" data-testid="state-error">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} data-testid="button-retry">
              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid-lines rounded-2xl border border-dashed border-border p-8 text-center md:p-12" data-testid="state-empty">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-border bg-card">
        {icon ?? <Inbox className="h-5 w-5 text-accent-foreground" />}
      </div>
      <div className="font-display text-lg font-bold">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card/50 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

export function SourceNote({ source }: { source?: StonkfunSource }) {
  if (!source) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground" data-testid="text-source">
      <span className={cn('h-1.5 w-1.5 rounded-full', source.stale ? 'bg-chart-5' : 'bg-chart-3')} />
      Source: StonkFun public discovery · fetched {ago(source.fetchedAt) ?? 'recently'}
      {source.stale && <span className="text-chart-5">· stale cache ({source.cacheAgeSeconds}s)</span>}
    </div>
  );
}

export function Pill({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'purple' | 'warn' | 'danger' | 'ok'; className?: string }) {
  const tones = {
    default: 'border-border bg-secondary text-muted-foreground',
    purple: 'border-primary/40 bg-primary/10 text-accent-foreground',
    warn: 'border-chart-5/40 bg-chart-5/10 text-chart-5',
    danger: 'border-destructive/40 bg-destructive/10 text-destructive',
    ok: 'border-chart-3/40 bg-chart-3/10 text-chart-3',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider', tones[tone], className)}>
      {children}
    </span>
  );
}

export function CopyAddress({ value, testId }: { value: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
      className="group inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-secondary/60 px-2.5 py-1.5 font-mono text-xs hover:border-primary/50"
      aria-label="Copy address"
      data-testid={testId}
    >
      <span className="truncate">{value}</span>
      {done ? <Check className="h-3.5 w-3.5 shrink-0 text-chart-3" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />}
    </button>
  );
}
