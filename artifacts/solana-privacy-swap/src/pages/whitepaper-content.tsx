import type { ReactNode } from 'react';

/** Plain-language edition of the DarkSwap whitepaper (v0.2, Oct 2026).
 *  Every section keeps the source paper's status tag. Items the owner has not
 *  yet confirmed are listed in `underReview` and deliberately left out. */

export type Status = 'live' | 'testnet' | 'scheduled' | 'proposed';

export const statusMeaning: Record<Status, string> = {
  live: 'Deployed and used with real funds.',
  testnet: 'Deployed on a test network and exercised.',
  scheduled: 'Designed, with an owner and a target date. Can still change.',
  proposed: 'Designed, with no owner or date yet. Likely to change.',
};

export const paperMeta = {
  title: 'The DarkSwap whitepaper, in plain language',
  basedOn: 'Based on the DarkSwap whitepaper, v0.2, October 2026.',
  oneLine: 'What DarkSwap runs today, what the Dark Pool is meant to do, how $DARK holder rewards would work, and where the limits are.',
};

export interface Section {
  id: string;
  num: string;
  title: string;
  status: Status | Status[];
  body: ReactNode;
}

export const underReview = [
  'Where Dark Pool fees go after they leave the pool. The rate is settled (0.5% on shielding and unshielding, set for the test networks) and the fees are swept to one fixed recipient; what that recipient then does with them is not final.',
  'The history of holder distributions. The draft and the live site quote different round and wallet counts; the figures are being reconciled against on-chain records.',
  'How much of the pool is already built. The draft was written before the current test deployments; the implementation status section is being rewritten.',
];

export const constants: [string, string, string][] = [
  ['Pool fee', '0.5% (50 bps), the same rate on shielding and unshielding, set for the test networks; contract cap 1%', 'Scheduled'],
  ['Keeper fee cap', '1% (100 bps), hard maximum per sweep', 'Scheduled'],
  ['Pool assets at launch', 'ETH, USDC, USDT on Base', 'Scheduled'],
  ['$DARK reward minimum', '100,000 $DARK at every snapshot', 'Proposed'],
  ['Snapshots per period', '4, at published block heights', 'Proposed'],
  ['Minimum ZEC payout', '0.001 ZEC; smaller amounts roll forward', 'Proposed'],
  ['Exit timing delay', '2 to 24 hours, chosen on your device', 'Proposed'],
  ['Guardian', '2-of-3 multisig; can pause, cannot spend', 'Proposed'],
  ['Note tree', 'Depth 24, 64 recent roots accepted', 'Scheduled'],
];

export const sections: Section[] = [
  {
    id: 'today', num: '01', title: 'What DarkSwap runs today', status: 'live',
    body: <>
      <p>Two private swap routes from Solana to other chains are live on darkswap.app. One of them, Privacy swap, is built on the NEAR Intents 1Click API and requests basic confidential handling for quotes and orders. That is not the zero-knowledge shielding the Dark Pool is designed to provide; it does not make a swap anonymous. You get a quote, review the order, and send the deposit yourself from your own wallet. There is no wallet connection and no account for guest orders. Holder rewards have been paid in wNEAR, sent directly to eligible $DARK wallets with no claim step.</p>
      <p>Everything else in this paper is about what comes next. None of it changes how the live routes work.</p>
    </>,
  },
  {
    id: 'pool', num: '02', title: 'What the Dark Pool is', status: ['scheduled', 'proposed'],
    body: <>
      <p>The Dark Pool is a shared vault on Base. Once your funds are inside, you can move them to other people in the pool without the sender, the recipient or the amount appearing on-chain. Zero-knowledge proofs let the contract check that a transfer is valid without seeing who made it.</p>
      <p>Two things stay public: the moment funds enter the pool and the moment they leave. Privacy applies to what happens in between. The pool holds ETH, USDC and USDT, and it does not swap one asset for another inside.</p>
      <p>Your balance is held as “notes”, in the same model Zcash uses. Spending a note consumes it and creates new ones; the proof covers two notes in and two notes out at a time. Fees never sit inside a note balance: they leave the pool to a separate recipient, so a note is worth what was put into it and nothing a later depositor pays changes that.</p>
      <div className="docs-caution">The contracts are planned to be immutable. A bug cannot be patched in place; the only tools are pausing new deposits and migrating to a new pool.</div>
    </>,
  },
  {
    id: 'funding', num: '03', title: 'Getting in from Solana', status: 'scheduled',
    body: <>
      <p>You never need to hold ETH. Each user gets a personal “inbox” address on Base, derived from a signature your Solana or EVM wallet makes once. You send funds to that inbox through a cross-chain route, and a service called the keeper moves them from the inbox into the pool.</p>
      <ol className="docs-flow">
        <li><span>01</span><div><strong>Sign once</strong><p>Your wallet signature produces your pool identity: an owner key, a spending key and a viewing key. The signature never leaves your device.</p></div></li>
        <li><span>02</span><div><strong>Send to your inbox</strong><p>A cross-chain route delivers the asset to your inbox address on Base. The route is run by NEAR Intents 1Click and settles at its own pace.</p></div></li>
        <li><span>03</span><div><strong>The keeper sweeps</strong><p>The keeper moves each asset from the inbox into the pool once, deducting a fee that the contract caps at 1%. A guard can refuse a sweep that fails screening.</p></div></li>
        <li><span>04</span><div><strong>Recovery stays yours</strong><p>If a route fails or a sweep is refused, the funds sit in your inbox. Your owner signature can withdraw them without anyone at DarkSwap being involved.</p></div></li>
      </ol>
      <p>Contract wallets such as multisigs cannot own notes, because the proof requires a single ordinary wallet signature.</p>
    </>,
  },
  {
    id: 'fees', num: '04', title: 'Fees', status: 'proposed',
    body: <>
      <p>One rate covers both directions. The pool fee is 0.5% (50 bps), the rate set for the test-network deployments, and the same setting applies to money going in and money coming out: on the way in you pay it on top of the amount you shield, and on the way out it is taken from the payout. A private transfer between two people inside the pool pays no pool fee at all — the fee amount itself would reveal which asset moved — only the network cost of the transaction. The contract will not accept a rate above 1%, and fees round upward, so no entry or exit pays nothing.</p>
      <p>Pool fees are kept apart from the money in the pool. They are not added to anyone's balance and they do not make an existing note worth more; they are swept out to a single fee recipient that is fixed when the pool is deployed and cannot be changed afterwards. What that recipient then does with them is one of the items still under review (see the box at the top of this page).</p>
      <p>Sweeps from your inbox pay the keeper at most 1%; that is a separate fee from the pool fee above. Cross-chain routes charge their own provider costs on top; those are set by the provider, not by DarkSwap. No fee figure in this section is final until the contracts are deployed.</p>
    </>,
  },
  {
    id: 'rewards', num: '05', title: '$DARK holder rewards', status: ['live', 'scheduled', 'proposed'],
    body: <>
      <p>The reward program and the pool are separate. They have different sources of money, different beneficiaries and never share keys or balances.</p>
      <p>$DARK trades on StonkFun with a 1% creator fee, paid in wNEAR. That fee is the only money in the rewards program. Pool fees, keeper fees and swap-route revenue are not part of it.</p>
      <p>Each period, the amount available to distribute is what was actually received, minus conversion costs, network fees and a published reserve for failed payments and the next period's gas. If that leaves nothing, the period pays nothing. The split is half converted to native ZEC and paid to eligible holders, and half converted to ZEC and compounded in the creator wallet. (The draft describes the second half as a $DARK buyback and burn; the owner has since confirmed the compounding model, and that is what the rewards console reflects.)</p>
      <ul className="docs-checklist">
        <li>Eligible wallets hold at least 100,000 $DARK at every snapshot of the period. Four snapshots are taken at published block heights and the list is published with each distribution.</li>
        <li>Your share is weighted by the lowest balance you held across those snapshots, so moving tokens between snapshots lowers it.</li>
        <li>Funds held as notes inside the Dark Pool do not earn ZEC rewards.</li>
        <li>To receive ZEC you register a Zcash Unified Address once. It must include a shielded (Orchard) receiver; transparent-only addresses are rejected.</li>
        <li>Payouts under 0.001 ZEC roll to the next period. A failed send is retried for 48 hours, then rolled. An eligible wallet with no registered address rolls for two periods, then forfeits that share.</li>
      </ul>
      <p>wNEAR has been paid. No ZEC has been paid yet. Past distributions do not guarantee future ones, and the optional email points on darkswap.app are a separate non-cash ledger outside both programs.</p>
    </>,
  },
  {
    id: 'zcash', num: '06', title: 'How ZEC payouts would be sent', status: 'scheduled',
    body: <>
      <p>DarkSwap would run its own Zcash node and a payment service. Converted ZEC arrives at a transparent address, is moved into a shielded Orchard account, and is paid out to registered holders from there. Every intended payout is reconciled by hand against what the chain shows before a period is closed.</p>
      <p>The wallet's full viewing key stays with the team. Selective disclosure to third parties (ZIP 311) is still a draft standard and is not implemented.</p>
    </>,
  },
  {
    id: 'trust', num: '07', title: 'Who you are trusting', status: 'proposed',
    body: <>
      <p>Several parties operate the system, and none of them can spend your notes.</p>
      <ul className="docs-checklist">
        <li><strong>Guardian</strong> — a 2-of-3 multisig that can pause new deposits in an emergency. It cannot touch notes already in the pool.</li>
        <li><strong>Keeper</strong> — moves funds from inboxes to the pool and takes a capped fee. If it stops, your inbox funds stay recoverable with your own signature.</li>
        <li><strong>Guard</strong> — screens incoming fundings and can refuse a sweep. A refusal leaves funds in your inbox, never in limbo.</li>
        <li><strong>Routing provider</strong> — a third party that carries funds between chains. Its availability and terms are outside DarkSwap's control.</li>
        <li><strong>Base</strong> — the chain itself. Its sequencer can delay or censor transactions.</li>
      </ul>
      <p>What is visible on-chain: deposits, inbox sweeps and exits, including amounts. What is not: the contents of notes, who holds them, and transfers between them. Two deposits by the same owner are linkable, because they sweep to the same owner address.</p>
    </>,
  },
  {
    id: 'limits', num: '08', title: 'What privacy you get, and what you do not', status: 'proposed',
    body: <>
      <p>The pool hides activity inside it. It does not hide the edges. Someone watching the chain can see that you entered with an amount and that someone exited with an amount; the question is whether they can connect the two.</p>
      <p>Two design choices make that harder. Deposits and exits use “round lots”, fixed sizes so an unusual amount does not stand out. Exits can be delayed by 2 to 24 hours, chosen on your device, so timing does not stand out either.</p>
      <div className="docs-caution">Early on, the pool will be small. With few other users, amount and timing can still be correlated even with round lots and delays. Privacy improves as the pool grows; it is not a property of the first week.</div>
      <p>No route or pool makes activity invisible. The paper does not claim otherwise, and neither should anyone describing it.</p>
    </>,
  },
  {
    id: 'comparison', num: '09', title: 'How it compares', status: 'proposed',
    body: <>
      <p>Other EVM privacy pools exist. What DarkSwap adds is the funding path from Solana without holding ETH, a multi-asset pool rather than a single token, and a holder reward program that is funded and operated separately from the pool. The design has not been independently audited, and the paper says so.</p>
    </>,
  },
  {
    id: 'roadmap', num: '10', title: 'Roadmap', status: 'scheduled',
    body: <>
      <p>The order of work is fixed: contracts and circuit on a test network with a mock routing provider, a test Zcash payout wallet, an independent audit, then a mainnet launch with a cap on deposits for the first month. The current targets are audit completion in early December 2026 and a capped mainnet launch the following week. Targets move; the order does not.</p>
      <p>NEAR Intents 1Click, the routing provider for the funding flow, has no test network, so no pre-mainnet test can exercise a real cross-chain settlement. The first real settlement happens on Base mainnet, at small amounts, with the team's own funds.</p>
    </>,
  },
];
