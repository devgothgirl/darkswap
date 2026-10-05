import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAddress } from 'viem';
import { PublicKey } from '@solana/web3.js';
import { decodeAddress, protocolFeeOn, type Note } from '@darkswap/pool-client';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { CautionBanner, CautionBannerDescription } from '@workspace/darkswap-design-system/components/ui/caution-banner';
import { getQuote } from '../api';
import { isNativeAsset, privateSend, relayerFeeFor, unshield, unshieldFromWallet, type Asset, type Progress } from '../chain';
import { formatUnits, parseUnits } from '../format';
import { usePool } from '../use-pool';
import { Amount, AssetChoice, Done, ErrorNote, Field, inputClass, Requires, Row, WalletConnect } from '../ui';

const STEP_LABEL = { proving: 'Making the proof on this device…', relaying: 'Handing it to the relayer…', signing: 'Confirm in your wallet…', confirming: 'Waiting for the chain…' };

/** One transaction spends at most two notes. */
function twoLargest(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0)).slice(0, 2);
}

function useAction(onDone: () => void) {
  const { refresh } = usePool();
  const [step, setStep] = useState<keyof typeof STEP_LABEL | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (fn: (p: Progress) => Promise<string>) => {
    setError(null); setDone(null);
    try {
      setDone(await fn(setStep));
      onDone();
      await refresh();
    } catch (e) {
      setError((e as Error).message || 'This did not go through.');
    } finally {
      setStep(null);
    }
  };
  return { step, error, done, run, busy: step !== null };
}

function BalanceLine({ asset, total, count }: { asset: Asset; total: bigint; count: number }) {
  return <Row label="Shielded balance"><Amount value={total} asset={asset} /> <span className="text-muted-foreground">· {count} note{count === 1 ? '' : 's'}</span></Row>;
}

/** Offered when the amount is covered by the balance but not by two notes. */
function MergeNotes({ asset, notes, onMerge, busy }: { asset: Asset; notes: Note[]; onMerge(n: Note[]): void; busy: boolean }) {
  const pair = twoLargest(notes);
  return (
    <CautionBanner tone="brand">
      <CautionBannerDescription>
        One transaction can spend two notes. Merge your two largest ({formatUnits(pair[0].amount + pair[1].amount, asset.decimals)} {asset.symbol}) into one
        with a free private send to yourself, then try again.
      </CautionBannerDescription>
      <Button variant="outline" size="sm" className="mt-2 self-start" disabled={busy} onClick={() => onMerge(pair)} data-testid="button-merge">Merge notes</Button>
    </CautionBanner>
  );
}

export function SendTab() {
  return <Requires keys><SendForm /></Requires>;
}

function SendForm() {
  const { pool, keys, balance } = usePool();
  const [asset, setAsset] = useState<Asset | null>(pool!.assets[0] ?? null);
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const action = useAction(() => setText(''));
  if (!pool || !keys || !asset) return null;
  const { total, notes } = balance(asset);
  const amount = parseUnits(text, asset.decimals);
  let toError: string | null = null;
  if (to.trim()) { try { decodeAddress(to.trim()); } catch { toError = 'This is not a shielded address (dark1…).'; } }
  const max2 = twoLargest(notes).reduce((s, n) => s + n.amount, 0n);
  const needsMerge = !!amount && amount <= total && amount > max2;
  const ready = !!amount && amount <= max2 && !!to.trim() && !toError;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Pay another shielded address. Sends are relayed for free, so no wallet of yours appears.</p>
      <AssetChoice asset={asset} onChange={(a) => { setAsset(a); setText(''); }} />
      <BalanceLine asset={asset} total={total} count={notes.length} />
      <Field label="To (shielded address)">
        <input className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} placeholder="dark1…" autoComplete="off" spellCheck={false} data-testid="input-send-to" />
      </Field>
      {toError && <p className="text-xs text-destructive-foreground">{toError}</p>}
      <Field label={`Amount (${asset.symbol})`}>
        <input className={inputClass} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0.0" data-testid="input-send-amount" />
      </Field>
      {amount && amount > total && <p className="text-xs text-destructive-foreground">More than your shielded balance.</p>}
      {needsMerge && (
        <MergeNotes asset={asset} notes={notes} busy={action.busy}
          onMerge={(pair) => void action.run((p) => privateSend(pool, keys, pair, asset, pair[0].amount + pair[1].amount, keys.address, p))} />
      )}
      <Button onClick={() => void action.run((p) => privateSend(pool, keys, notes, asset, amount!, to.trim(), p))} disabled={!ready || action.busy} data-testid="button-send">
        {action.step ? STEP_LABEL[action.step] : 'Send privately'}
      </Button>
      {action.error && <ErrorNote>{action.error}</ErrorNote>}
      {action.done && <Done chain={pool.info} hash={action.done}>Sent. The chain shows a pool transaction, not who paid whom or how much.</Done>}
    </div>
  );
}

export function UnshieldTab() {
  return <Requires keys><UnshieldForm /></Requires>;
}

type Route = 'relayer' | 'wallet';

function UnshieldForm() {
  const { pool, keys, wallet, balance } = usePool();
  const native = pool!.assets.find((a) => isNativeAsset(pool!, a)) ?? null;
  const [asset, setAsset] = useState<Asset | null>(native ?? pool!.assets[0] ?? null);
  const [text, setText] = useState('');
  const [recipient, setRecipient] = useState('');
  const [chosen, setChosen] = useState<Route>('relayer');
  const action = useAction(() => setText(''));
  const quote = useQuery({ queryKey: ['pool', 'quote', pool?.info.id], queryFn: () => getQuote(pool!.info.id), refetchInterval: 30_000, enabled: !!pool });
  if (!pool || !keys || !asset) return null;

  const { total, notes } = balance(asset);
  const amount = parseUnits(text, asset.decimals);
  const q = quote.data;
  const quotedFee = relayerFeeFor(pool, q, asset);
  // The relayer is the default; when it cannot take this asset, the wallet route is the only one.
  const route: Route = quotedFee === null ? 'wallet' : chosen;
  const relayerFee = route === 'relayer' ? quotedFee : 0n;
  const bps = pool.raw.feeBps ?? 0;
  const protocolFee = amount ? protocolFeeOn(amount, bps) : 0n;
  const recipientValid = pool.info.kind === 'evm' ? isAddress(recipient.trim()) : (() => { try { new PublicKey(recipient.trim()); return true; } catch { return false; } })();
  const spend = amount && relayerFee !== null ? amount + relayerFee : null;
  const max2 = twoLargest(notes).reduce((s, n) => s + n.amount, 0n);
  const needsMerge = !!spend && spend <= total && spend > max2;
  const walletReady = !!wallet && wallet.kind === pool.info.kind;
  const ready = !!spend && spend <= max2 && recipientValid && amount! > protocolFee && (route === 'relayer' || walletReady);

  const submit = () => void action.run((p) => route === 'relayer'
    ? unshield(pool, keys, notes, asset, amount!, recipient.trim(), relayerFee!, (q as { relayer: string }).relayer, p)
    : unshieldFromWallet(pool, wallet!, keys, notes, asset, amount!, recipient.trim(), p));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Withdraw to any public address, through the relayer or from your own wallet.</p>
      <AssetChoice asset={asset} onChange={(a) => { setAsset(a); setText(''); }} />
      <BalanceLine asset={asset} total={total} count={notes.length} />
      <Field label="Recipient (public address)">
        <input className={inputClass} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={pool.info.kind === 'evm' ? '0x…' : 'Solana address'} autoComplete="off" spellCheck={false} data-testid="input-unshield-to" />
      </Field>
      {recipient.trim() && !recipientValid && <p className="text-xs text-destructive-foreground">This is not a valid {pool.info.label} address.</p>}
      <Field label={`Amount withdrawn (${asset.symbol})`}>
        <input className={inputClass} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="0.0" data-testid="input-unshield-amount" />
      </Field>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="How to submit">
        <span className="text-xs font-medium text-muted-foreground">Submitted by</span>
        <RouteOption selected={route === 'relayer'} disabled={quotedFee === null} onSelect={() => setChosen('relayer')} testId="route-relayer"
          title="The relayer (recommended)"
          detail={quotedFee !== null
            ? `No wallet of yours appears. The relayer's network fee is paid in ${asset.symbol} from your shielded balance.`
            : q && !q.enabled ? 'The relayer is not running on this chain yet.'
            : q ? `The relayer does not accept ${asset.symbol} yet.` : 'Checking the relayer…'} />
        <RouteOption selected={route === 'wallet'} onSelect={() => setChosen('wallet')} testId="route-wallet"
          title="My own wallet"
          detail={`No relayer fee. Your wallet pays the network fee in ${pool.info.nativeSymbol} and is shown on chain as the sender, which links it to this withdrawal.`} />
      </div>
      {quote.error && <p className="text-xs text-destructive-foreground">{(quote.error as Error).message}</p>}
      {route === 'wallet' && <WalletConnect purpose="to submit the withdrawal from" />}

      {amount && relayerFee !== null && (
        <div className="flex flex-col gap-1 rounded-md border p-3">
          {route === 'relayer' && <Row label="Relayer fee (network cost)"><Amount value={relayerFee} asset={asset} /></Row>}
          <Row label="Spent from shielded balance"><Amount value={amount + relayerFee} asset={asset} /></Row>
          <Row label={`Protocol fee (${bps / 100}%)`}><Amount value={protocolFee} asset={asset} /></Row>
          <Row label="Recipient receives"><Amount value={amount - protocolFee} asset={asset} /></Row>
          {route === 'wallet' && <Row label="Network fee">Paid by your wallet in {pool.info.nativeSymbol}</Row>}
        </div>
      )}
      {spend && spend > total && <p className="text-xs text-destructive-foreground">More than your shielded balance{route === 'relayer' ? ', including the relayer fee' : ''}.</p>}
      {needsMerge && (
        <MergeNotes asset={asset} notes={notes} busy={action.busy}
          onMerge={(pair) => void action.run((p) => privateSend(pool, keys, pair, asset, pair[0].amount + pair[1].amount, keys.address, p))} />
      )}
      <CautionBanner tone="neutral">
        <CautionBannerDescription>
          A withdrawal is public: the recipient address, the asset and the amount received are visible on chain. Withdrawing the same
          amount you deposited, soon after, makes the two easy to match.
          {route === 'wallet' && ' Submitting from the wallet you deposited with links the two directly; use a different wallet if that matters.'}
        </CautionBannerDescription>
      </CautionBanner>
      <Button onClick={submit} disabled={!ready || action.busy} data-testid="button-unshield">
        {action.step ? STEP_LABEL[action.step] : 'Unshield'}
      </Button>
      {action.error && <ErrorNote>{action.error}</ErrorNote>}
      {action.done && <Done chain={pool.info} hash={action.done}>Withdrawn.</Done>}
    </div>
  );
}

function RouteOption({ selected, disabled, onSelect, title, detail, testId }: {
  selected: boolean; disabled?: boolean; onSelect(): void; title: string; detail: string; testId: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect} data-testid={testId}
      className={`flex flex-col gap-0.5 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-primary bg-primary/10' : 'hover-elevate'}`}>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}
