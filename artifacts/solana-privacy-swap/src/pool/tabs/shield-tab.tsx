import { useState } from 'react';
import { protocolFeeOn } from '@darkswap/pool-client';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { CautionBanner, CautionBannerDescription } from '@workspace/darkswap-design-system/components/ui/caution-banner';
import { shieldEvm, shieldSolana, type Asset } from '../chain';
import { parseUnits } from '../format';
import { usePool } from '../use-pool';
import { Amount, AssetChoice, Done, ErrorNote, Field, inputClass, Requires, Row, WalletConnect } from '../ui';

export function ShieldTab() {
  return <Requires keys><ShieldForm /></Requires>;
}

function ShieldForm() {
  const { pool, keys, wallet, notes, refresh } = usePool();
  const [asset, setAsset] = useState<Asset | null>(pool!.assets[0] ?? null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  if (!pool || !keys) return null;
  if (!asset) return <p className="text-sm text-muted-foreground">No assets are listed in this pool yet.</p>;

  const amount = parseUnits(text, asset.decimals);
  const bps = pool.raw.feeBps ?? 0;
  const fee = amount ? protocolFeeOn(amount, bps) : 0n;
  const walletReady = wallet && wallet.kind === pool.info.kind;

  const submit = async () => {
    if (!amount || !walletReady) return;
    setBusy(true); setError(null); setDone(null);
    try {
      const hash = wallet.kind === 'evm'
        ? await shieldEvm(pool, wallet, keys, notes, asset, amount)
        : await shieldSolana(pool, wallet, keys, notes, asset, amount);
      setDone(hash); setText('');
      await refresh();
    } catch (e) {
      setError((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? 'The deposit did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Move funds from a public wallet into your shielded balance.</p>
      <AssetChoice asset={asset} onChange={(a) => { setAsset(a); setText(''); }} />
      <Field label={`Amount (${asset.symbol})`}>
        <input className={inputClass} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0.0" data-testid="input-shield-amount" />
      </Field>
      {amount && (
        <div className="flex flex-col gap-1 rounded-md border p-3">
          <Row label="Shielded"><Amount value={amount} asset={asset} /></Row>
          <Row label={`Protocol fee (${bps / 100}%)`}><Amount value={fee} asset={asset} /></Row>
          <Row label="Paid from your wallet"><Amount value={amount + fee} asset={asset} /></Row>
        </div>
      )}
      <CautionBanner tone="neutral">
        <CautionBannerDescription>
          A deposit is public: your wallet address, the asset and this amount are visible on chain. Waiting, and sending
          round amounts others also use, makes the later withdrawal harder to match to it.
        </CautionBannerDescription>
      </CautionBanner>
      <WalletConnect purpose="to deposit from" />
      <Button onClick={() => void submit()} disabled={!amount || !walletReady || busy} data-testid="button-shield">
        {busy ? 'Confirm in your wallet…' : 'Shield'}
      </Button>
      {error && <ErrorNote>{error}</ErrorNote>}
      {done && <Done chain={pool.info} hash={done}>Deposit confirmed. It appears in your balance once indexed.</Done>}
    </div>
  );
}
