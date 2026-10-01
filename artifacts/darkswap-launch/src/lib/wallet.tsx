import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetLaunchAuthSession,
  getGetLaunchAuthSessionQueryKey,
  useCreateLaunchAuthChallenge,
  useVerifyLaunchAuth,
  logoutLaunchAuth,
  type LaunchAuthSession,
} from '@workspace/api-client-react';
import { CSRF_HEADER, readError } from './api';

type PublicKeyLike = { toString(): string } | null | undefined;
type SolProvider = {
  isPhantom?: boolean;
  network?: unknown;
  isSolflare?: boolean;
  publicKey?: PublicKeyLike;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<unknown>;
  disconnect(): Promise<void>;
  signMessage(msg: Uint8Array, display?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  on?(ev: string, cb: (...a: unknown[]) => void): void;
  off?(ev: string, cb: (...a: unknown[]) => void): void;
  removeListener?(ev: string, cb: (...a: unknown[]) => void): void;
};
type WalletId = 'phantom' | 'solflare';
export type WalletOption = { id: WalletId; name: string; provider: SolProvider };

declare global {
  interface Window {
    phantom?: { solana?: SolProvider };
    solflare?: SolProvider;
    solana?: SolProvider;
  }
}

const ANON: LaunchAuthSession = { wallet: null, csrfToken: null, expiresAt: null, isAdmin: false };
const PRIVATE_PREFIXES = ['/api/launch/drafts', '/api/launch/creator', '/api/launch/admin'];

function detect(): WalletOption[] {
  if (typeof window === 'undefined') return [];
  const list: WalletOption[] = [];
  const ph = window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined);
  if (ph) list.push({ id: 'phantom', name: 'Phantom', provider: ph });
  if (window.solflare?.isSolflare) list.push({ id: 'solflare', name: 'Solflare', provider: window.solflare });
  return list;
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export type AuthStage = 'idle' | 'challenge' | 'signing' | 'verifying';

type Ctx = {
  options: WalletOption[];
  refreshOptions: () => void;
  wallet: string | null;
  walletName: string | null;
  connecting: boolean;
  connect: (id: WalletId) => Promise<void>;
  disconnect: () => Promise<void>;
  session: LaunchAuthSession | undefined;
  sessionLoading: boolean;
  isAuthed: boolean;
  isAdmin: boolean;
  csrf: string | null;
  authStage: AuthStage;
  authError: string | null;
  authenticate: () => Promise<boolean>;
  signOut: () => void;
  epoch: number;
  /** Bumps only when a previous wallet's private view must be wiped (switch, disconnect, sign-out, expiry). First connect does not bump. */
  privateEpoch: number;
  authOpen: boolean;
  setAuthOpen: (v: boolean) => void;
  connectOpen: boolean;
  setConnectOpen: (v: boolean) => void;
};

const WalletCtx = createContext<Ctx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const sessionKey = getGetLaunchAuthSessionQueryKey();
  const sessionQ = useGetLaunchAuthSession({ query: { queryKey: sessionKey, staleTime: 30_000, retry: 1 } });
  const session = sessionQ.data;
  const challenge = useCreateLaunchAuthChallenge();
  const verify = useVerifyLaunchAuth();

  const [options, setOptions] = useState<WalletOption[]>([]);
  const [active, setActive] = useState<WalletOption | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [authStage, setAuthStage] = useState<AuthStage>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [privateEpoch, setPrivateEpoch] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  const epochRef = useRef(0);
  const walletRef = useRef<string | null>(null);
  const sessionRef = useRef<LaunchAuthSession | undefined>(session);
  sessionRef.current = session;

  const clearPrivate = useCallback(() => {
    const predicate = (q: { queryKey: readonly unknown[] }) =>
      typeof q.queryKey[0] === 'string' && PRIVATE_PREFIXES.some((p) => (q.queryKey[0] as string).startsWith(p));
    // Cancel in-flight first so late responses can't repopulate, then drop cached data.
    void qc.cancelQueries({ predicate }, { silent: true });
    qc.removeQueries({ predicate });
  }, [qc]);
  const wipePrivate = useCallback(() => {
    clearPrivate();
    setPrivateEpoch((n) => n + 1);
  }, [clearPrivate]);

  const revoke = useCallback(
    (csrf: string | null) => {
      qc.setQueryData(sessionKey, ANON);
      logoutLaunchAuth({ headers: csrf ? { [CSRF_HEADER]: csrf } : {} })
        .catch(() => undefined)
        .finally(() => qc.invalidateQueries({ queryKey: sessionKey }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc],
  );

  const bump = useCallback(() => {
    epochRef.current += 1;
    setEpoch(epochRef.current);
    setAuthStage('idle');
    setAuthError(null);
  }, []);

  const handleAccount = useCallback(
    (next: string | null) => {
      if (next === walletRef.current) return;
      const prev = walletRef.current;
      bump();
      walletRef.current = next;
      setWallet(next);
      const s = sessionRef.current;
      // First connect (no previous wallet) keeps anonymous work; any switch/disconnect wipes.
      if (prev !== null || (s?.wallet && s.wallet !== next)) wipePrivate();
      else clearPrivate();
      if (s?.wallet && s.wallet !== next) revoke(s.csrfToken);
    },
    [bump, clearPrivate, wipePrivate, revoke],
  );

  const refreshOptions = useCallback(() => setOptions(detect()), []);

  useEffect(() => {
    refreshOptions();
    const t = window.setTimeout(refreshOptions, 600);
    window.addEventListener('load', refreshOptions);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('load', refreshOptions);
    };
  }, [refreshOptions]);

  // Silent reconnect only for already-trusted wallets. Never prompts.
  useEffect(() => {
    if (active || options.length === 0) return;
    const ph = options.find((o) => o.id === 'phantom');
    if (!ph) return;
    ph.provider
      .connect({ onlyIfTrusted: true })
      .then(() => {
        const pk = ph.provider.publicKey?.toString() ?? null;
        if (pk) {
          setActive(ph);
          handleAccount(pk);
        }
      })
      .catch(() => undefined);
  }, [options, active, handleAccount]);

  useEffect(() => {
    if (!active) return;
    const p = active.provider;
    const onAcc = (...a: unknown[]) => {
      // Explicit null means the wallet has no connected account: always clear.
      const next = a.length > 0 ? (a[0] ? (a[0] as { toString(): string }).toString() : null) : p.publicKey ? p.publicKey.toString() : null;
      handleAccount(next);
    };
    const onDisc = () => handleAccount(null);
    p.on?.('accountChanged', onAcc);
    p.on?.('disconnect', onDisc);
    return () => {
      const off = (p.off ?? p.removeListener)?.bind(p);
      off?.('accountChanged', onAcc);
      off?.('disconnect', onDisc);
    };
  }, [active, handleAccount]);

  const connect = useCallback(
    async (id: WalletId) => {
      const opt = detect().find((o) => o.id === id);
      if (!opt) throw new Error('Wallet not detected in this browser.');
      setConnecting(true);
      try {
        await opt.provider.connect();
        const pk = opt.provider.publicKey?.toString() ?? null;
        if (!pk) throw new Error('Wallet did not share a public address.');
        setActive(opt);
        handleAccount(pk);
      } finally {
        setConnecting(false);
      }
    },
    [handleAccount],
  );

  const disconnect = useCallback(async () => {
    const p = active?.provider;
    handleAccount(null);
    setActive(null);
    try {
      await p?.disconnect();
    } catch {
      /* wallet may already be disconnected */
    }
  }, [active, handleAccount]);

  const signOut = useCallback(() => {
    bump();
    wipePrivate();
    revoke(sessionRef.current?.csrfToken ?? null);
  }, [bump, wipePrivate, revoke]);

  // Session expiry: server session for our wallet vanished -> wipe private view.
  const hadSessionFor = useRef<string | null>(null);
  useEffect(() => {
    const sw = session?.wallet ?? null;
    if (hadSessionFor.current && sw !== hadSessionFor.current) wipePrivate();
    hadSessionFor.current = sw;
  }, [session?.wallet, wipePrivate]);

  // Any 401 on a private query or mutation: treat as expiry.
  useEffect(() => {
    const isPriv = (k: unknown) => typeof k === 'string' && PRIVATE_PREFIXES.some((p) => k.startsWith(p));
    const on401 = () => {
      qc.setQueryData(sessionKey, ANON);
      void qc.invalidateQueries({ queryKey: sessionKey });
    };
    const u1 = qc.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'error' && isPriv(e.query.queryKey[0]) && readError(e.action.error).status === 401) on401();
    });
    const u2 = qc.getMutationCache().subscribe((e) => {
      if (e.type === 'updated' && e.action.type === 'error' && readError(e.action.error).status === 401) on401();
    });
    return () => { u1(); u2(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc]);

  const challengeRef = useRef(challenge.mutateAsync);
  challengeRef.current = challenge.mutateAsync;
  const verifyRef = useRef(verify.mutateAsync);
  verifyRef.current = verify.mutateAsync;

  const authenticate = useCallback(async () => {
    const e = epochRef.current;
    const w = walletRef.current;
    const p = active?.provider;
    setAuthError(null);
    if (!w || !p) {
      setAuthError('Connect a wallet first.');
      return false;
    }
    const stale = () => e !== epochRef.current || walletRef.current !== w;
    // signMessage is network-independent; we can only reject a mismatch the provider explicitly exposes.
    const net = typeof p.network === 'string' ? p.network.toLowerCase() : null;
    if (net && !/mainnet/.test(net)) {
      setAuthError(`Your wallet reports network "${p.network}". Switch to Solana mainnet-beta and try again.`);
      return false;
    }
    try {
      setAuthStage('challenge');
      const ch = await challengeRef.current({ data: { wallet: w, network: 'mainnet-beta' } });
      if (stale()) return false;
      setAuthStage('signing');
      const res = await p.signMessage(new TextEncoder().encode(ch.message), 'utf8');
      if (stale()) return false;
      const sig = res instanceof Uint8Array ? res : res.signature;
      if (!sig || sig.length !== 64) throw new Error('Wallet returned an invalid signature.');
      setAuthStage('verifying');
      const s = await verifyRef.current({ data: { id: ch.id, signature: toBase64(sig) } });
      if (stale() || s.wallet !== w) {
        revoke(s.csrfToken);
        return false;
      }
      clearPrivate();
      qc.setQueryData(sessionKey, { wallet: s.wallet, csrfToken: s.csrfToken, expiresAt: s.expiresAt, isAdmin: s.isAdmin });
      setAuthStage('idle');
      return true;
    } catch (err) {
      if (stale()) return false;
      setAuthStage('idle');
      const anyErr = err as { code?: number; message?: string };
      if (anyErr?.code === 4001 || /reject|declin|cancel/i.test(anyErr?.message ?? '')) {
        setAuthError('Signature request declined in your wallet. Nothing was signed.');
      } else {
        const pr = readError(err, 'Authentication failed.');
        setAuthError(
          pr.status === 400 || pr.status === 401 || pr.status === 403
            ? `${pr.message} Make sure your wallet is on Solana mainnet-beta and the signing account matches ${w.slice(0, 4)}…${w.slice(-4)}.`
            : pr.message,
        );
      }
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, clearPrivate, qc, revoke]);

  const isAuthed = !!wallet && !!session?.wallet && session.wallet === wallet;

  const value = useMemo<Ctx>(
    () => ({
      options,
      refreshOptions,
      wallet,
      walletName: active?.name ?? null,
      connecting,
      connect,
      disconnect,
      session,
      sessionLoading: sessionQ.isLoading,
      isAuthed,
      isAdmin: isAuthed && !!session?.isAdmin,
      csrf: isAuthed ? session?.csrfToken ?? null : null,
      authStage,
      authError,
      authenticate,
      signOut,
      epoch,
      privateEpoch,
      authOpen,
      setAuthOpen,
      connectOpen,
      setConnectOpen,
    }),
    [options, refreshOptions, wallet, active, connecting, connect, disconnect, session, sessionQ.isLoading, isAuthed, authStage, authError, authenticate, signOut, epoch, privateEpoch, authOpen, connectOpen],
  );

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const c = useContext(WalletCtx);
  if (!c) throw new Error('useWallet outside WalletProvider');
  return c;
}

/** Request options carrying the CSRF header for private mutations. */
export function useCsrfRequest() {
  const { csrf } = useWallet();
  return { headers: csrf ? { [CSRF_HEADER]: csrf } : {} } as RequestInit;
}
