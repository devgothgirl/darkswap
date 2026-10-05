import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'wouter';
import { ACTIVATION_MESSAGE, secretFromSignature, wordsToSecret } from '@darkswap/pool-client';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { Label } from '@workspace/darkswap-design-system/components/ui/label';
import { CautionBanner, CautionBannerDescription, CautionBannerTitle } from '@workspace/darkswap-design-system/components/ui/caution-banner';
import { usePool } from '../use-pool';
import { signActivation } from '../wallets';
import { ErrorNote, Field, WalletConnect } from '../ui';

export function ActivateTab() {
  const { keys, wallet, chain, unlock, lock, words } = usePool();
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [shownWords, setShownWords] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  if (keys) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">Your shielded account is unlocked in this tab. It locks after 30 idle minutes, or when you close the page.
          Back up your 24 recovery words: without the wallet that activated this account, they are the only way back in.</p>
        <Field label="Your shielded address">
          <code className="break-all rounded-md border bg-background p-2 font-mono text-xs" data-testid="text-dark-address">{keys.address}</code>
        </Field>
        {shownWords ? (
          <CautionBanner tone="caution">
            <CautionBannerTitle>Recovery words</CautionBannerTitle>
            <CautionBannerDescription>
              Anyone with these words can spend your shielded balance. Write them down offline. DarkSwap never stores them and cannot recover them.
            </CautionBannerDescription>
            <ol className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-sm" data-testid="list-recovery-words">
              {shownWords.split(' ').map((w, i) => <li key={i}><span className="text-muted-foreground">{i + 1}.</span> {w}</li>)}
            </ol>
            <Button variant="outline" size="sm" className="mt-2 self-start" onClick={() => setShownWords(null)}>Hide words</Button>
          </CautionBanner>
        ) : (
          <Button variant="outline" onClick={() => setShownWords(words())} data-testid="button-show-words">Show 24 recovery words</Button>
        )}
        <Button variant="secondary" onClick={() => { setShownWords(null); lock(); }} data-testid="button-lock">Lock now</Button>
      </div>
    );
  }

  const activate = async () => {
    if (!wallet) return;
    setError(null);
    setSigning(true);
    try {
      const signature = await signActivation(wallet, ACTIVATION_MESSAGE);
      unlock(secretFromSignature(signature));
      setShownWords(null);
    } catch (e) {
      setError((e as Error).message || 'The wallet did not sign.');
    } finally {
      setSigning(false);
    }
  };
  const restore = () => {
    setError(null);
    try {
      unlock(wordsToSecret(phrase));
      setPhrase('');
    } catch (e) {
      setError((e as Error).message || 'Those words are not a valid recovery phrase.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-bold">Activate with a wallet</h3>
        <p className="text-sm text-muted-foreground">
          Your wallet signs one fixed message. The signature becomes your shielded keys, on this device only. It is not a transaction and costs nothing.
          The same wallet always gives the same keys, on every chain.
        </p>
        {chain && <WalletConnect purpose="to sign" />}
        {wallet && (
          <>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 font-mono text-xs text-muted-foreground">{ACTIVATION_MESSAGE}</pre>
            <Button onClick={() => void activate()} disabled={signing} data-testid="button-activate">{signing ? 'Waiting for the wallet…' : 'Sign to activate'}</Button>
          </>
        )}
      </section>
      <section className="flex flex-col gap-2 border-t pt-4">
        <h3 className="text-sm font-bold">Or restore from recovery words</h3>
        <Label htmlFor="pool-recovery-phrase">Recovery phrase</Label>
        <p id="pool-recovery-phrase-help" className="text-sm text-muted-foreground">24 words, separated by spaces</p>
        <textarea
          id="pool-recovery-phrase" aria-describedby="pool-recovery-phrase-help"
          value={phrase} onChange={(e) => setPhrase(e.target.value)} rows={3} autoComplete="off" spellCheck={false}
          placeholder="24 words, separated by spaces"
          className="w-full rounded-md border border-input bg-background p-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="input-recovery-words"
        />
        <Button variant="outline" onClick={restore} disabled={!phrase.trim()} data-testid="button-restore">Restore</Button>
      </section>
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

export function ReceiveTab() {
  const { keys } = usePool();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!keys) return setQr(null);
    // Rendered locally; the address never leaves the browser to draw this.
    QRCode.toDataURL(keys.address, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then(setQr, () => setQr(null));
  }, [keys]);
  if (!keys) return <p className="text-sm text-muted-foreground">Activate or unlock your shielded account first, on the Activate tab.</p>;
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="self-start text-sm text-muted-foreground">
        Share this address to receive private sends. It works on every pool chain. Senders see only this address, never your wallet.
      </p>
      <p className="self-start text-sm text-muted-foreground">
        A private send shows on chain as a pool transaction: not who sent it, who received it, the asset or the amount. If you later
        unshield, that withdrawal's destination and amount are public. <Link href="/pool/what-stays-public" className="text-ring underline-offset-2 hover:underline">What stays public</Link>
      </p>
      {qr && <img src={qr} width={240} height={240} alt="QR code of your shielded address" className="rounded-md bg-white p-2" />}
      <code className="w-full break-all rounded-md border bg-background p-2 font-mono text-xs" data-testid="text-receive-address">{keys.address}</code>
      <Button variant="outline" className="w-full" onClick={() => { void navigator.clipboard.writeText(keys.address); setCopied(true); setTimeout(() => setCopied(false), 1500); }} data-testid="button-copy-address">
        {copied ? 'Copied' : 'Copy address'}
      </Button>
    </div>
  );
}
