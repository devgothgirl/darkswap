import { useState } from 'react';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { StatusPill } from '@workspace/darkswap-design-system/components/ui/status-pill';
import { sweepFees, type Asset } from '../chain';
import { usePool } from '../use-pool';
import { Amount, Done, ErrorNote, Requires, Row, TxLink, WalletConnect } from '../ui';

export function ActivityTab() {
  return <Requires keys><Activity /></Requires>;
}

function Activity() {
  const { pool, notes, refresh } = usePool();
  if (!pool) return null;
  const rows = [...notes].filter((n) => n.amount > 0n).sort((a, b) => b.pathIndex - a.pathIndex);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Notes found for your keys in this pool. Only this device can read them.</p>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} data-testid="button-refresh-activity">Refresh</Button>
      </div>
      {!rows.length && <p className="text-sm text-muted-foreground">Nothing yet. Shield funds, or share your address from the Receive tab.</p>}
      <ul className="flex flex-col divide-y rounded-md border">
        {rows.map((n) => {
          const asset = pool.assets.find((a) => a.id === n.assetId);
          const spent = pool.spent.has(n.nullifier);
          const received = pool.txOfIndex.get(n.pathIndex);
          const spentTx = pool.raw.spentTx[n.nullifier.toString()];
          return (
            <li key={n.pathIndex} className="flex flex-col gap-1 p-3" data-testid={`row-note-${n.pathIndex}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm tabular-nums">{asset ? <Amount value={n.amount} asset={asset} /> : n.amount.toString()}</span>
                <StatusPill size="sm" tone={spent ? 'neutral' : 'brand'}>{spent ? 'Spent' : 'Unspent'}</StatusPill>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{n.depositNumber !== null ? 'Deposit' : 'Received'}{received && <> · <TxLink chain={pool.info} hash={received} /></>}</span>
                {spent && spentTx && <span>Spent · <TxLink chain={pool.info} hash={spentTx} /></span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FeesTab() {
  return <Requires><Fees /></Requires>;
}

function Fees() {
  const { pool, wallet, refresh } = usePool();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!pool) return null;
  const sweep = async (asset: Asset) => {
    if (!wallet) return;
    setBusy(asset.token); setError(null); setDone(null);
    try {
      setDone(await sweepFees(pool, wallet, asset));
      await refresh();
    } catch (e) {
      setError((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? 'The sweep did not go through.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        The protocol fee is charged on deposits and withdrawals, never on private sends. Every figure here is read from the chain.
      </p>
      <div className="flex flex-col gap-1 rounded-md border p-3">
        <Row label="Protocol fee">{(pool.raw.feeBps ?? 0) / 100}%</Row>
        <Row label="Fee recipient">Fixed when the pool was deployed</Row>
        <Row label="Planned use">Add to ZEC-DARK liquidity</Row>
      </div>
      {pool.raw.protocolFees.map((f) => {
        const asset = pool.assets.find((a) => a.token === f.token)!;
        const unswept = BigInt(f.unswept);
        return (
          <div key={f.token} className="flex flex-col gap-1 rounded-md border p-3" data-testid={`fees-${f.symbol}`}>
            <span className="text-sm font-bold">{f.symbol}</span>
            <Row label="Charged"><Amount value={BigInt(f.charged)} asset={f} /></Row>
            <Row label="Sent to the fee recipient"><Amount value={BigInt(f.swept)} asset={f} /></Row>
            <Row label="Waiting in the pool"><Amount value={unswept} asset={f} /></Row>
            {unswept > 0n && wallet && wallet.kind === pool.info.kind && (
              <Button variant="outline" size="sm" className="mt-1 self-start" disabled={busy !== null} onClick={() => void sweep(asset)} data-testid={`button-sweep-${f.symbol}`}>
                {busy === f.token ? 'Confirm in your wallet…' : 'Sweep now'}
              </Button>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">Anyone can trigger a sweep; the pool only ever pays it to its fixed fee recipient.</p>
      <WalletConnect purpose="to sweep fees" />
      {error && <ErrorNote>{error}</ErrorNote>}
      {done && <Done chain={pool.info} hash={done}>Fees sent to the fee recipient.</Done>}
    </div>
  );
}

