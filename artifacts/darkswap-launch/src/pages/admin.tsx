import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldX, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { Input } from '@workspace/darkswap-design-system/components/ui/input';
import { Textarea } from '@workspace/darkswap-design-system/components/ui/textarea';
import { Label } from '@workspace/darkswap-design-system/components/ui/label';
import { Switch } from '@workspace/darkswap-design-system/components/ui/switch';
import { Skeleton } from '@workspace/darkswap-design-system/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/darkswap-design-system/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/darkswap-design-system/components/ui/select';
import { useToast } from '@workspace/darkswap-design-system/hooks/use-toast';
import {
  useGetLaunchAdminConfig,
  getGetLaunchAdminConfigQueryKey,
  getGetLaunchConfigQueryKey,
  useUpdateLaunchAdminConfig,
  useGetLaunchAdminReviews,
  getGetLaunchAdminReviewsQueryKey,
  useCreateLaunchAdminReview,
  useGetLaunchAdminAudit,
  getGetLaunchAdminAuditQueryKey,
  type LaunchConfig,
  type LaunchConfigInput,
  type LaunchPairOverride,
  type LaunchReviewInput,
} from '@workspace/api-client-react';
import { Page } from '@/components/layout';
import { PrivateGate } from '@/components/wallet-ui';
import { EmptyState, ErrorState, Pill } from '@/components/bits';
import { useWallet, useCsrfRequest } from '@/lib/wallet';
import { usePageMeta } from '@/lib/seo';
import { HTTP_URL, SOLANA_ADDRESS, fmtDate, readError, shortAddr } from '@/lib/api';

function toInput(c: LaunchConfig): LaunchConfigInput {
  return {
    darkPairingEnabled: c.darkPairingEnabled, darkTokenAddress: c.darkTokenAddress, darkPairSymbol: 'DARK', darkPairPriority: c.darkPairPriority,
    nearPairingEnabled: c.nearPairingEnabled, pairOverrides: c.pairOverrides, featuredPair: c.featuredPair, featuredMints: c.featuredMints,
    paused: c.paused, banner: c.banner, feeProposal: c.feeProposal, campaignProposal: c.campaignProposal, pointsProposal: c.pointsProposal,
  };
}

function Denied({ message }: { message?: string }) {
  return (
    <EmptyState title="Not authorized" icon={<ShieldX className="h-5 w-5 text-destructive" />}>
      {message ?? 'This wallet is not on the server-side admin allowlist. Admin access is denied by default.'}
    </EmptyState>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-border/60 py-4 md:grid-cols-[260px_1fr]">
      <div><div className="text-sm font-medium">{label}</div>{hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}</div>
      <div>{children}</div>
    </div>
  );
}

function ConfigTab({ config }: { config: LaunchConfig }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const request = useCsrfRequest();
  const m = useUpdateLaunchAdminConfig({ request });
  const [f, setF] = useState<LaunchConfigInput>(() => toInput(config));
  const [featuredText, setFeaturedText] = useState(config.featuredMints.join('\n'));
  const [err, setErr] = useState<string | null>(null);
  const initAt = useRef(config.updatedAt);
  useEffect(() => {
    if (initAt.current !== config.updatedAt) { initAt.current = config.updatedAt; setF(toInput(config)); setFeaturedText(config.featuredMints.join('\n')); }
  }, [config]);
  const set = <K extends keyof LaunchConfigInput>(k: K, v: LaunchConfigInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const setOv = (i: number, patch: Partial<LaunchPairOverride>) => set('pairOverrides', f.pairOverrides.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  function submit() {
    setErr(null);
    const featuredMints = featuredText.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    const problems: string[] = [];
    if (f.darkTokenAddress && !SOLANA_ADDRESS.test(f.darkTokenAddress)) problems.push('DARK token address is not a valid mint.');
    if (featuredMints.some((x) => !SOLANA_ADDRESS.test(x))) problems.push('A featured mint is invalid.');
    if (f.featuredPair && !SOLANA_ADDRESS.test(f.featuredPair.mint)) problems.push('Featured pair mint is invalid.');
    f.pairOverrides.forEach((o, i) => { if (!SOLANA_ADDRESS.test(o.mint)) problems.push(`Override ${i + 1}: invalid mint.`); if (!HTTP_URL.test(o.evidenceUrl)) problems.push(`Override ${i + 1}: evidence URL required.`); });
    if (f.feeProposal?.amount && !/^[0-9]+(\.[0-9]+)?$/.test(f.feeProposal.amount)) problems.push('Fee proposal amount must be a decimal number.');
    if (problems.length) { setErr(problems.join(' ')); return; }
    m.mutate({ data: { ...f, featuredMints, banner: f.banner?.trim() ? f.banner : null } }, {
      onSuccess: (c) => {
        qc.setQueryData(getGetLaunchAdminConfigQueryKey(), c);
        qc.invalidateQueries({ queryKey: getGetLaunchConfigQueryKey() });
        qc.invalidateQueries({ queryKey: ['/api/launch/admin/audit'], exact: false });
        qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('/api/launch/admin/audit') });
        toast({ title: 'Configuration saved', description: 'Change recorded in the audit log.' });
      },
      onError: (e) => setErr(readError(e).message),
    });
  }

  return (
    <div>
      <div className="mb-4 rounded-xl border border-chart-5/30 bg-chart-5/5 p-3 text-xs text-muted-foreground">
        No setting here enables execution, manufactures a provider fee, or makes an unverified pair launchable. Execution: {config.unavailableReason}
      </div>
      <Row label="Pause launch preparation"><Switch checked={f.paused} onCheckedChange={(v) => set('paused', v)} data-testid="switch-paused" /></Row>
      <Row label="Homepage banner" hint="Plain text, 500 max"><Textarea maxLength={500} value={f.banner ?? ''} onChange={(e) => set('banner', e.target.value)} data-testid="input-banner" /></Row>
      <Row label="$DARK pairing enabled" hint="Still requires a current upstream launchable mint match"><Switch checked={f.darkPairingEnabled} onCheckedChange={(v) => set('darkPairingEnabled', v)} data-testid="switch-dark" /></Row>
      <Row label="$DARK token address" hint="Pair symbol fixed as DARK"><Input className="font-mono text-xs" value={f.darkTokenAddress ?? ''} onChange={(e) => set('darkTokenAddress', e.target.value.trim() || null)} placeholder="Unset" data-testid="input-dark-address" /></Row>
      <Row label="$DARK pair priority"><Input type="number" min={1} max={10000} className="w-32" value={f.darkPairPriority} onChange={(e) => set('darkPairPriority', Math.max(1, Math.min(10000, Number(e.target.value) || 1)))} data-testid="input-dark-priority" /></Row>
      <Row label="NEAR pairing enabled" hint="Evidence-backed Solana mints only"><Switch checked={f.nearPairingEnabled} onCheckedChange={(v) => set('nearPairingEnabled', v)} data-testid="switch-near" /></Row>
      <Row label="Featured pair" hint="mainnet-beta mint, blank for none"><Input className="font-mono text-xs" value={f.featuredPair?.mint ?? ''} onChange={(e) => set('featuredPair', e.target.value.trim() ? { mint: e.target.value.trim(), network: 'mainnet-beta' } : null)} data-testid="input-featured-pair" /></Row>
      <Row label="Featured launches" hint="One mint per line, up to 100. Under-review tokens are never featured."><Textarea rows={4} className="font-mono text-xs" value={featuredText} onChange={(e) => setFeaturedText(e.target.value)} data-testid="input-featured-mints" /></Row>
      <Row label="Pair overrides" hint="Cannot assign DARK group or bypass upstream readiness">
        <div className="space-y-3">
          {f.pairOverrides.map((o, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-border p-3 md:grid-cols-[1fr_110px_130px_auto]">
              <Input className="font-mono text-xs md:col-span-4" placeholder="Mint" value={o.mint} onChange={(e) => setOv(i, { mint: e.target.value.trim() })} aria-label="Override mint" />
              <Input className="text-xs md:col-span-2" placeholder="Evidence URL (https://)" value={o.evidenceUrl} onChange={(e) => setOv(i, { evidenceUrl: e.target.value.trim() })} aria-label="Evidence URL" />
              <Select value={o.group} onValueChange={(v) => setOv(i, { group: v as LaunchPairOverride['group'] })}>
                <SelectTrigger aria-label="Group"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="other">Other</SelectItem><SelectItem value="near">NEAR</SelectItem><SelectItem value="stablecoin">Stablecoin</SelectItem></SelectContent>
              </Select>
              <Input type="number" min={1} max={10000} value={o.priority} onChange={(e) => setOv(i, { priority: Math.max(1, Math.min(10000, Number(e.target.value) || 1)) })} aria-label="Priority" />
              <label className="flex items-center gap-2 text-xs"><Switch checked={o.enabled} onCheckedChange={(v) => setOv(i, { enabled: v })} />Enabled</label>
              <Button variant="ghost" size="sm" onClick={() => set('pairOverrides', f.pairOverrides.filter((_, j) => j !== i))} aria-label="Remove override"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => set('pairOverrides', [...f.pairOverrides, { mint: '', network: 'mainnet-beta', enabled: true, priority: 100, group: 'other', evidenceUrl: '' }])} data-testid="button-add-override"><Plus className="mr-1.5 h-4 w-4" />Add override</Button>
        </div>
      </Row>
      <Row label="Fee proposal" hint="Local draft only; not a provider fee; nothing is charged">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.feeProposal} onCheckedChange={(v) => set('feeProposal', v ? { amount: null, currency: null, notes: '' } : null)} />Has proposal</label>
          {f.feeProposal && (
            <div className="grid gap-2 md:grid-cols-2">
              <Input placeholder="Amount" value={f.feeProposal.amount ?? ''} onChange={(e) => set('feeProposal', { ...f.feeProposal!, amount: e.target.value.trim() || null })} />
              <Input placeholder="Currency" maxLength={64} value={f.feeProposal.currency ?? ''} onChange={(e) => set('feeProposal', { ...f.feeProposal!, currency: e.target.value || null })} />
              <Textarea className="md:col-span-2" placeholder="Notes" maxLength={2000} value={f.feeProposal.notes} onChange={(e) => set('feeProposal', { ...f.feeProposal!, notes: e.target.value })} />
            </div>
          )}
        </div>
      </Row>
      <Row label="Campaign proposal" hint="Inactive; does not run a campaign or promise rewards">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.campaignProposal} onCheckedChange={(v) => set('campaignProposal', v ? { name: '', description: '', eligibilityNotes: '' } : null)} />Has proposal</label>
          {f.campaignProposal && (
            <div className="space-y-2">
              <Input placeholder="Name" maxLength={120} value={f.campaignProposal.name} onChange={(e) => set('campaignProposal', { ...f.campaignProposal!, name: e.target.value })} />
              <Textarea placeholder="Description" maxLength={2000} value={f.campaignProposal.description} onChange={(e) => set('campaignProposal', { ...f.campaignProposal!, description: e.target.value })} />
              <Textarea placeholder="Eligibility notes" maxLength={2000} value={f.campaignProposal.eligibilityNotes} onChange={(e) => set('campaignProposal', { ...f.campaignProposal!, eligibilityNotes: e.target.value })} />
            </div>
          )}
        </div>
      </Row>
      <Row label="DarkPoints proposal" hint="Inactive formula; no earning, issuance or claimable value">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!f.pointsProposal} onCheckedChange={(v) => set('pointsProposal', v ? { name: '', description: '', formulaProposal: '' } : null)} />Has proposal</label>
          {f.pointsProposal && (
            <div className="space-y-2">
              <Input placeholder="Name" maxLength={120} value={f.pointsProposal.name} onChange={(e) => set('pointsProposal', { ...f.pointsProposal!, name: e.target.value })} />
              <Textarea placeholder="Description" maxLength={2000} value={f.pointsProposal.description} onChange={(e) => set('pointsProposal', { ...f.pointsProposal!, description: e.target.value })} />
              <Textarea placeholder="Formula proposal" maxLength={2000} value={f.pointsProposal.formulaProposal} onChange={(e) => set('pointsProposal', { ...f.pointsProposal!, formulaProposal: e.target.value })} />
            </div>
          )}
        </div>
      </Row>
      {err && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}
      <div className="mt-6 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">Last updated {fmtDate(config.updatedAt)}</span>
        <Button onClick={submit} disabled={m.isPending} data-testid="button-save-config">{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save configuration</Button>
      </div>
    </div>
  );
}

const REASONS: LaunchReviewInput['reason'][] = ['malicious_metadata', 'self_referral', 'circular_activity', 'transaction_spam', 'suspected_wallet_cluster', 'other'];

function ReviewsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const request = useCsrfRequest();
  const q = useGetLaunchAdminReviews({ query: { queryKey: getGetLaunchAdminReviewsQueryKey() } });
  const m = useCreateLaunchAdminReview({ request });
  const empty: LaunchReviewInput = { targetType: 'token', target: '', network: 'mainnet-beta', reason: 'malicious_metadata', evidenceUrls: [], notes: '', suppressMetadata: false };
  const [f, setF] = useState<LaunchReviewInput>(empty);
  const [ev, setEv] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    setErr(null);
    const evidenceUrls = ev.split(/\s+/).filter(Boolean);
    if (!SOLANA_ADDRESS.test(f.target)) return setErr('Target must be a Solana address.');
    if (evidenceUrls.length < 1 || evidenceUrls.length > 10 || evidenceUrls.some((u) => !HTTP_URL.test(u))) return setErr('Provide 1 to 10 http(s) evidence URLs.');
    if (!f.notes.trim()) return setErr('Notes are required.');
    m.mutate({ data: { ...f, evidenceUrls, suppressMetadata: f.targetType === 'token' && f.suppressMetadata } }, {
      onSuccess: () => {
        setF(empty); setEv('');
        qc.invalidateQueries({ queryKey: getGetLaunchAdminReviewsQueryKey() });
        qc.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith('/api/launch/admin/audit') || String(x.queryKey[0]).startsWith('/api/stonkfun') });
        toast({ title: 'Review recorded', description: 'Target marked under_review.' });
      },
      onError: (e) => setErr(readError(e).message),
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4 rounded-2xl border border-border bg-card/50 p-5">
        <h3 className="font-display text-lg font-bold">Flag for review</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="mb-1 block text-xs">Target type</Label>
            <Select value={f.targetType} onValueChange={(v) => setF({ ...f, targetType: v as LaunchReviewInput['targetType'], suppressMetadata: false })}>
              <SelectTrigger data-testid="select-target-type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="token">Token</SelectItem><SelectItem value="wallet">Wallet</SelectItem></SelectContent>
            </Select></div>
          <div><Label className="mb-1 block text-xs">Reason</Label>
            <Select value={f.reason} onValueChange={(v) => setF({ ...f, reason: v as LaunchReviewInput['reason'] })}>
              <SelectTrigger data-testid="select-reason"><SelectValue /></SelectTrigger>
              <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        <div><Label htmlFor="rv-target" className="mb-1 block text-xs">Target address</Label><Input id="rv-target" className="font-mono text-xs" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value.trim() })} data-testid="input-review-target" /></div>
        <div><Label htmlFor="rv-ev" className="mb-1 block text-xs">Evidence URLs (one per line)</Label><Textarea id="rv-ev" rows={3} className="font-mono text-xs" value={ev} onChange={(e) => setEv(e.target.value)} data-testid="input-review-evidence" /></div>
        <div><Label htmlFor="rv-notes" className="mb-1 block text-xs">Notes</Label><Textarea id="rv-notes" maxLength={2000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-review-notes" /></div>
        <label className="flex items-center gap-2 text-sm"><Switch disabled={f.targetType !== 'token'} checked={f.suppressMetadata} onCheckedChange={(v) => setF({ ...f, suppressMetadata: v })} data-testid="switch-suppress" />Suppress local metadata (tokens only)</label>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <Button onClick={submit} disabled={m.isPending} className="w-full" data-testid="button-create-review">{m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record review</Button>
        <p className="text-xs text-muted-foreground">Flags are evidence-backed holds, not proof of identity. Flagged records cannot qualify for featuring or incentives.</p>
      </div>
      <div className="space-y-6">
        {q.isLoading ? <Skeleton className="h-48" /> : q.isError ? <ErrorState message={readError(q.error).message} onRetry={() => q.refetch()} /> : (
          <>
            <div>
              <div className="eyebrow mb-3">Detectors</div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {q.data!.detectors.map((d) => (
                  <li key={d.name} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-center justify-between"><span className="font-mono text-xs">{d.name}</span><Pill tone={d.active ? 'ok' : 'default'}>{d.active ? 'Active' : 'Inactive'}</Pill></div>
                    <p className="mt-1 text-xs text-muted-foreground">{d.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="eyebrow mb-3">Open reviews</div>
              {q.data!.reviews.length === 0 ? <EmptyState title="No reviews recorded" /> : (
                <ul className="space-y-2">
                  {q.data!.reviews.map((r) => (
                    <li key={r.id} className="rounded-xl border border-border bg-card/50 p-4 text-sm" data-testid={`row-review-${r.id}`}>
                      <div className="flex flex-wrap items-center gap-2"><Pill tone="warn">{r.status.replace('_', ' ')}</Pill><Pill>{r.targetType}</Pill><span className="font-mono text-xs">{shortAddr(r.target, 6)}</span>{r.suppressMetadata && <Pill tone="danger">Suppressed</Pill>}</div>
                      <div className="mt-2 font-medium">{r.reason.replace(/_/g, ' ')}</div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{r.notes}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">{r.evidenceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer nofollow" className="max-w-[16rem] truncate text-accent-foreground underline">{u}</a>)}</div>
                      <div className="mt-2 font-mono text-[11px] text-muted-foreground">by {shortAddr(r.createdBy)} · {fmtDate(r.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AuditTab() {
  const [limit, setLimit] = useState(50);
  const params = { limit };
  const q = useGetLaunchAdminAudit(params, { query: { queryKey: getGetLaunchAdminAuditQueryKey(params) } });
  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">Show</span>
        <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
          <SelectTrigger className="w-24" data-testid="select-audit-limit"><SelectValue /></SelectTrigger>
          <SelectContent>{[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {q.isLoading ? <Skeleton className="h-48" /> : q.isError ? <ErrorState message={readError(q.error).message} onRetry={() => q.refetch()} />
        : q.data!.records.length === 0 ? <EmptyState title="No audit records" /> : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs text-muted-foreground"><tr><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Summary</th></tr></thead>
              <tbody>
                {q.data!.records.map((r) => (
                  <tr key={r.id} className="border-t border-border/60"><td className="whitespace-nowrap p-3 font-mono text-xs">{fmtDate(r.createdAt)}</td><td className="p-3 font-mono text-xs">{shortAddr(r.actorWallet)}</td><td className="p-3"><Pill>{r.action.replace('_', ' ')}</Pill></td><td className="p-3 text-muted-foreground">{r.summary}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function AdminBody() {
  const { isAdmin, isAuthed } = useWallet();
  const cfg = useGetLaunchAdminConfig({ query: { queryKey: getGetLaunchAdminConfigQueryKey(), enabled: isAuthed && isAdmin, retry: false } });
  if (!isAdmin) return <Denied />;
  if (cfg.isLoading) return <Skeleton className="h-96" />;
  if (cfg.isError) {
    const e = readError(cfg.error);
    return e.status === 403 || e.status === 401 ? <Denied message={e.message} /> : <ErrorState message={e.message} onRetry={() => cfg.refetch()} />;
  }
  return (
    <Tabs defaultValue="config">
      <TabsList className="mb-6"><TabsTrigger value="config" data-testid="tab-config">Configuration</TabsTrigger><TabsTrigger value="reviews" data-testid="tab-reviews">Reviews</TabsTrigger><TabsTrigger value="audit" data-testid="tab-audit">Audit log</TabsTrigger></TabsList>
      <TabsContent value="config"><ConfigTab config={cfg.data!} /></TabsContent>
      <TabsContent value="reviews"><ReviewsTab /></TabsContent>
      <TabsContent value="audit"><AuditTab /></TabsContent>
    </Tabs>
  );
}

export default function Admin() {
  usePageMeta({ title: 'Admin', description: 'DarkSwap Launch administration.', noindex: true });
  return (
    <Page>
      <div className="eyebrow mb-2">Restricted</div>
      <h1 className="mb-10 text-4xl font-extrabold md:text-5xl">Admin</h1>
      <PrivateGate title="Admin verification required"><AdminBody /></PrivateGate>
    </Page>
  );
}
