import { Link } from 'wouter';
import { TestnetWarning } from './testnet-warning';
import { WhatStaysPublic } from './what-stays-public';
import { poolThemeStyle } from './theme';

// No PoolProvider, keys, balances, wallet SDK, or transaction UI during SSR.
export function PoolPublicGuide({ explanation = false }: { explanation?: boolean }) {
  return <main className="pool-scope dark min-h-[70vh] bg-background px-4 py-8 font-sans text-foreground" style={poolThemeStyle}>
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <TestnetWarning />
      {explanation ? <WhatStaysPublic /> : <>
        <h1 className="text-2xl font-extrabold">ZK pool</h1>
        <p className="text-sm text-muted-foreground">No network is connected yet. This is DarkSwap's own ZK tier, not the dark pool on NEAR. It is built and tested on local chains, not deployed on any public network.</p>
        <p className="text-sm text-muted-foreground">Experimental shielded pool. Deposits and withdrawals remain public. Amounts, timing and a small pool can make activity easy to match. No anonymity guarantee.</p>
        <Link href="/pool/what-stays-public" className="text-ring underline">What stays public: safety and privacy limits</Link>
        <p className="text-sm text-muted-foreground">Enable JavaScript to view the development interface. Private keys, balances and activity stay in the client; they are not included in this public page.</p>
      </>}
    </div>
  </main>;
}