import { Link } from 'wouter';

const PUBLIC = [
  ['Deposits', 'The wallet that shields, the asset, the amount and the time are visible to anyone.'],
  ['Withdrawals', 'The destination address, the asset, the amount received and the time are visible to anyone.'],
  ['Fees', 'The protocol fee on each deposit and withdrawal, and every sweep to the fee recipient, are on chain.'],
  ['That the pool was used', 'Every pool transaction is a public transaction to the pool, with its time and network fee.'],
  ['A withdrawal you submit yourself', 'If you withdraw from your own wallet instead of through the relayer, that wallet is shown as the sender.'],
] as const;

const NOT_PUBLIC = [
  ['Who made a private send', 'The relayer submits it, so no wallet of yours signs or pays for it.'],
  ['Who holds what', 'Balances are notes that only your keys can read. The chain sees commitments, not owners or amounts.'],
  ['What a private send moved', 'The asset and the amount of a send between shielded addresses are not revealed.'],
  ['Links between a deposit and later actions', 'A proof shows that some unspent note in the pool is being spent, not which one.'],
] as const;

export function WhatStaysPublic() {
  return (
    <article className="flex flex-col gap-5" data-testid="page-what-stays-public">
      <div className="flex flex-col gap-1">
        <Link href="/pool" className="text-sm text-ring underline-offset-2 hover:underline">← Back to the pool</Link>
        <h1 className="text-2xl font-extrabold">What stays public</h1>
        <p className="text-sm text-muted-foreground">
          The shielded pool hides links between actions. It does not hide that you entered or left it.
        </p>
      </div>
      <List title="Public, on chain" items={PUBLIC} />
      <List title="Not revealed by the pool" items={NOT_PUBLIC} />
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-bold">What weakens it</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
          <li>Withdrawing the exact amount you deposited, soon after, makes the two easy to match.</li>
          <li>Withdrawing to the wallet you deposited from links them directly.</li>
          <li>A small pool with few users gives little cover. This testnet pool is small.</li>
          <li>Your network connection, browser and wallet extension are outside what the pool covers.</li>
        </ul>
      </section>
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-bold">What DarkSwap sees</h2>
        <p className="text-muted-foreground">
          Your keys are made and kept in your browser. DarkSwap's server serves the pool's public record, which your browser
          checks against the chain, and relays proofs it cannot read. The relayer does not record IP addresses, browsers or wallet addresses.
        </p>
      </section>
    </article>
  );
}

function List({ title, items }: { title: string; items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <dl className="flex flex-col divide-y rounded-xl border bg-card">
        {items.map(([term, detail]) => (
          <div key={term} className="flex flex-col gap-0.5 p-4">
            <dt className="text-sm font-semibold">{term}</dt>
            <dd className="text-sm text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
