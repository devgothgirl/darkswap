import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useGetLaunchCreator,
  getGetLaunchCreatorQueryKey,
  useGetLaunchDrafts,
  getGetLaunchDraftsQueryKey,
  getGetLaunchDraftQueryKey,
  useDeleteLaunchDraft,
  type LaunchIncentiveState,
} from '@workspace/api-client-react';
import { Page } from '@/components/layout';
import { PrivateGate } from '@/components/wallet-ui';
import { EmptyState, ErrorState, Metric, Pill, TokenAvatar } from '@/components/bits';
import { TokenCard } from '@/components/token-card';
import { useWallet, useCsrfRequest } from '@/lib/wallet';
import { usePageMeta } from '@/lib/seo';
import { ago, fmtNum, fmtUsd, logoSrc, readError, shortAddr } from '@/lib/api';

function Incentives({ s }: { s: LaunchIncentiveState }) {
  const b = (v: boolean | null) => (v == null ? 'Unverified' : v ? 'Yes' : 'No');
  const rows: [string, string][] = [
    ['dark_pair', b(s.dark_pair)],
    ['dark_points', s.dark_points == null ? 'Unverified' : String(s.dark_points)],
    ['referral_volume', s.referral_volume == null ? 'Unverified' : fmtUsd(s.referral_volume) ?? 'Unverified'],
    ['creator_score', s.creator_score == null ? 'Unverified' : String(s.creator_score)],
    ['campaign_eligible', b(s.campaign_eligible)],
    ['builder_eligible', b(s.builder_eligible)],
  ];
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="eyebrow">Planned incentive state</div>
        <div className="flex gap-1.5"><Pill tone="warn">{s.state.replace('_', ' ')}</Pill>{s.under_review && <Pill tone="danger">Under review</Pill>}</div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border/70 p-2.5"><dt className="font-mono text-[11px] text-muted-foreground">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Planning fields only. No earning formula, points issuance, payouts or claimable value is active. Separate from DarkSwap swap rewards.</p>
    </div>
  );
}

function Dashboard() {
  const { wallet, isAuthed } = useWallet();
  const qc = useQueryClient();
  const { toast } = useToast();
  const request = useCsrfRequest();
  const creator = useGetLaunchCreator({ query: { queryKey: getGetLaunchCreatorQueryKey(), enabled: isAuthed } });
  const drafts = useGetLaunchDrafts({ query: { queryKey: getGetLaunchDraftsQueryKey(), enabled: isAuthed } });
  const del = useDeleteLaunchDraft({ request });

  if (creator.isLoading || drafts.isLoading) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  if (creator.isError) return <ErrorState message={readError(creator.error).message} onRetry={() => creator.refetch()} />;
  const c = creator.data!;
  if (c.wallet !== wallet) return null;
  const list = drafts.data?.drafts ?? c.drafts;
  const m = c.metrics;

  return (
    <div className="space-y-12">
      <section>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Metric label="Total volume" value={fmtUsd(m.totalVolumeUsd)} />
          <Metric label="$DARK volume" value={fmtUsd(m.darkVolumeUsd)} />
          <Metric label="Holders" value={fmtNum(m.holders)} hint="Distinct verified" />
          <Metric label="Fees" value={fmtUsd(m.feesUsd)} />
          <Metric label="Referrals" value={fmtNum(m.referrals)} />
          <Metric label="DarkPoints" value={fmtNum(m.darkPoints)} hint="Not claimable" />
        </div>
        {c.warnings.length > 0 && <ul className="mt-3 space-y-1 text-xs text-chart-5">{c.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-extrabold">Drafts</h2>
          <Button asChild size="sm"><Link href="/create" data-testid="button-new-draft"><Plus className="mr-1.5 h-4 w-4" />New draft</Link></Button>
        </div>
        {drafts.isError ? <ErrorState message={readError(drafts.error).message} onRetry={() => drafts.refetch()} />
          : list.length === 0 ? <EmptyState title="No drafts yet" action={<Button asChild><Link href="/create">Start preparing</Link></Button>}>Drafts you save are private to this wallet.</EmptyState>
          : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card/50">
              {list.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid={`row-draft-${d.id}`}>
                  <TokenAvatar src={d.logoId ? logoSrc(d.logoId) : null} label={d.symbol || '?'} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{d.name || 'Untitled'} <span className="font-mono text-sm text-muted-foreground">${d.symbol || '—'}</span></div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Updated {ago(d.updatedAt)} · {d.pairMint ? `pair ${shortAddr(d.pairMint)}` : 'no pair'} · {d.unavailableReason}</div>
                  </div>
                  <Pill>Draft · not launched</Pill>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline"><Link href={`/create?draft=${d.id}`} data-testid={`button-resume-${d.id}`}><Pencil className="mr-1.5 h-3.5 w-3.5" />Resume</Link></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button size="sm" variant="ghost" aria-label="Delete draft" data-testid={`button-delete-${d.id}`}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent className="glass">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                          <AlertDialogDescription>"{d.name || 'Untitled'}" will be permanently removed. This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => del.mutate({ id: d.id }, {
                              onSuccess: () => {
                                qc.removeQueries({ queryKey: getGetLaunchDraftQueryKey(d.id) });
                                qc.invalidateQueries({ queryKey: getGetLaunchDraftsQueryKey() });
                                qc.invalidateQueries({ queryKey: getGetLaunchCreatorQueryKey() });
                                toast({ title: 'Draft deleted' });
                              },
                              onError: (e) => toast({ title: 'Delete failed', description: readError(e).message, variant: 'destructive' }),
                            })}
                            data-testid={`button-confirm-delete-${d.id}`}
                          >Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-extrabold">Verified launches</h2>
        {c.launches.length === 0
          ? <EmptyState title="No attributed launches">Launches appear here only with verified creator attribution. The current discovery source does not provide it.</EmptyState>
          : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{c.launches.map((t) => <TokenCard key={t.mint} token={t} />)}</div>}
      </section>

      <Incentives s={c.incentives} />
    </div>
  );
}

export default function Creator() {
  usePageMeta({ title: 'Creator dashboard', description: 'Your private DarkSwap Launch drafts and verified launches.', noindex: true });
  const { wallet } = useWallet();
  return (
    <Page>
      <div className="eyebrow mb-2">Private</div>
      <h1 className="text-4xl font-extrabold md:text-5xl">Creator dashboard</h1>
      {wallet && <p className="mt-2 font-mono text-sm text-muted-foreground" data-testid="text-creator-wallet">{shortAddr(wallet, 6)}</p>}
      <div className="mt-10"><PrivateGate title="Verify to open your dashboard"><Dashboard /></PrivateGate></div>
    </Page>
  );
}
