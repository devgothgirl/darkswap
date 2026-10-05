// Pool session state: the selected chain, its verified public record, the
// connected wallet and the shielded keys. Keys live in memory only and lock
// after 30 idle minutes; nothing here is written to storage.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { initPoseidon, KeySession, unspent, type Keys, type Note } from '@darkswap/pool-client';
import { getChains, type PoolChainInfo } from './api';
import { loadPool, notesFor, type Asset, type LoadedPool } from './chain';
import type { ConnectedWallet } from './wallets';

type PoolContext = {
  chains: PoolChainInfo[];
  chainsError: string | null;
  chain: PoolChainInfo | null;
  setChainId(id: string): void;
  pool: LoadedPool | null;
  poolLoading: boolean;
  poolError: string | null;
  refresh(): Promise<void>;
  wallet: ConnectedWallet | null;
  setWallet(w: ConnectedWallet | null): void;
  keys: Keys | null;
  unlock(secret: Uint8Array): void;
  lock(): void;
  words(): string;
  notes: Note[];
  balance(asset: Asset): { total: bigint; notes: Note[] };
};

const Ctx = createContext<PoolContext | null>(null);
const IDLE_MS = 30 * 60_000;

export function PoolProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const poseidon = useQuery({ queryKey: ['pool', 'poseidon'], queryFn: async () => { await initPoseidon(); return true; }, staleTime: Infinity, retry: false });
  const chainsQuery = useQuery({ queryKey: ['pool', 'chains'], queryFn: getChains, staleTime: 60_000 });
  const chains = chainsQuery.data?.chains ?? [];
  const [chainId, setChainId] = useState<string | null>(null);
  const chain = chains.find((c) => c.id === chainId) ?? chains.find((c) => c.live) ?? chains[0] ?? null;

  const poolQuery = useQuery({
    queryKey: ['pool', 'state', chain?.id],
    enabled: !!chain?.live && !!poseidon.data,
    refetchInterval: 30_000,
    queryFn: () => loadPool(chain!, queryClient.getQueryData<LoadedPool>(['pool', 'state', chain!.id])),
  });

  const [keys, setKeys] = useState<Keys | null>(null);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const session = useRef<KeySession | null>(null);
  if (!session.current) session.current = new KeySession({ idleMs: IDLE_MS, onLock: () => setKeys(null) });

  useEffect(() => {
    const touch = () => session.current?.keys && session.current.touch();
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      session.current?.lock(false);
    };
  }, []);

  const unlock = useCallback((secret: Uint8Array) => setKeys(session.current!.unlock(secret)), []);
  const lock = useCallback(() => session.current!.lock(), []);
  const words = useCallback(() => session.current!.words(), []);
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['pool', 'state', chain?.id] });
  }, [queryClient, chain?.id]);

  const pool = poolQuery.data && poolQuery.data.info.id === chain?.id ? poolQuery.data : null;
  const notes = useMemo(() => (pool && keys ? notesFor(pool, keys) : []), [pool, keys]);
  const balance = useCallback((asset: Asset) => {
    const list = pool ? unspent(notes, pool.spent, asset.id) : [];
    return { total: list.reduce((s, n) => s + n.amount, 0n), notes: list };
  }, [notes, pool]);

  const value: PoolContext = {
    chains,
    chainsError: chainsQuery.error ? (chainsQuery.error as Error).message : null,
    chain,
    setChainId: (id) => {
      setChainId(id);
      if (wallet && chains.find((c) => c.id === id)?.kind !== wallet.kind) setWallet(null);
    },
    pool,
    poolLoading: poolQuery.isLoading,
    poolError: poolQuery.error ? (poolQuery.error as Error).message : null,
    refresh,
    wallet, setWallet,
    keys, unlock, lock, words,
    notes, balance,
  };
  // Keys, addresses and the tree all hash with Poseidon, which loads once.
  if (poseidon.error) return <p className="text-sm text-destructive-foreground">The pool's hashing code did not load. Reload the page.</p>;
  if (!poseidon.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePool(): PoolContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePool outside PoolProvider');
  return ctx;
}
