import type { ReactNode } from 'react';
import WhitepaperArchitecture from './whitepaper-architecture';

/** DarkSwap whitepaper v0.4 (Oct 6, 2026). Supersedes v0.3.
 *  Sections that describe a product carry status tags. */

export type Status = 'live' | 'built' | 'scheduled' | 'proposed';

export const statusMeaning: Record<Status, string> = {
  live: 'Running today with real funds.',
  built: 'Code exists and runs end to end on local chains. Not on any public network.',
  scheduled: 'Designed, with an owner and a target date. Can still change.',
  proposed: 'Decided in direction, not yet built or dated. Likely to change in detail.',
};

export const paperMeta = {
  title: 'DarkSwap Whitepaper v0.4',
  version: 'Version 0.4 · October 6, 2026 · Supersedes v0.3.',
  oneLine: 'A privacy terminal on NEAR Intents: what runs today, the dark pool on NEAR Confidential Intents that comes next, our own zero-knowledge pools after that, how $DARK fits in, and where the limits are.',
};

export interface Section {
  id: string;
  num: string;
  title: string;
  status?: Status | Status[];
  body: ReactNode;
}

export const openDecisions = [
  'Who owns the liquidity that ZK pool fees add to the ZEC-DARK pool: a permanently locked position, or a DarkSwap-held position.',
  "Terms of DarkSwap's NEAR Intents partner agreement, including fees for the dark pool on NEAR.",
  'Multisig signers, the Solana upgrade authority and the audit firm for the ZK tier.',
  'The ZK pool fee rate at launch. Tests use 0.5%; the contract allows anything up to 1%.',
  'Whether the Ethereum and Base pools deploy with the sanctions-list check on depositors switched on.',
  'Two circuit changes that must be settled before the setup ceremony, and the licence the source is published under.',
  'The bridge that carries Ethereum and Base pool fees to Solana.',
];

export const changesInV04 = [
  'Corrected the shield description. Deposits are public and tied to the wallet that paid; the one-time key only stops notes being linked to each other by key.',
  'The ZK pool fee is a setting, not a fixed number. The admin can change it up to the 1% cap. Admin powers now list this and admin handover.',
  'The Solana upgrade authority is now stated wherever the paper says withdrawals cannot be paused.',
  'The ZK fee destination is marked proposed everywhere, and the roadmap puts the fee recipient contracts before the pools, because the recipient is fixed at deployment.',
  'Named the proof system, and added note tree capacity, costs, the relayer and how keys are held.',
  'Added a $DARK token section with on-chain references, and said which wNEAR and which ZEC.',
  'Added an architecture diagram and named the sponsored privacy swap by Houdini as the second route.',
  'Comparison: sources added, plus a protocol fee row and an "own pool deployed" row.',
  'Risks: eight added.',
];

export const constants: [string, string, Status][] = [
  ['Privacy swap partner fee', '0.40% of the input; 0.20% to DarkSwap, 0.20% to NEAR Intents 1Click (standard partner schedule)', 'live'],
  ['$DARK creator fee', '1% on $DARK trades, received in wNEAR; half to holder payouts in wNEAR, half buys ZEC tokens on Solana for the treasury', 'live'],
  ['$DARK supply', '999,851,915.57 on October 6, 2026; no mint authority, no freeze authority', 'live'],
  ['Holder reward minimum', '100,000 $DARK in a fresh snapshot at each 6 a.m. / 6 p.m. Pacific payout', 'live'],
  ['ZEC-DARK pool fee', '1% base fee (dynamic fees enabled); 10% of LP fees configured to compound into the pool', 'live'],
  ['ZK pool protocol fee', '0.5% on shield and on unshield in tests, none on private sends; the admin can change it; contract cap 1%', 'built'],
  ['ZK pool fee destination', 'One recipient fixed at deployment; planned use is ZEC and $DARK added to ZEC-DARK liquidity', 'proposed'],
  ['ZK proof system', 'Groth16 on BN254; circom circuit; 8 public inputs', 'built'],
  ['ZK note tree', 'Poseidon, depth 26; 67,108,864 slots per pool, two used per shield or spend; last 1,000 roots accepted on EVM, last 256 on Solana', 'built'],
  ['ZK transaction shape', 'Up to 2 notes in, 2 out, one asset per transaction', 'built'],
  ['Proving time', '2 to 5 seconds per transaction in tests on a 2-core machine', 'built'],
  ['ZK gas on Ethereum and Base', 'About 1.2 to 1.4 million per action, measured on a local chain', 'built'],
  ['Dark pool on NEAR target', 'Late October 2026, subject to NEAR enabling access', 'scheduled'],
];

export const whitepaperSections: Section[] = [
  {
    id: 'summary', num: '01', title: 'Summary', status: 'live',
    body: <>
      <p>DarkSwap is a privacy terminal built on NEAR Intents. It does three things, at three levels of maturity.</p>
      <ul className="docs-checklist">
        <li><strong>Private swaps, live.</strong> Swaps from Solana to other chains with confidential routing. Live routes start on Solana only. No account, and nothing moves until you send the deposit yourself from your own wallet.</li>
        <li><strong>The dark pool on NEAR, next.</strong> A hidden balance you can deposit into from a supported chain, hold, swap inside and withdraw from, built on NEAR Confidential Intents. Target: late October 2026, subject to NEAR enabling access for DarkSwap. It is a target, not a commitment.</li>
        <li><strong>Our own ZK pools, later.</strong> Zero-knowledge shielded pools for Solana, Ethereum and Base. Built and tested on local chains, shown on the site as a local-development preview, and held back until public testnets, a production setup ceremony and an independent audit.</li>
      </ul>
      <p>$DARK, the project token, is paired with NEAR and pays its holders in wNEAR from the creator fee on $DARK trades. A ZEC-DARK liquidity pool is live on Meteora, and the plan is to add fees from our own ZK pools to it.</p>
      <p>This paper separates what runs today from what is planned. Sections that describe a product carry a status tag; read the tag before the text.</p>
    </>,
  },
  {
    id: 'problem', num: '02', title: 'The problem',
    body: <>
      <p>A wallet is a public record. Every balance and every payment on Solana and EVM chains is open to anyone, permanently. One labelled address, from an exchange withdrawal, a payment or a public post, can tie the rest of a wallet's history to a person.</p>
      <p>Today's fixes each leave a gap.</p>
      <table className="wp-table">
        <thead><tr><th scope="col">Option</th><th scope="col">Gap</th></tr></thead>
        <tbody>
          <tr><th scope="row">CEX based pools</th><td>A secret to keep for every deposit, and a public link at both ends.</td></tr>
          <tr><th scope="row">Zcash</th><td>The longest-running shielded design, but it needs its own wallet and an exit back to where the liquidity is.</td></tr>
          <tr><th scope="row">A one-off private swap</th><td>Hides the processing; the deposit and the destination still sit side by side.</td></tr>
        </tbody>
      </table>
      <p>DarkSwap's answer is a hidden balance you can hold, swap and withdraw from, on a network that already reaches the chains people use, with the trust model stated plainly at each tier.</p>
    </>,
  },
  {
    id: 'architecture', num: '03', title: 'Architecture', status: ['live', 'scheduled', 'built'],
    body: <>
      <p>For the live swap routes, DarkSwap is a terminal, not a custodian. It prepares quotes and orders, shows you exactly what to send, and tracks the result. The swap itself runs on infrastructure DarkSwap does not operate: NEAR Intents for Privacy swap and Houdini for the sponsored privacy swap.</p>
      <p>That is not the whole picture. DarkSwap runs its own servers for quotes and order records, holds the treasury and sends the $DARK holder payouts. For the ZK tier it also runs the relayer, the indexer and the admin key, and it holds the Solana upgrade authority until that is removed or placed behind a multisig. The Who you trust section sets out who you trust at each tier.</p>
      <WhitepaperArchitecture />
      <table className="wp-table">
        <thead><tr><th scope="col">Layer</th><th scope="col">What it does</th><th scope="col">Status</th></tr></thead>
        <tbody>
          <tr><th scope="row">Terminal (darkswap.app)</th><td>Quotes, order review, deposit instructions, order tracking, the pool interface</td><td><span className="wp-tag wp-tag-live">live</span></td></tr>
          <tr><th scope="row">NEAR Intents 1Click</th><td>Cross-chain routing and settlement for Privacy swap, with NEAR's basic confidential handling requested</td><td><span className="wp-tag wp-tag-live">live</span></td></tr>
          <tr><th scope="row">Sponsored privacy swap by Houdini</th><td>The second private route, with its own quotes, fees and terms</td><td><span className="wp-tag wp-tag-live">live</span></td></tr>
          <tr><th scope="row">NEAR Confidential Intents</th><td>Confidential balances on NEAR's private shard for the dark pool</td><td><span className="wp-tag wp-tag-scheduled">scheduled</span></td></tr>
          <tr><th scope="row">DarkSwap ZK pools</th><td>Shielded note pools on Solana, Ethereum and Base, with a DarkSwap relayer and indexer</td><td><span className="wp-tag wp-tag-built">built</span></td></tr>
        </tbody>
      </table>
      <p>NEAR says Intents coordinates execution across more than 35 chains. Which assets can be swapped varies by route; a supported network does not mean every asset pair has a live route.</p>
      <p>Privacy swap accepts Solana as the source and can deliver to Solana, NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon and BNB Chain. Each pair still needs a live quote.</p>
    </>,
  },
  {
    id: 'swaps', num: '04', title: 'Private swaps today', status: 'live',
    body: <>
      <p>Two private routes from Solana to other chains are open on darkswap.app.</p>
      <ol className="docs-flow">
        <li><span>01</span><div><strong>Quote</strong><p>Choose what you send and where it should land. The terminal requests a live quote, including every fee.</p></div></li>
        <li><span>02</span><div><strong>Review</strong><p>Check the estimate, the fee and the destination address before anything happens. Creating an order moves no funds.</p></div></li>
        <li><span>03</span><div><strong>Deposit yourself</strong><p>Send the exact amount from your own wallet to the order's deposit address. DarkSwap never signs a transaction for you and never holds your funds.</p></div></li>
        <li><span>04</span><div><strong>Track</strong><p>Follow the order until it settles or is refunded by the provider.</p></div></li>
      </ol>
      <p><strong>Privacy swap</strong> runs on the NEAR Intents 1Click API and requests NEAR's basic confidential handling for the order. NEAR also offers an advanced setting, which DarkSwap does not use. NEAR's documentation says that for Confidential Intents, on-chain deposits and withdrawals cannot be tracked to each other. Your Solana deposit is still public: its amount and the wallet it came from. The delivery on the destination chain is visible too.</p>
      <p>Since October 4, 2026, Privacy swap quotes include a 0.40% partner fee, charged from the input and shown in every quote. Under NEAR's standard partner schedule, 0.20% goes to DarkSwap and 0.20% to NEAR Intents 1Click. It is earned only on completed swaps. DarkSwap's half is paid to its NEAR account, darkswapapp.near.</p>
      <p><strong>Sponsored privacy swap by Houdini</strong> is the second private route, with its own fees and terms shown in the quote.</p>
      <div className="docs-caution">A private route keeps more of the swap off the public record. It does not make a swap anonymous, and timing and amounts at either end can still be matched.</div>
    </>,
  },
  {
    id: 'darkpool', num: '05', title: 'The dark pool on NEAR', status: 'scheduled',
    body: <>
      <div className="docs-caution"><strong>This is the intended design, not a live product.</strong> DarkSwap does not have access to this integration yet; it is being arranged with the NEAR Intents team. It also depends on DarkSwap completing the integration.</div>
      <p>Confidential Intents is a private transaction layer on NEAR Intents. It already powers Confidential Mode on near.com and, according to Infinex's launch report, confidential accounts on Infinex since July 2026. Balances live on a NEAR private shard, a separate execution environment run by permissioned validators and connected to NEAR mainnet by a bridge. The private shard has no public RPC, API or block explorer.</p>
      <ol className="docs-flow">
        <li><span>01</span><div><strong>Deposit from a supported chain</strong><p>Send SOL, ETH, USDC or another supported asset from the wallet you already use. The deposit is public, and NEAR Intents screens funds as they enter.</p></div></li>
        <li><span>02</span><div><strong>Hold in the dark</strong><p>The funds become a confidential balance on NEAR Intents. The public cannot see the balance or what you do with it.</p></div></li>
        <li><span>03</span><div><strong>Swap privately</strong><p>Swaps from the confidential balance execute on the private shard. Amounts, routes and pairs are not recorded on the public chain.</p></div></li>
        <li><span>04</span><div><strong>Withdraw to a supported chain</strong><p>The withdrawal is public. NEAR's documentation says it cannot be tracked back to your deposit on-chain; a matching amount or timing can still give the link away.</p></div></li>
      </ol>
      <p>Swaps and withdrawals from a confidential balance are authorised by signed intents: the terminal asks NEAR Intents to generate the exact intent, your own wallet signs it, and the signed intent is submitted. DarkSwap does not hold your keys or your balance; the balance lives on NEAR Intents.</p>
      <p>NEAR describes this as encryption and restricted validator access rather than zero-knowledge proofs: no proof is generated on your device, and the trust model is trust-minimised rather than trustless. NEAR also plans user-held view keys for selective disclosure, and states that it discloses to law enforcement only under valid legal process.</p>
      <p>NEAR Intents offers no test environment for this integration, so the beta runs on mainnet with small amounts of DarkSwap's own funds first.</p>
      <p>Not confirmed yet: whether a confidential balance opened through DarkSwap can be reached from another NEAR Intents front end, such as near.com, if darkswap.app is unavailable. Until that is confirmed, assume you need darkswap.app to move a balance.</p>
    </>,
  },
  {
    id: 'zk', num: '06', title: 'Our own ZK pools', status: 'built',
    body: <>
      <div className="docs-caution">The ZK pools are not deployed to any public network and have not been audited. Their proving keys are development keys: whoever ran that setup could forge proofs. Do not put real funds in them.</div>
      <p>DarkSwap has written its own shielded pools from one circuit: a contract for Ethereum and Base (ETH and listed ERC-20 tokens) and a native Solana program (SOL and listed SPL tokens). Both run end to end on local chains with real proofs. The terminal for them is on the site at darkswap.app/pool as a local-development preview, not deployed on any public network. This is the ZK tier, not the Dark Pool on NEAR Confidential Intents. The Solana pool accepts SOL and tokens on the original SPL Token program. It does not accept Token-2022 tokens, so $DARK itself, which is a Token-2022 token, cannot be shielded in it as built.</p>
      <p><strong>Proof system.</strong> The circuit is written in circom and proved with Groth16 on the BN254 curve (also written alt_bn128 or bn128). Proofs are made in your browser with snarkjs. Commitments, nullifiers and the note tree all use the Poseidon hash.</p>
      <p>Balances are encrypted notes, in the model Zcash uses. A note commits to an amount, an asset, an owner key and a random blinding value. Spending a note publishes a nullifier that marks it spent without saying which note it was.</p>
      <pre className="wp-formulas"><code>{`commitment = Poseidon(amount, asset id, public key, blinding)
public key = Poseidon(private key)
nullifier = Poseidon(commitment, position, Poseidon(private key, commitment, position))`}</code></pre>
      <ul className="docs-checklist">
        <li><strong>Shield.</strong> A public deposit creates a note. The deposit, its amount and the wallet that paid are public, so every shield from one wallet can be tied to that wallet. Each deposit uses a fresh one-time key, which stops the notes being linked to each other by their key. It does not hide who funded them.</li>
        <li><strong>Private send.</strong> Spends up to two notes and creates two, proven with a zero-knowledge proof built on your device. Proving took 2 to 5 seconds in tests on a 2-core machine; a phone or an older laptop may take longer. A private send hides the amount and the asset as well as who sent it. DarkSwap's relayer submits private sends without charging a fee, within a rate limit.</li>
        <li><strong>Unshield.</strong> A withdrawal to a public address. DarkSwap's relayer can submit it so you do not need gas in the destination wallet; its fee is taken from the withdrawal and is separate from the protocol fee. For a token, the relayer only accepts ones it has a price for. For any other token, or if the relayer is down, you submit the withdrawal from your own wallet, which pays the gas and is public as the sender.</li>
      </ul>
      <p>Both pools use a Poseidon note tree of depth 26 that only ever grows. It has 67,108,864 slots per pool, shared by every asset in that pool. Each shield and each spend uses two slots, so a pool can take about 33.5 million of them. When a tree is full, deposits stop and withdrawals of whole notes keep working. Each asset has its own books (one asset can never pay out another's funds), with a minimum and maximum deposit and a cap on what the pool may hold. The pool moves one asset per transaction; there are no swaps inside it yet.</p>
      <p><strong>Keys.</strong> Your spending key comes from one secret, made from a wallet signature over a fixed message or restored from 24 words. After you activate, the page holds that key in memory only: it is not written to storage, and it is dropped when you lock or after 30 minutes idle. While the key is held, the page can spend your notes. A compromised or look-alike site that gets your signature or your 24 words can spend them too. Check the address before you sign.</p>
      <p><strong>What it costs.</strong> On Ethereum and Base a shield uses about 1.16 to 1.22 million gas, a private send about 1.32 million and an unshield about 1.38 million. On Solana a spend uses about 161,000 to 172,000 compute units and creates two small accounts whose rent the relayer pays and recovers in its fee. These are measurements on local chains.</p>
      <p><strong>Admin powers.</strong> The admin can list assets, set deposit limits, turn deposits off for an asset, pause all new deposits during a window that ends on a date fixed at deployment, change the protocol fee up to the 1% cap, and hand the admin role to another key. On Ethereum and Base the handover takes two steps; on Solana it takes one. The admin cannot move user funds, pause withdrawals, change the fee recipient or change the verifying key. Withdrawals can still be affected by the asset itself (for example, a token whose issuer can freeze accounts), by the network, or by the deployment.</p>
      <p><strong>Upgrades.</strong> The Ethereum and Base pool has no upgrade path. The Solana program has an upgrade authority, as every Solana program does. Whoever holds it can replace the program, and with it every rule above, including the ones about funds and withdrawals. Before mainnet it goes behind a multisig with a delay, or is removed.</p>
      <p><strong>Screening.</strong> The Ethereum and Base pool can be deployed with a sanctions-list check on the address making a deposit. Whether it is switched on is still to decide. The Solana program has no such check. Neither pool can freeze, reverse or revoke a deposit once it is accepted, and neither checks withdrawals.</p>
      <p><strong>Review.</strong> Two separate reviews attacked the code, one on the circuit and one on both pools. Neither found a way to steal, mint, double-spend or redirect a payout. The pool review found two ways to freeze funds; both are fixed and each fix has a test. These reviews are not an independent audit. The source is not published yet. Parts of it build on GPL-3.0 code, and the licence decision comes first.</p>
      <p><strong>Gates before user funds.</strong> Public testnets, a setup ceremony with outside contributors to replace the development proving keys, and an independent audit with its findings resolved.</p>
    </>,
  },
  {
    id: 'revenue', num: '07', title: 'Fees and revenue', status: ['live', 'built', 'proposed'],
    body: <>
      <p>Four revenue lines: three are running today, and one is built into the ZK pools with its destination still proposed.</p>
      <table className="wp-table">
        <thead><tr><th scope="col">Line</th><th scope="col">Where it comes from</th><th scope="col">Where it goes</th><th scope="col">Status</th></tr></thead>
        <tbody>
          <tr><th scope="row">Creator fee</th><td>1% on $DARK trades, received in wNEAR</td><td>Half to holder payouts in wNEAR; half buys ZEC tokens on Solana for the treasury in the creator wallet</td><td><span className="wp-tag wp-tag-live">live</span></td></tr>
          <tr><th scope="row">Swap fee</th><td>0.40% partner fee on Privacy swap; 0.20% to DarkSwap</td><td>DarkSwap's NEAR account, darkswapapp.near</td><td><span className="wp-tag wp-tag-live">live</span></td></tr>
          <tr><th scope="row">Liquidity fees</th><td>DarkSwap's own positions in the ZEC-DARK pool earn their share of trading fees</td><td>A share planned for operating costs and, later, swap subsidies; not yet funded</td><td><span className="wp-tag wp-tag-live">live</span></td></tr>
          <tr><th scope="row">ZK pool fee</th><td>0.5% on shield and on unshield in tests; none on private sends. The admin can change the rate, never above 1%</td><td>One fee recipient fixed at deployment. Planned use: convert to ZEC and $DARK and add to ZEC-DARK liquidity</td><td><span className="wp-tags" aria-label="Status: built, proposed"><span className="wp-tag wp-tag-built">built</span><span className="wp-tag wp-tag-proposed">proposed</span></span></td></tr>
        </tbody>
      </table>
      <p><strong>What the pool does, and what is only planned.</strong> Built: ZK pool fees never sit inside a note balance and never make an existing note worth more. They build up in the pool, and anyone can sweep them, only to the one fee recipient fixed when the pool is deployed. Proposed: that recipient will be contracts that convert the fees to ZEC and $DARK and add them as liquidity to the ZEC-DARK pool on Meteora, with fees from Ethereum and Base bridged to Solana first. The design is that anyone can trigger each step and no step can send the fees anywhere else. Those contracts are not written yet. Because the recipient is fixed at deployment, they have to be written, audited and deployed before the pools go to mainnet.</p>
      <p>Provider and network costs come on top of DarkSwap's fees and are set by those providers. Fees and rewards exist only when people swap and trade $DARK.</p>
      <p><strong>Holding $DARK does not create a claim on any of these fees.</strong></p>
    </>,
  },
  {
    id: 'dark-token', num: '08', title: 'The $DARK token', status: 'live',
    body: <>
      <p>$DARK token facts, read from the chain on October 6, 2026.</p>
      <table className="wp-table wp-token-table">
        <tbody>
          <tr><th scope="row">Mint</th><td>7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3, on Solana, Token-2022 program</td></tr>
          <tr><th scope="row">Decimals</th><td>6</td></tr>
          <tr><th scope="row">Supply</th><td>999,851,915.57 $DARK</td></tr>
          <tr><th scope="row">Mint authority</th><td>None. No new $DARK can be created</td></tr>
          <tr><th scope="row">Freeze authority</th><td>None</td></tr>
          <tr><th scope="row">Transfer fee</th><td>None</td></tr>
          <tr><th scope="row">Metadata authority</th><td>WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh. The token's name, symbol and image link can still be changed by this key</td></tr>
          <tr><th scope="row">Launch</th><td>StonkFun, on Raydium LaunchLab. Graduated October 1, 2026</td></tr>
          <tr><th scope="row">Main pool</th><td>$DARK against wNEAR on Raydium, pool Cprsvqk2riV3WmTewKK9m6cm62zaAqLDArAbBmN3pe4f. RugCheck reports its liquidity tokens as 100% locked</td></tr>
          <tr><th scope="row">Creator fee</th><td>1% of $DARK trades, paid in wNEAR through the launch platform</td></tr>
        </tbody>
      </table>
      <p className="wp-note">Sources: RugCheck and Jupiter token data, October 6, 2026.</p>
    </>,
  },
  {
    id: 'rewards', num: '09', title: '$DARK holder rewards', status: 'live',
    body: <>
      <p>$DARK is paired with NEAR. Half of received $DARK creator fees funds qualifying holders in wNEAR. The other half purchases ZEC tokens on Solana for the protocol treasury in the creator wallet. Treasury holdings, separately authorized liquidity deployments, LP fee compounding, and completed holder payouts are tracked separately. The program never shares keys or balances with the pools. So far the treasury half has gone into creating and funding the ZEC-DARK pool (section 10).</p>
      <ul className="docs-checklist">
        <li><strong>What is split.</strong> Only creator-fee proceeds actually received, in wNEAR. Not all trading volume, router commissions or customer deposits. There is no buyback and burn of creator fees, and buying $DARK to pair in a liquidity pool is not burning it.</li>
        <li><strong>Scheduled wNEAR payouts.</strong> At 6 a.m. and 6 p.m. America/Los_Angeles time, adjusting for daylight saving, sent direct with no claim step. Each payout uses a fresh snapshot taken at that payout. Background monitoring snapshots do not set the payout's weight and are not a countdown to an automatic ZEC payout.</li>
        <li><strong>How to qualify.</strong> Hold at least 100,000 $DARK in the scheduled snapshot. Excluded wallets remain ineligible. Allocations are weighted by qualifying balances in that snapshot. Earlier awards keep the rules they were paid under.</li>
        <li><strong>ZEC award, historical.</strong> A completed loyalty award distributed 1 ZEC token on Solana across 92 holders on October 5, 2026, weighted by holdings under its original checkpoint rules. Further ZEC awards require separate approval.</li>
        <li><strong>Which wNEAR.</strong> wNEAR here is a token on Solana that represents NEAR (mint <span className="wp-asset-address">3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG</span>). It is the token $DARK trades against, and payouts are sent on Solana. It is not NEAR on the NEAR network. Its mint authority is active, which is normal for a bridged token and means its issuer can create more.</li>
        <li><strong>Which ZEC.</strong> ZEC here is a token on Solana (mint <span className="wp-asset-address">A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS</span>), not native or shielded Zcash. Market trackers list it as OmniBridge-bridged Zcash; DarkSwap has not verified its backing. Its mint authority is active. A matching ticker does not establish backing, redemption rights or shielding.</li>
        <li><strong>Timing.</strong> Snapshots are taken at the published payout times. A wallet that holds 100,000 $DARK only around a snapshot qualifies the same as one that holds all day.</li>
      </ul>
      <p>Payout totals are not restated here. The DARK Rewards console at rewards.darkswap.app is the record, with a summary feed and a receipt export. It reports holder payouts, $DARK marketing airdrops, treasury assets and pool liquidity separately, and its USD totals are current-price estimates, not payout-time value or guaranteed proceeds. Rewards depend on fees actually received. There is no fixed return, and past distributions do not guarantee future ones.</p>
    </>,
  },
  {
    id: 'liquidity', num: '10', title: 'ZEC-DARK liquidity', status: ['live', 'proposed'],
    body: <>
      <p>A protocol-funded ZEC-DARK pool is live on Meteora (Solana, DAMM v2). It has a 1% base trading fee with dynamic fees where applicable, so the fee paid can be higher, and 10% of LP fees are configured to compound back into the pool. That 10% is a compounding setting, not a 10% yield. Pool address: <span className="wp-asset-address">5Tyakzwn8BF9cqXE5NZB9C5FJPn5UapAZMGCpXcPvU1u</span>.</p>
      <p>The pool was created and funded from the treasury half of the $DARK creator fee: $DARK was bought on the open market and paired with ZEC. DarkSwap reports the first funding as 2 ZEC spent on $DARK, paired with another 2 ZEC, and that the creator wallet supplied 99.9% of the pool's liquidity. The purchase and deposit transactions are on the creator wallet; until this paper links them, treat those figures as DarkSwap's own report. Funding is separate from position ownership and withdrawable liquidity: the creator-held position includes vested and permanently locked portions. On October 6, 2026, Meteora showed about 3.66 ZEC and 3.29 million $DARK in the pool, about $9,900 in total, of which about $258 was permanently locked. That is a dated reading, not a current balance, and balance growth alone does not prove compounded fee earnings.</p>
      <p>It is public trading liquidity. It is not the dark pool, it is not shielded, and its figures are separate from both the dark pool and the holder rewards.</p>
      <p>Two inflows are planned on top of trading: further treasury ZEC from the creator-fee split, only when a liquidity deployment is separately authorized, and fees from DarkSwap's own ZK pools once they are live (section 07). DarkSwap also plans to set aside a share of the LP fees it actually claims for operating costs first and then a small, capped swap-subsidy trial. None of those reserves is funded yet.</p>
    </>,
  },
  {
    id: 'trust', num: '11', title: 'Who you trust',
    body: <>
      <p>DarkSwap has two privacy tiers with two trust models.</p>
      <table className="wp-table">
        <thead><tr><th scope="col"></th><th scope="col">Dark pool on NEAR</th><th scope="col">DarkSwap ZK pools</th></tr></thead>
        <tbody>
          <tr><th scope="row">Privacy from</th><td>The public. Not from the operators of NEAR's private shard</td><td>The public and DarkSwap, by proof, for what happens inside the pool. Deposits and withdrawals are public</td></tr>
          <tr><th scope="row">How</th><td>Encrypted execution on a private shard with permissioned validators</td><td>Encrypted notes and zero-knowledge proofs built on your device</td></tr>
          <tr><th scope="row">Who holds funds</th><td>NEAR Intents; you authorise every action with your own wallet</td><td>The pool contract; only the holder of a note's key can spend it. That key sits in your browser while the pool page is unlocked</td></tr>
          <tr><th scope="row">Screening</th><td>NEAR Intents screens funds as they enter, under its own rules</td><td>Asset listing and deposit limits set by the admin. Ethereum and Base: an optional sanctions-list check on the depositing address, set at deployment. Solana: none. Nothing can be frozen or revoked after a deposit is accepted</td></tr>
          <tr><th scope="row">Can withdrawals be stopped?</th><td>Subject to NEAR Intents' availability and terms</td><td>No admin role can pause withdrawals. On Solana the upgrade authority could replace the program until it is behind a multisig with a delay or removed. The asset, the network or the deployment can still affect them</td></tr>
          <tr><th scope="row">What DarkSwap runs</th><td>The terminal only. The balance and the execution are on NEAR Intents</td><td>The terminal, the only relayer, the indexer, the admin key and, until it is removed or placed behind a multisig, the Solana upgrade authority</td></tr>
          <tr><th scope="row">If darkswap.app is down</th><td>Not confirmed that another front end can reach your balance</td><td>The contracts keep working. You need your 24 words, a copy of the client and a wallet with gas to submit. A standalone recovery page is not built yet</td></tr>
        </tbody>
      </table>
      <p>Other parties on both tiers: the routing providers that carry funds between chains, whose availability and terms are outside DarkSwap's control, and the chains themselves.</p>
      <p>On both tiers, privacy from the public is not privacy from a lawful request.</p>
    </>,
  },
  {
    id: 'limits', num: '12', title: 'What privacy you get, and what you do not',
    body: <>
      <p>Every tier hides activity in the middle. None hides the edges. Someone watching the chain can see that you deposited an amount and that someone withdrew an amount; the question is whether they can connect the two.</p>
      <ul className="docs-checklist">
        <li><strong>Amount and timing.</strong> An unusual amount withdrawn soon after a matching deposit can be linked, on any tier. Common amounts and waiting help.</li>
        <li><strong>Small pools hide less.</strong> In the ZK pools, a small pool is a small crowd to hide in. NEAR's confidential balances are encrypted per user rather than pooled, but edge correlation still applies.</li>
        <li><strong>Deposits name their wallet.</strong> In the ZK pools every shield is public, with its amount and the wallet that paid.</li>
        <li><strong>Network details.</strong> The site, DarkSwap's servers and relayer, and the RPC providers the page reads from can see your IP address and when you connect. A proof does not hide that.</li>
        <li><strong>Your own habits.</strong> Reusing addresses, posting transaction details or withdrawing to a labelled wallet undoes privacy no system can restore.</li>
      </ul>
      <p>No route or pool makes activity invisible. This paper does not claim otherwise, and neither should anyone describing it.</p>
    </>,
  },
  {
    id: 'comparison', num: '13', title: 'How it compares',
    body: <>
      <p>The two peers reviewed here each run their own pool on one chain, and both are deployed. DarkSwap's own pools are not deployed. What DarkSwap has live is private swap routing from Solana and holder payouts, on a network that already connects many chains.</p>
      <table className="wp-table">
        <thead><tr><th scope="col"></th><th scope="col">ZeroTrace</th><th scope="col">Nullmask</th><th scope="col">DarkSwap</th></tr></thead>
        <tbody>
          <tr><th scope="row">Chains</th><td>Robinhood Chain</td><td>EVM; pool on Ethereum</td><td>Live routes start on Solana and deliver to 8 networks through NEAR Intents (routes vary); ZK tier built for Solana, Ethereum and Base</td></tr>
          <tr><th scope="row">Privacy model</th><td>Zero-knowledge notes</td><td>Zero-knowledge notes, through a wallet proxy</td><td>Confidential routing live; confidential balances planned; zero-knowledge notes later</td></tr>
          <tr><th scope="row">Assets</th><td>ZERO only</td><td>Multi-asset</td><td>Assets supported by NEAR Intents, where a route is available</td></tr>
          <tr><th scope="row">Protocol fee</th><td>Not reviewed</td><td>0.5% on deposits and 0.5% on withdrawals, per its own DefiLlama filing</td><td>0.40% partner fee on Privacy swap, half to DarkSwap; ZK tier 0.5% on shield and unshield in tests, not live</td></tr>
          <tr><th scope="row">Holder payouts</th><td>Through the vault, to private notes</td><td>No holder payout stated; its filing counts all fees as protocol revenue</td><td>wNEAR paid direct to holders; one ZEC-token award paid</td></tr>
          <tr><th scope="row">Own pool deployed</th><td>Yes, by its own account</td><td>Yes; about $13.1k TVL on Oct 2, 2026, per its own filing</td><td>No. Built and tested on local chains only</td></tr>
          <tr><th scope="row">Live product</th><td>Deployed</td><td>Deployed</td><td>Private swaps live; dark pool planned</td></tr>
          <tr><th scope="row">Audit of own contracts</th><td>No public report identified</td><td>Its filing says an audit is in progress (October 2026); no public report identified</td><td>None yet; required before the ZK tier takes funds</td></tr>
        </tbody>
      </table>
      <p className="wp-note">Peer columns are project-reported, checked October 4 to 6, 2026. Nullmask figures come from its own DefiLlama filings: the <a href="https://github.com/DefiLlama/dimension-adapters/pull/9855" target="_blank" rel="noopener noreferrer">fees adapter</a> and the <a href="https://github.com/DefiLlama/DefiLlama-Adapters/pull/21369" target="_blank" rel="noopener noreferrer">TVL adapter</a>. The ZeroTrace column comes from its own site and was not independently checked. “No public report identified” means none was found in this review; it does not mean none exists.</p>
    </>,
  },
  {
    id: 'roadmap', num: '14', title: 'Roadmap', status: ['live', 'scheduled', 'built'],
    body: <>
      <table className="wp-table">
        <thead><tr><th scope="col">Stage</th><th scope="col">What</th></tr></thead>
        <tbody>
          <tr><th scope="row">Live</th><td>Private swaps from Solana through NEAR Intents (with a partner fee) and the sponsored privacy swap by Houdini. wNEAR payouts and one ZEC-token award to $DARK holders. The ZEC-DARK pool on Meteora.</td></tr>
          <tr><th scope="row">On the site</th><td>The ZK pool terminal at darkswap.app/pool, a local-development preview, not deployed on any public network.</td></tr>
          <tr><th scope="row">Next</th><td>The dark pool on NEAR Confidential Intents. Target late October 2026, subject to NEAR enabling access; beta on mainnet with DarkSwap's own funds first.</td></tr>
          <tr><th scope="row">Built, held back</th><td>Our own ZK pools for Solana, Ethereum and Base. No date is set. In order: public testnets; the two circuit decisions; the fee recipient contracts, which must exist before the pools because the recipient is fixed at deployment; a setup ceremony with outside contributors; an independent audit with its findings resolved; then mainnet with deposit caps.</td></tr>
          <tr><th scope="row">Not built yet</th><td>Viewing keys, a standalone recovery page, swaps inside the ZK pools, and funding the Ethereum and Base pools from Solana.</td></tr>
        </tbody>
      </table>
      <p>Targets move; the gates do not.</p>
    </>,
  },
  {
    id: 'risks', num: '15', title: 'Risks',
    body: <>
      <ul className="docs-checklist">
        <li><strong>The dark pool depends on NEAR.</strong> DarkSwap's access to the confidential balance integration is not confirmed yet. NEAR can change its terms, fees or availability.</li>
        <li><strong>Confidential is not zero-knowledge.</strong> The NEAR tier hides activity from the public, not from the operators of NEAR's private shard.</li>
        <li><strong>No test environment for NEAR Intents.</strong> Testing happens on mainnet with small amounts of DarkSwap's own funds.</li>
        <li><strong>The ZK tier is unaudited and not deployed.</strong> It has run on local chains only, with development proving keys.</li>
        <li><strong>Routes vary.</strong> Not every asset pair has a live route, and providers can pause routes.</li>
        <li><strong>Revenue depends on use.</strong> Fees, rewards and liquidity inflows exist only when people swap and trade $DARK.</li>
        <li><strong>Market risk.</strong> $DARK, wNEAR and ZEC prices move; reward values and pool liquidity move with them.</li>
        <li><strong>Legal.</strong> No legal opinion has been obtained. Privacy tools draw regulatory attention.</li>
        <li><strong>Your key sits in the browser.</strong> On the ZK tier, the pool page holds your spending key while it is unlocked. A compromised or look-alike site can spend your notes.</li>
        <li><strong>Trusted setup.</strong> Groth16 needs a setup ceremony. If every contributor to it colluded or was compromised, proofs could be forged. Today's keys were made on one machine and are for development only.</li>
        <li><strong>Solana upgrade authority.</strong> Until it is behind a multisig with a delay or removed, its holder can replace the Solana pool program.</li>
        <li><strong>One relayer.</strong> DarkSwap runs the only relayer. If it is down, you submit from your own wallet, which pays gas and is public as the sender.</li>
        <li><strong>Bridged tokens.</strong> The wNEAR and ZEC used for rewards and liquidity are bridged tokens on Solana. Their value depends on the bridge that issues them, and their issuers can create more.</li>
        <li><strong>Launch platform.</strong> The $DARK creator fee is paid through the platform $DARK launched on. DarkSwap does not control that platform, and a change there would change the payouts.</li>
        <li><strong>Snapshot timing.</strong> Payout snapshots are taken at published times, so wallets that hold only around a snapshot dilute long-term holders.</li>
        <li><strong>Token metadata.</strong> $DARK has no mint or freeze authority, but its name, symbol and image link can still be changed by the metadata authority.</li>
      </ul>
    </>,
  },
];

// Docs reuses this export. Preserve its existing roadmap: the owner scoped
// the final v0.4 revision to the whitepaper, not to the Docs page.
export const sections: Section[] = whitepaperSections.map(section => section.id !== 'roadmap' ? section : {
  ...section,
  body: <>
    <table className="wp-table">
      <thead><tr><th scope="col">Stage</th><th scope="col">What</th></tr></thead>
      <tbody>
        <tr><th scope="row">Live</th><td>Private swaps from Solana through NEAR Intents (with a partner fee) and a partner route. wNEAR payouts and one ZEC-token award to $DARK holders. The ZEC-DARK pool on Meteora.</td></tr>
        <tr><th scope="row">On the site</th><td>The ZK pool terminal at darkswap.app/pool, a local-development preview, not deployed on any public network.</td></tr>
        <tr><th scope="row">Next</th><td>The dark pool on NEAR Confidential Intents. Target late October 2026, subject to NEAR enabling access; beta on mainnet with DarkSwap's own funds first.</td></tr>
        <tr><th scope="row">Built, held back</th><td>Our own ZK pools for Solana, Ethereum and Base, then the fee recipient contracts that add pool fees to ZEC-DARK liquidity. Public testnets, a setup ceremony and an independent audit come before any user funds.</td></tr>
      </tbody>
    </table>
    <p>Targets move; the gates do not.</p>
  </>,
});
