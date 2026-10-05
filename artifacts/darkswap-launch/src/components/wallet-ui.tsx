import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Wallet, ShieldCheck, LogOut, Unplug, LayoutDashboard, KeyRound, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@workspace/darkswap-design-system/components/ui/button';
import { Checkbox } from '@workspace/darkswap-design-system/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@workspace/darkswap-design-system/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@workspace/darkswap-design-system/components/ui/dropdown-menu';
import { useWallet } from '@/lib/wallet';
import { shortAddr, readError } from '@/lib/api';

export function ConnectDialog() {
  const { connectOpen, setConnectOpen, options, connect, connecting, refreshOptions, setAuthOpen } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={connectOpen} onOpenChange={(v) => { setConnectOpen(v); if (v) { refreshOptions(); setErr(null); } }}>
      <DialogContent className="glass sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Connect a Solana wallet</DialogTitle>
          <DialogDescription>
            Connecting only shares your public address. It does not sign anything or sign you in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {options.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              No compatible wallet detected. Install{' '}
              <a className="text-accent-foreground underline" href="https://phantom.app" target="_blank" rel="noopener noreferrer">Phantom</a> or{' '}
              <a className="text-accent-foreground underline" href="https://solflare.com" target="_blank" rel="noopener noreferrer">Solflare</a>, then reload.
            </div>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={connecting}
              onClick={async () => {
                setErr(null);
                try {
                  await connect(o.id);
                  setConnectOpen(false);
                  setAuthOpen(true);
                } catch (e) {
                  setErr(readError(e, 'Connection was cancelled.').message);
                }
              }}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-primary/60 disabled:opacity-60"
              data-testid={`button-connect-${o.id}`}
            >
              <span className="font-semibold">{o.name}</span>
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="font-mono text-xs text-muted-foreground">Detected</span>}
            </button>
          ))}
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <p className="pt-2 text-xs text-muted-foreground">Never enter a seed phrase or private key on any site. DarkSwap Launch will never ask for one.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AuthDialog() {
  const { authOpen, setAuthOpen, wallet, walletName, authenticate, authStage, authError, isAuthed } = useWallet();
  const [networkOk, setNetworkOk] = useState(false);
  const busy = authStage !== 'idle';
  const stageCopy: Record<string, string> = { challenge: 'Requesting challenge…', signing: 'Approve the message in your wallet…', verifying: 'Verifying signature…' };
  return (
    <Dialog open={authOpen} onOpenChange={(v) => { setAuthOpen(v); if (!v) setNetworkOk(false); }}>
      <DialogContent className="glass sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Verify wallet ownership</DialogTitle>
          <DialogDescription>Sign a plain-text message to open your private creator workspace.</DialogDescription>
        </DialogHeader>
        {isAuthed ? (
          <div className="rounded-xl border border-chart-3/40 bg-chart-3/10 p-4 text-sm">
            Verified as <span className="font-mono">{shortAddr(wallet, 6)}</span>.
            <div className="mt-3"><Button size="sm" onClick={() => setAuthOpen(false)} data-testid="button-auth-done">Continue</Button></div>
          </div>
        ) : !wallet ? (
          <p className="text-sm text-muted-foreground">Connect a wallet first.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="eyebrow mb-2">Signing account</div>
              <div className="font-mono break-all" data-testid="text-auth-wallet">{wallet}</div>
              <div className="mt-1 text-xs text-muted-foreground">{walletName}</div>
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Message only. No transaction, fee, token approval or spending permission.</li>
              <li>The challenge is single-use, expires quickly and is bound to Solana mainnet-beta.</li>
            </ul>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
              <Checkbox checked={networkOk} onCheckedChange={(v) => setNetworkOk(v === true)} data-testid="checkbox-network" />
              <span>I confirm my wallet is set to <strong>Solana mainnet-beta</strong>. Signing a message works on any network, so most wallets cannot prove this to us; the challenge is still bound to mainnet-beta and a reported mismatch is rejected.</span>
            </label>
            {authError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-auth-error">{authError}</p>}
            <Button
              className="w-full"
              disabled={!networkOk || busy}
              onClick={async () => { if (await authenticate()) setAuthOpen(false); }}
              data-testid="button-sign-message"
            >
              {busy ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{stageCopy[authStage]}</>) : (<><KeyRound className="mr-2 h-4 w-4" />Sign verification message</>)}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WalletButton() {
  const { wallet, isAuthed, isAdmin, setConnectOpen, setAuthOpen, signOut, disconnect } = useWallet();
  if (!wallet) {
    return (
      <Button size="sm" onClick={() => setConnectOpen(true)} data-testid="button-connect-wallet">
        <Wallet className="mr-2 h-4 w-4" /> Connect
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="font-mono" data-testid="button-wallet-menu">
          {isAuthed ? <ShieldCheck className="mr-2 h-4 w-4 text-chart-3" /> : <span className="mr-2 h-2 w-2 rounded-full bg-chart-5" />}
          {shortAddr(wallet)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {isAuthed ? 'Verified session' : 'Connected, not verified'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!isAuthed && (
          <DropdownMenuItem onClick={() => setAuthOpen(true)} data-testid="menu-verify"><KeyRound className="mr-2 h-4 w-4" />Verify ownership</DropdownMenuItem>
        )}
        <DropdownMenuItem asChild><Link href="/creator" data-testid="menu-creator"><LayoutDashboard className="mr-2 h-4 w-4" />Creator dashboard</Link></DropdownMenuItem>
        {isAdmin && <DropdownMenuItem asChild><Link href="/admin" data-testid="menu-admin"><ShieldCheck className="mr-2 h-4 w-4" />Admin</Link></DropdownMenuItem>}
        <DropdownMenuItem asChild>
          <a href={`https://solscan.io/account/${wallet}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />View on Solscan</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isAuthed && <DropdownMenuItem onClick={signOut} data-testid="menu-signout"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>}
        <DropdownMenuItem onClick={() => void disconnect()} data-testid="menu-disconnect"><Unplug className="mr-2 h-4 w-4" />Disconnect wallet</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PrivateGate({ children, title = 'Private workspace' }: { children: ReactNode; title?: string }) {
  const { wallet, isAuthed, sessionLoading, setConnectOpen, setAuthOpen } = useWallet();
  if (isAuthed) return <>{children}</>;
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-primary/40 bg-primary/10">
        <KeyRound className="h-6 w-6 text-accent-foreground" />
      </div>
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="mt-3 text-muted-foreground">
        {sessionLoading
          ? 'Checking session…'
          : !wallet
            ? 'Connect a Solana wallet, then sign a message to prove ownership. Connecting alone does not grant access.'
            : 'Your wallet is connected. Sign a verification message to open private drafts. No transaction or fee.'}
      </p>
      <div className="mt-6">
        {!wallet ? (
          <Button onClick={() => setConnectOpen(true)} data-testid="button-gate-connect"><Wallet className="mr-2 h-4 w-4" />Connect wallet</Button>
        ) : (
          <Button onClick={() => setAuthOpen(true)} data-testid="button-gate-verify"><KeyRound className="mr-2 h-4 w-4" />Verify ownership</Button>
        )}
      </div>
    </div>
  );
}
