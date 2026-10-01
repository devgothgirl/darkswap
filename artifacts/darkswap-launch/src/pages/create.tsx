import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Save, Upload, Loader2, Lock, Check, X as XIcon, ImageIcon, CircleAlert, CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useGetStonkfunPairs,
  getGetStonkfunPairsQueryKey,
  useGetLaunchConfig,
  getGetLaunchConfigQueryKey,
  useGetLaunchDraft,
  getGetLaunchDraftQueryKey,
  getGetLaunchDraftsQueryKey,
  getGetLaunchCreatorQueryKey,
  useCreateLaunchDraft,
  useUpdateLaunchDraft,
  useRequestLaunchLogoUpload,
  useCompleteLaunchLogoUpload,
  type LaunchDraftInput,
  type LaunchAllocations,
} from '@workspace/api-client-react';
import { Page } from '@/components/layout';
import { PairPicker, pairSelectable } from '@/components/pair-picker';
import { ErrorState, Pill, TokenAvatar } from '@/components/bits';
import { useWallet, useCsrfRequest } from '@/lib/wallet';
import { usePageMeta } from '@/lib/seo';
import { HTTP_URL, fmtSupply, logoSrc, readError, shortAddr } from '@/lib/api';
import { cn } from '@/lib/utils';

const DEFAULT: LaunchDraftInput = {
  name: '', symbol: '', description: '', website: '', x: '', telegram: '', discord: '', github: '',
  logoId: null, pairMint: null, network: 'mainnet-beta', supply: '1000000000',
  allocations: { creator: 0, developer: 0, liquidity: 100, community: 0 },
};
const STEPS = ['Identity', 'Pair', 'Economics', 'Review'];
const SOCIALS = [
  { k: 'website', label: 'Website', ph: 'https://' },
  { k: 'x', label: 'X', ph: 'https://x.com/…' },
  { k: 'telegram', label: 'Telegram', ph: 'https://t.me/…' },
  { k: 'discord', label: 'Discord', ph: 'https://discord.gg/…' },
  { k: 'github', label: 'GitHub', ph: 'https://github.com/…' },
] as const;
const ALLOC: { k: keyof LaunchAllocations; label: string; color: string }[] = [
  { k: 'creator', label: 'Creator', color: 'bg-chart-1' },
  { k: 'developer', label: 'Developer', color: 'bg-chart-2' },
  { k: 'liquidity', label: 'Liquidity', color: 'bg-chart-3' },
  { k: 'community', label: 'Community', color: 'bg-chart-4' },
];
const allocSum = (a: LaunchAllocations) => Math.round((a.creator + a.developer + a.liquidity + a.community) * 100) / 100;

function urlErrors(f: LaunchDraftInput) {
  const e: Record<string, string> = {};
  for (const s of SOCIALS) {
    const v = f[s.k];
    if (v && (!HTTP_URL.test(v) || v.length > 500)) e[s.k] = 'Must start with http:// or https://';
  }
  return e;
}
function identityErrors(f: LaunchDraftInput) {
  const e = urlErrors(f);
  if (!f.name.trim()) e.name = 'Name is required';
  if (!f.symbol) e.symbol = 'Ticker is required';
  else if (!/^[A-Za-z0-9_-]{1,16}$/.test(f.symbol)) e.symbol = 'Letters, numbers, _ or -, up to 16';
  return e;
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-sm">{label}</Label>
      {children}
      {error ? <p id={`${id}-err`} className="mt-1 text-xs text-destructive">{error}</p> : hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function Create() {
  usePageMeta({ title: 'Create token', description: 'Prepare a Solana token launch privately: identity, pair, economics and review.', noindex: true });
  const search = useSearch();
  const draftParam = new URLSearchParams(search).get('draft');
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthed, wallet, privateEpoch: epoch, setAuthOpen, setConnectOpen } = useWallet();
  const request = useCsrfRequest();

  const [form, setForm] = useState<LaunchDraftInput>(DEFAULT);
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [localLogo, setLocalLogo] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(DEFAULT));
  const initFor = useRef<string | null>(null);
  const epochRef = useRef(epoch);

  const cfg = useGetLaunchConfig({ query: { queryKey: getGetLaunchConfigQueryKey() } });
  const pairsQ = useGetStonkfunPairs({ query: { queryKey: getGetStonkfunPairsQueryKey(), staleTime: 120_000 } });
  const draftQ = useGetLaunchDraft(draftParam ?? '', {
    query: { queryKey: getGetLaunchDraftQueryKey(draftParam ?? ''), enabled: isAuthed && !!draftParam && initFor.current !== draftParam, retry: false },
  });
  const createM = useCreateLaunchDraft({ request });
  const updateM = useUpdateLaunchDraft({ request });
  const reqLogo = useRequestLaunchLogoUpload({ request });
  const doneLogo = useCompleteLaunchLogoUpload({ request });

  // Wallet/session change: wipe private form state immediately.
  useEffect(() => {
    if (epochRef.current === epoch) return;
    epochRef.current = epoch;
    setForm(DEFAULT); setDraftId(null); setStep(0); setConfirmed(false); setSavedAt(null); setSaveError(null); setLocalLogo(null);
    lastSaved.current = JSON.stringify(DEFAULT);
    initFor.current = null;
    if (draftParam) setLocation('/create', { replace: true });
  }, [epoch, draftParam, setLocation]);

  useEffect(() => {
    const d = draftQ.data;
    if (!d || !draftParam || initFor.current === draftParam || d.wallet !== wallet) return;
    initFor.current = draftParam;
    const next: LaunchDraftInput = {
      name: d.name, symbol: d.symbol, description: d.description, website: d.website, x: d.x, telegram: d.telegram,
      discord: d.discord, github: d.github, logoId: d.logoId, pairMint: d.pairMint, network: 'mainnet-beta', supply: d.supply, allocations: d.allocations,
    };
    setForm(next); setDraftId(d.id); setConfirmed(false); setSavedAt(d.updatedAt); setLocalLogo(null);
    lastSaved.current = JSON.stringify(next);
  }, [draftQ.data, draftParam, wallet]);

  useEffect(() => () => { if (localLogo) URL.revokeObjectURL(localLogo); }, [localLogo]);

  const update = <K extends keyof LaunchDraftInput>(k: K, v: LaunchDraftInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setConfirmed(false);
  };
  const setAlloc = (k: keyof LaunchAllocations, raw: string) => {
    const n = raw === '' ? 0 : Math.max(0, Math.min(100, Number(raw)));
    setForm((f) => ({ ...f, allocations: { ...f.allocations, [k]: Number.isFinite(n) ? n : 0 } }));
    setConfirmed(false);
  };

  const pairs = pairsQ.data?.pairs ?? [];
  const pair = pairs.find((p) => p.mint === form.pairMint) ?? null;
  const idErr = identityErrors(form);
  const supplyOk = /^[1-9][0-9]{0,77}$/.test(form.supply);
  const sum = allocSum(form.allocations);
  const stepValid = [Object.keys(idErr).length === 0, !!pair && pairSelectable(pair), supplyOk && sum === 100, confirmed];
  const dirty = JSON.stringify(form) !== lastSaved.current;
  const saving = createM.isPending || updateM.isPending;

  const blockReason = useMemo(() => {
    if (!isAuthed) return 'Verify your wallet to continue.';
    if (cfg.data?.paused) return 'Launch preparation is paused by DarkSwap.';
    if (pair && pair.unavailableReason) return pair.unavailableReason;
    return cfg.data?.unavailableReason ?? 'Launch execution is not available in this release.';
  }, [isAuthed, cfg.data, pair]);

  async function save() {
    setSaveError(null);
    if (!isAuthed) { wallet ? setAuthOpen(true) : setConnectOpen(true); return; }
    const ue = urlErrors(form);
    if (Object.keys(ue).length || (form.symbol && idErr.symbol)) { setShowErrors(true); setSaveError('Fix highlighted fields before saving. Your work is still here.'); return; }
    const snapshot = form;
    const startEpoch = epochRef.current;
    try {
      const d = draftId ? await updateM.mutateAsync({ id: draftId, data: snapshot }) : await createM.mutateAsync({ data: snapshot });
      if (startEpoch !== epochRef.current) return;
      lastSaved.current = JSON.stringify(snapshot);
      initFor.current = d.id;
      setDraftId(d.id);
      setSavedAt(d.updatedAt);
      qc.setQueryData(getGetLaunchDraftQueryKey(d.id), d);
      qc.invalidateQueries({ queryKey: getGetLaunchDraftsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetLaunchCreatorQueryKey() });
      if (draftParam !== d.id) setLocation(`/create?draft=${d.id}`, { replace: true });
      toast({ title: 'Draft saved privately', description: 'Saved drafts are not launches.' });
    } catch (e) {
      if (startEpoch !== epochRef.current) return;
      const pr = readError(e, 'Save failed.');
      setSaveError(pr.status === 401 ? 'Your session expired. Verify your wallet again to resume the last saved draft.' : `${pr.message} Your work is still here; try again.`);
    }
  }

  async function onLogo(file: File) {
    setLogoError(null);
    if (!isAuthed) { setLogoError('Verify your wallet to upload a logo.'); return; }
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') { setLogoError('PNG or JPEG only.'); return; }
    if (file.size > 1048576) { setLogoError('Max 1 MB.'); return; }
    const startEpoch = epochRef.current;
    setLogoBusy(true);
    try {
      const up = await reqLogo.mutateAsync({ data: { name: file.name.slice(0, 200), size: file.size, contentType: file.type } });
      const put = await fetch(up.uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!put.ok) throw new Error('Upload to storage failed.');
      const done = await doneLogo.mutateAsync({ id: up.id });
      if (startEpoch !== epochRef.current) return;
      update('logoId', done.id);
      setLocalLogo(URL.createObjectURL(file));
    } catch (e) {
      if (startEpoch === epochRef.current) setLogoError(readError(e, 'Logo upload failed.').message);
    } finally {
      setLogoBusy(false);
    }
  }

  const next = () => {
    if (!stepValid[step]) { setShowErrors(true); return; }
    setShowErrors(false);
    setStep((s) => Math.min(3, s + 1));
  };
  const logoUrl = localLogo ?? (form.logoId ? logoSrc(form.logoId) : null);

  if (draftParam && isAuthed && draftQ.isLoading) return <Page><Skeleton className="h-10 w-64" /><Skeleton className="mt-6 h-96 w-full" /></Page>;

  return (
    <Page>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow mb-2">Private preparation</div>
          <h1 className="text-4xl font-extrabold md:text-5xl">Create token</h1>
          <p className="mt-2 text-sm text-muted-foreground">Preparation only. Nothing here creates a token or requests a transaction.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground" aria-live="polite" data-testid="text-save-status">
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Not saved'}
          </span>
          <Button variant="outline" onClick={save} disabled={saving} data-testid="button-save-draft">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{draftId ? 'Save draft' : 'Save new draft'}
          </Button>
        </div>
      </div>

      {draftParam && isAuthed && draftQ.isError && <div className="mt-6"><ErrorState title="Draft unavailable" message={readError(draftQ.error, 'This draft could not be loaded for your wallet.').message} onRetry={() => draftQ.refetch()} /></div>}
      {draftParam && !isAuthed && <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm">Verify the wallet that owns this draft to resume it. <Button size="sm" variant="link" onClick={() => (wallet ? setAuthOpen(true) : setConnectOpen(true))}>Verify now</Button></div>}
      {saveError && <div role="alert" className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-save-error">{saveError}</div>}

      <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => { if (i <= step || stepValid.slice(0, i).every(Boolean)) setStep(i); }}
              aria-current={step === i ? 'step' : undefined}
              className={cn('w-full rounded-xl border px-3 py-2.5 text-left transition-colors', step === i ? 'border-primary bg-primary/10' : 'border-border bg-card/50 hover:border-primary/40')}
              data-testid={`button-step-${i}`}
            >
              <div className="font-mono text-[10px] text-muted-foreground">STEP 0{i + 1}</div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">{s}{i < 3 && stepValid[i] && <Check className="h-3.5 w-3.5 text-chart-3" />}</div>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 rounded-2xl border border-border bg-card/50 p-5 md:p-7">
          {step === 0 && (
            <div className="space-y-5">
              <div className="grid gap-5 md:grid-cols-[1fr_160px]">
                <Field id="name" label="Token name" error={showErrors ? idErr.name : undefined}>
                  <Input id="name" maxLength={80} value={form.name} onChange={(e) => update('name', e.target.value)} aria-invalid={showErrors && !!idErr.name} data-testid="input-name" />
                </Field>
                <Field id="symbol" label="Ticker" error={(showErrors || form.symbol) ? idErr.symbol : undefined}>
                  <Input id="symbol" maxLength={16} value={form.symbol} onChange={(e) => update('symbol', e.target.value.toUpperCase())} className="font-mono" data-testid="input-symbol" />
                </Field>
              </div>
              <Field id="description" label="Description" hint={`${form.description.length}/2000 · plain text`}>
                <Textarea id="description" rows={5} maxLength={2000} value={form.description} onChange={(e) => update('description', e.target.value)} data-testid="input-description" />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                {SOCIALS.map((s) => (
                  <Field key={s.k} id={s.k} label={`${s.label} (optional)`} error={idErr[s.k]}>
                    <Input id={s.k} type="url" inputMode="url" maxLength={500} placeholder={s.ph} value={form[s.k]} onChange={(e) => update(s.k, e.target.value.trim())} data-testid={`input-${s.k}`} />
                  </Field>
                ))}
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">Logo</Label>
                <div className="flex items-center gap-4 rounded-xl border border-dashed border-border p-4">
                  <TokenAvatar src={logoUrl} label={form.symbol || 'L'} size={64} />
                  <div className="flex-1 text-xs text-muted-foreground">PNG or JPEG, up to 1 MB. Uploaded privately and validated before use.</div>
                  <label className={cn('inline-flex cursor-pointer items-center rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-primary/60 focus-within:outline focus-within:outline-2 focus-within:outline-ring', logoBusy && 'pointer-events-none opacity-60')}>
                    {logoBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}{form.logoId ? 'Replace' : 'Upload'}
                    <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onLogo(f); }} data-testid="input-logo" />
                  </label>
                  {form.logoId && <Button size="icon" variant="ghost" aria-label="Remove logo" onClick={() => { update('logoId', null); setLocalLogo(null); }} data-testid="button-remove-logo"><XIcon className="h-4 w-4" /></Button>}
                </div>
                {logoError && <p role="alert" className="mt-1 text-xs text-destructive">{logoError}</p>}
              </div>
            </div>
          )}

          {step === 1 && (
            pairsQ.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            : pairsQ.isError ? <ErrorState message={readError(pairsQ.error, 'Pair catalog unavailable.').message} onRetry={() => pairsQ.refetch()} />
            : (
              <div>
                <PairPicker stale={!!pairsQ.data?.source.stale} pairs={pairs} config={cfg.data} value={form.pairMint} onChange={(m) => update('pairMint', m)} />
                {form.pairMint && !pair && <p className="mt-4 text-sm text-chart-5">The previously saved pair ({shortAddr(form.pairMint, 6)}) is not in the current catalog. Choose another.</p>}
                {showErrors && !stepValid[1] && <p className="mt-4 text-sm text-destructive">Choose an available pair.</p>}
                {(pairsQ.data?.ambiguousSymbolCount ?? 0) > 0 && <p className="mt-4 text-xs text-muted-foreground">{pairsQ.data?.ambiguousSymbolCount} tickers are shared by multiple mints. Their full addresses are shown; always choose by mint.</p>}
              </div>
            )
          )}

          {step === 2 && (
            <div className="space-y-6">
              <Field id="supply" label="Total supply" error={!supplyOk ? 'Whole number greater than zero' : undefined} hint={supplyOk ? fmtSupply(form.supply) : undefined}>
                <Input id="supply" inputMode="numeric" value={form.supply} onChange={(e) => update('supply', e.target.value.replace(/[^0-9]/g, '').slice(0, 78))} className="font-mono" data-testid="input-supply" />
              </Field>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-sm">Allocations</Label>
                  <span className={cn('font-mono text-sm font-semibold', sum === 100 ? 'text-chart-3' : 'text-destructive')} aria-live="polite" data-testid="text-alloc-sum">{sum}% / 100%</span>
                </div>
                <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  {ALLOC.map((a) => <div key={a.k} className={cn(a.color, 'transition-all')} style={{ width: `${Math.min(100, form.allocations[a.k])}%` }} />)}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {ALLOC.map((a) => (
                    <div key={a.k} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <span className={cn('h-2.5 w-2.5 rounded-full', a.color)} />
                      <Label htmlFor={`alloc-${a.k}`} className="flex-1 text-sm">{a.label}</Label>
                      <Input id={`alloc-${a.k}`} type="number" min={0} max={100} step={0.01} value={form.allocations[a.k]} onChange={(e) => setAlloc(a.k, e.target.value)} className="h-9 w-24 text-right font-mono" data-testid={`input-alloc-${a.k}`} />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  ))}
                </div>
                {sum !== 100 && <p className="mt-2 text-xs text-destructive">Allocations must total exactly 100%. Currently {sum > 100 ? `${Math.round((sum - 100) * 100) / 100}% over` : `${Math.round((100 - sum) * 100) / 100}% remaining`}.</p>}
              </div>
              <p className="rounded-xl border border-chart-5/30 bg-chart-5/5 p-3 text-xs text-muted-foreground">Preparation-only economics. These values are not verified as accepted by the upstream launch program.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
                {[
                  ['Name', form.name || '—'], ['Ticker', form.symbol || '—'], ['Network', 'Solana mainnet-beta'],
                  ['Pair', pair ? `${pair.symbol} · ${shortAddr(pair.mint, 6)}` : 'Not selected'], ['Supply', fmtSupply(form.supply)],
                  ['Allocations', ALLOC.map((a) => `${a.label} ${form.allocations[a.k]}%`).join(', ')],
                  ['Signing wallet', wallet ? shortAddr(wallet, 6) : 'Not connected'],
                  ['Logo', form.logoId ? 'Uploaded' : 'None'],
                ].map(([k, v]) => (
                  <div key={k} className="border-b border-border/60 pb-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words font-medium">{v}</dd></div>
                ))}
              </dl>
              <div className="rounded-xl border border-border p-4">
                <div className="eyebrow mb-3">Readiness</div>
                <ul className="space-y-2 text-sm">
                  {[
                    [isAuthed, 'Wallet verified for this session'],
                    [true, 'Network: Solana mainnet-beta'],
                    [!!pair && pairSelectable(pair), 'Pair launchable and lab-ready upstream'],
                    [false, 'Launch destination: no verified destination'],
                    [false, 'Provider launch fee: not verified (nothing will be charged)'],
                    [false, `Execution: ${cfg.data?.unavailableReason ?? 'unavailable'}`],
                  ].map(([ok, t]) => (
                    <li key={t as string} className="flex items-start gap-2">{ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-chart-3" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-chart-5" />}<span>{t as string}</span></li>
                  ))}
                </ul>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} disabled={!stepValid.slice(0, 3).every(Boolean)} data-testid="checkbox-confirm" />
                <span>I reviewed this configuration. Any edit clears this confirmation. A saved draft is not a launch.</span>
              </label>
              <div>
                <Button size="lg" className="h-12 w-full font-bold tracking-widest" disabled aria-describedby="launch-reason" data-testid="button-launch">
                  <Lock className="mr-2 h-4 w-4" />LAUNCH
                </Button>
                <p id="launch-reason" className="mt-2 text-center text-xs text-muted-foreground" data-testid="text-launch-reason">{blockReason}</p>
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-between border-t border-border pt-5">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} data-testid="button-back"><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
            {step < 3 && <Button onClick={next} data-testid="button-next">Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Live preview">
          <div className="eyebrow mb-3">Live preview</div>
          <div className="glass edge-glow rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <TokenAvatar src={logoUrl} label={form.symbol || '?'} size={56} />
              <div className="min-w-0">
                <div className="truncate font-display text-xl font-bold" data-testid="text-preview-name">{form.name || 'Untitled token'}</div>
                <div className="font-mono text-sm text-muted-foreground">${form.symbol || 'TICKER'}{pair ? ` / ${pair.symbol}` : ''}</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Pill>Draft</Pill><Pill tone="purple">mainnet-beta</Pill>
              {pair?.group === 'dark' && <Pill tone="purple">DarkSwap ecosystem</Pill>}
            </div>
            <p className="mt-4 line-clamp-5 whitespace-pre-wrap break-words text-sm text-muted-foreground">{form.description || 'Your description appears here.'}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {SOCIALS.filter((s) => form[s.k] && !idErr[s.k]).map((s) => <Pill key={s.k}>{s.label}</Pill>)}
            </div>
            <div className="mt-5 border-t border-border pt-4">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Supply</span><span className="font-mono">{supplyOk ? fmtSupply(form.supply) : '—'}</span></div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-secondary">
                {ALLOC.map((a) => <div key={a.k} className={a.color} style={{ width: `${Math.min(100, form.allocations[a.k])}%` }} />)}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                {ALLOC.map((a) => <span key={a.k}>{a.label} {form.allocations[a.k]}%</span>)}
              </div>
            </div>
            {!form.logoId && <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground"><ImageIcon className="h-3.5 w-3.5" />No logo yet</div>}
          </div>
        </aside>
      </div>
    </Page>
  );
}
