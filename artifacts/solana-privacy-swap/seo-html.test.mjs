import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPageHtml, aliases, externalRedirects, isKnownRoute } from './seo-html.mjs';

const template = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const publicRoutes = ['/', '/swap', '/near-swap', '/bridge', '/docs', '/docs/confidential-routing', '/docs/whitepaper', '/pool', '/pool/what-stays-public', '/help', '/near-trends', '/near-discovery', '/rewards'];
const previews = ['/founder', '/previews', '/terminal-preview', '/screener-beta', '/split-mixer-preview', '/privacy-bundle-preview', '/shielded-zcash-preview'];

test('pool search and social previews state local development, not a public testnet', async () => {
  const paths = JSON.parse(await readFile(new URL('./src/pool/routes.json', import.meta.url), 'utf8'));
  for (const path of paths) {
    const html = renderPageHtml(template, path);
    for (const tag of ['<title>', 'name="description"', 'property="og:title"',
      'property="og:description"', 'name="twitter:title"', 'name="twitter:description"']) {
      const value = tag === '<title>' ? html.match(/<title>(.*?)<\/title>/)?.[1]
        : html.match(new RegExp(`<meta ${tag} content="([^"]*)"`))?.[1];
      assert.match(value, /local-development preview/, `${path}: ${tag}`);
      assert.doesNotMatch(value, /testnet/i, `${path}: ${tag}`);
    }
    assert.match(html, /not deployed on any public network or audited/);
    assert.match(html, /Development proving keys could forge proofs/);
    assert.match(html, /Do not deposit real funds/);
    assert.doesNotMatch(html, /testnet mode/i);
  }
});

test('whitepaper route metadata and social tags identify v0.4', () => {
  const html = renderPageHtml(template, '/docs/whitepaper');
  assert.match(html, /<title>DarkSwap Whitepaper v0\.4<\/title>/);
  for (const tag of [
    'name="description"', 'property="og:title"', 'property="og:description"',
    'name="twitter:title"', 'name="twitter:description"',
  ]) {
    assert.ok(html.includes(`<meta ${tag} content="DarkSwap Whitepaper v0.4`), tag);
  }
  assert.match(html, /October 6, 2026/);
  assert.doesNotMatch(html, /Every section carries a status tag/);
});

test('whitepaper v0.4 generated page preserves part 1 boxes, summary and status tags', async () => {
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  const html = renderPageHtml(template, '/docs/whitepaper', guides);
  const decisions = html.match(/<aside\b[^>]*aria-label="Open decisions">([\s\S]*?)<\/aside>/)?.[1];
  const changes = html.match(/<aside\b[^>]*aria-label="What changed in v0\.4">([\s\S]*?)<\/aside>/)?.[1];
  assert.equal((decisions?.match(/<li\b/g) || []).length, 7);
  assert.equal((changes?.match(/<li\b/g) || []).length, 9);
  assert.match(html, /Version 0\.4 · October 6, 2026 · Supersedes v0\.3\./);
  assert.match(html, /DARKSWAP WHITEPAPER · V0\.4/);
  assert.match(html, /Live routes start on Solana only\./);
  assert.match(html, /and the plan is to add fees from our own ZK pools to it/);
  assert.match(html, /Sections that describe a product carry a status tag; read the tag before the text\./);
  assert.match(decisions || '', /Tests use 0\.5%; the contract allows anything up to 1%/);
  assert.match(decisions || '', /The bridge that carries Ethereum and Base pool fees to Solana\./);
  assert.match(changes || '', /Risks: eight added\./);
  assert.ok(html.indexOf('aria-label="Open decisions"') < html.indexOf('aria-label="What changed in v0.4"'));
  assert.ok(html.indexOf('aria-label="What changed in v0.4"') < html.indexOf('id="summary"'));
  const sectionHead = id => html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?<h2[^>]*>`))?.[0] || '';
  assert.doesNotMatch(sectionHead('comparison'), /wp-tags|wp-tag-proposed/);
  assert.match(sectionHead('revenue'), /Status: live, built, proposed/);
  assert.match(sectionHead('roadmap'), /Status: live, scheduled, built/);
  const llms = await readFile(new URL('./public/llms.txt', import.meta.url), 'utf8');
  assert.match(llms, /Whitepaper v0\.4/);
  assert.match(llms, /and a second partner route/);
  assert.doesNotMatch(llms, /and a second route through Houdini/);
});

test('whitepaper v0.4 part 2 keeps exact route disclosures and an accessible four-lane diagram', async () => {
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  const html = guides['/docs/whitepaper'];
  const decode = text => text.replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  const section = id => html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] || '';
  const plain = id => decode(section(id).replace(/<[^>]+>/g, ''));
  const architecture = plain('architecture');
  for (const text of [
    'For the live swap routes, DarkSwap is a terminal, not a custodian. It prepares quotes and orders, shows you exactly what to send, and tracks the result. The swap itself runs on infrastructure DarkSwap does not operate: NEAR Intents for Privacy swap and Houdini for the sponsored privacy swap.',
    'That is not the whole picture. DarkSwap runs its own servers for quotes and order records, holds the treasury and sends the $DARK holder payouts. For the ZK tier it also runs the relayer, the indexer and the admin key, and it holds the Solana upgrade authority until that is removed or placed behind a multisig. The Who you trust section sets out who you trust at each tier.',
    "Cross-chain routing and settlement for Privacy swap, with NEAR's basic confidential handling requested",
    'The second private route, with its own quotes, fees and terms',
    'Shielded note pools on Solana, Ethereum and Base, with a DarkSwap relayer and indexer',
    'Privacy swap accepts Solana as the source and can deliver to Solana, NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon and BNB Chain. Each pair still needs a live quote.',
  ]) assert.ok(architecture.includes(text), text);
  const diagram = section('architecture').match(/<figure\b[\s\S]*?<\/figure>/)?.[0] || '';
  const alternative = decode(diagram.match(/role="img" aria-label="([^"]*)"/)?.[1] || '');
  for (const text of [
    'You and your wallet',
    'DarkSwap terminal (darkswap.app): quotes, order review, deposit instructions, tracking',
    'live: Privacy swap. NEAR Intents 1Click, basic confidential handling. From Solana to Solana, NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon or BNB Chain. Run by: NEAR Intents.',
    'live: Sponsored privacy swap by Houdini. Destinations as quoted. Run by: Houdini.',
    "scheduled: Dark pool on NEAR. Confidential balance on NEAR's private shard. Deposit from and withdraw to supported chains. Run by: NEAR Intents.",
    'built: DarkSwap ZK pools. One Solana program, one contract for Ethereum and Base. Not deployed. Run by: DarkSwap (relayer, indexer, admin key).',
  ]) assert.ok(alternative.includes(text), text);
  assert.equal((diagram.match(/class="wp-architecture-lane"/g) || []).length, 4);
  assert.equal((diagram.match(/class="wp-tag wp-tag-live"/g) || []).length, 2);
  assert.match(diagram, /wp-tag-scheduled/);
  assert.match(diagram, /wp-tag-built/);
  assert.match(diagram, /aria-hidden="true"/);
  assert.match(diagram, /The NEAR dark pool and the ZK pools are separate tiers\. Nothing moves between them\./);
  assert.doesNotMatch(diagram, /<img|<iframe|https?:\/\//);
  const rawArchitecture = section('architecture');
  assert.ok(rawArchitecture.indexOf('That is not the whole picture.') < rawArchitecture.indexOf('<figure'));
  assert.ok(rawArchitecture.indexOf('</figure>') < rawArchitecture.indexOf('<table'));
  const swaps = plain('swaps');
  assert.ok(swaps.includes("Privacy swap runs on the NEAR Intents 1Click API and requests NEAR's basic confidential handling for the order. NEAR also offers an advanced setting, which DarkSwap does not use. NEAR's documentation says that for Confidential Intents, on-chain deposits and withdrawals cannot be tracked to each other. Your Solana deposit is still public: its amount and the wallet it came from. The delivery on the destination chain is visible too."));
  assert.ok(swaps.includes("DarkSwap's half is paid to its NEAR account, darkswapapp.near."));
  assert.ok(swaps.includes('Sponsored privacy swap by Houdini is the second private route, with its own fees and terms shown in the quote.'));
  assert.match(section('swaps'), /<strong[^>]*>Privacy swap<\/strong>/);
  assert.match(section('swaps'), /<strong[^>]*>Sponsored privacy swap by Houdini<\/strong>/);
  assert.ok(architecture.includes('Sponsored privacy swap by HoudiniThe second private route, with its own quotes, fees and terms'));
  const steps = section('swaps').match(/<ol\b[\s\S]*?<\/ol>/)?.[0] || '';
  assert.equal((steps.match(/<li\b/g) || []).length, 4);
  assert.ok(swaps.includes('A private route keeps more of the swap off the public record. It does not make a swap anonymous, and timing and amounts at either end can still be matched.'));
  const darkPool = plain('darkpool');
  assert.ok(darkPool.includes('This is the intended design, not a live product. DarkSwap does not have access to this integration yet; it is being arranged with the NEAR Intents team. It also depends on DarkSwap completing the integration.'));
  assert.ok(darkPool.endsWith('Not confirmed yet: whether a confidential balance opened through DarkSwap can be reached from another NEAR Intents front end, such as near.com, if darkswap.app is unavailable. Until that is confirmed, assume you need darkswap.app to move a balance.'));
});

test('whitepaper v0.4 part 3 renders the exact ZK wording and formulas in the requested order', async () => {
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  const section = guides['/docs/whitepaper'].match(/<section[^>]*id="zk"[\s\S]*?<\/section>/)?.[0] || '';
  const plain = html => html.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  const blocks = (section.match(/<(p|li|pre)\b[^>]*>[\s\S]*?<\/\1>/g) || []).map(plain);
  assert.deepEqual(blocks, [
    'DarkSwap has written its own shielded pools from one circuit: a contract for Ethereum and Base (ETH and listed ERC-20 tokens) and a native Solana program (SOL and listed SPL tokens). Both run end to end on local chains with real proofs. The terminal for them is on the site at darkswap.app/pool as a local-development preview, not deployed on any public network. This is the ZK tier, not the Dark Pool on NEAR Confidential Intents. The Solana pool accepts SOL and tokens on the original SPL Token program. It does not accept Token-2022 tokens, so $DARK itself, which is a Token-2022 token, cannot be shielded in it as built.',
    'Proof system. The circuit is written in circom and proved with Groth16 on the BN254 curve (also written alt_bn128 or bn128). Proofs are made in your browser with snarkjs. Commitments, nullifiers and the note tree all use the Poseidon hash.',
    'Balances are encrypted notes, in the model Zcash uses. A note commits to an amount, an asset, an owner key and a random blinding value. Spending a note publishes a nullifier that marks it spent without saying which note it was.',
    'commitment = Poseidon(amount, asset id, public key, blinding)\npublic key = Poseidon(private key)\nnullifier = Poseidon(commitment, position, Poseidon(private key, commitment, position))',
    'Shield. A public deposit creates a note. The deposit, its amount and the wallet that paid are public, so every shield from one wallet can be tied to that wallet. Each deposit uses a fresh one-time key, which stops the notes being linked to each other by their key. It does not hide who funded them.',
    "Private send. Spends up to two notes and creates two, proven with a zero-knowledge proof built on your device. Proving took 2 to 5 seconds in tests on a 2-core machine; a phone or an older laptop may take longer. A private send hides the amount and the asset as well as who sent it. DarkSwap's relayer submits private sends without charging a fee, within a rate limit.",
    "Unshield. A withdrawal to a public address. DarkSwap's relayer can submit it so you do not need gas in the destination wallet; its fee is taken from the withdrawal and is separate from the protocol fee. For a token, the relayer only accepts ones it has a price for. For any other token, or if the relayer is down, you submit the withdrawal from your own wallet, which pays the gas and is public as the sender.",
    "Both pools use a Poseidon note tree of depth 26 that only ever grows. It has 67,108,864 slots per pool, shared by every asset in that pool. Each shield and each spend uses two slots, so a pool can take about 33.5 million of them. When a tree is full, deposits stop and withdrawals of whole notes keep working. Each asset has its own books (one asset can never pay out another's funds), with a minimum and maximum deposit and a cap on what the pool may hold. The pool moves one asset per transaction; there are no swaps inside it yet.",
    'Keys. Your spending key comes from one secret, made from a wallet signature over a fixed message or restored from 24 words. After you activate, the page holds that key in memory only: it is not written to storage, and it is dropped when you lock or after 30 minutes idle. While the key is held, the page can spend your notes. A compromised or look-alike site that gets your signature or your 24 words can spend them too. Check the address before you sign.',
    'What it costs. On Ethereum and Base a shield uses about 1.16 to 1.22 million gas, a private send about 1.32 million and an unshield about 1.38 million. On Solana a spend uses about 161,000 to 172,000 compute units and creates two small accounts whose rent the relayer pays and recovers in its fee. These are measurements on local chains.',
    'Admin powers. The admin can list assets, set deposit limits, turn deposits off for an asset, pause all new deposits during a window that ends on a date fixed at deployment, change the protocol fee up to the 1% cap, and hand the admin role to another key. On Ethereum and Base the handover takes two steps; on Solana it takes one. The admin cannot move user funds, pause withdrawals, change the fee recipient or change the verifying key. Withdrawals can still be affected by the asset itself (for example, a token whose issuer can freeze accounts), by the network, or by the deployment.',
    'Upgrades. The Ethereum and Base pool has no upgrade path. The Solana program has an upgrade authority, as every Solana program does. Whoever holds it can replace the program, and with it every rule above, including the ones about funds and withdrawals. Before mainnet it goes behind a multisig with a delay, or is removed.',
    'Screening. The Ethereum and Base pool can be deployed with a sanctions-list check on the address making a deposit. Whether it is switched on is still to decide. The Solana program has no such check. Neither pool can freeze, reverse or revoke a deposit once it is accepted, and neither checks withdrawals.',
    'Review. Two separate reviews attacked the code, one on the circuit and one on both pools. Neither found a way to steal, mint, double-spend or redirect a payout. The pool review found two ways to freeze funds; both are fixed and each fix has a test. These reviews are not an independent audit. The source is not published yet. Parts of it build on GPL-3.0 code, and the licence decision comes first.',
    'Gates before user funds. Public testnets, a setup ceremony with outside contributors to replace the development proving keys, and an independent audit with its findings resolved.',
  ]);
  assert.match(section, /The ZK pools are not deployed to any public network and have not been audited\. Their proving keys are development keys: whoever ran that setup could forge proofs\. Do not put real funds in them\./);
  for (const lead of ['Proof system.', 'Shield.', 'Private send.', 'Unshield.', 'Keys.', 'What it costs.', 'Admin powers.', 'Upgrades.', 'Screening.', 'Review.', 'Gates before user funds.']) {
    assert.ok((section.match(/<strong\b[^>]*>[^<]*<\/strong>/g) || []).some(tag => plain(tag) === lead), lead);
  }
  assert.match(section, /<pre\b[^>]*class="wp-formulas"><code\b/);
  assert.match(section, /Status: built/);
});

test('whitepaper v0.4 part 4 preserves fee, token, rewards and liquidity copy and section numbering', async () => {
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  const html = guides['/docs/whitepaper'];
  const section = id => html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] || '';
  const plain = text => text.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  const paragraphs = id => (section(id).match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).map(plain);
  const rows = id => (section(id).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []).map(row =>
    (row.match(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(plain));
  assert.deepEqual(paragraphs('revenue'), [
    'Four revenue lines: three are running today, and one is built into the ZK pools with its destination still proposed.',
    'What the pool does, and what is only planned. Built: ZK pool fees never sit inside a note balance and never make an existing note worth more. They build up in the pool, and anyone can sweep them, only to the one fee recipient fixed when the pool is deployed. Proposed: that recipient will be contracts that convert the fees to ZEC and $DARK and add them as liquidity to the ZEC-DARK pool on Meteora, with fees from Ethereum and Base bridged to Solana first. The design is that anyone can trigger each step and no step can send the fees anywhere else. Those contracts are not written yet. Because the recipient is fixed at deployment, they have to be written, audited and deployed before the pools go to mainnet.',
    "Provider and network costs come on top of DarkSwap's fees and are set by those providers. Fees and rewards exist only when people swap and trade $DARK.",
    'Holding $DARK does not create a claim on any of these fees.',
  ]);
  assert.deepEqual(rows('revenue').find(row => row[0] === 'Swap fee'), [
    'Swap fee', '0.40% partner fee on Privacy swap; 0.20% to DarkSwap',
    "DarkSwap's NEAR account, darkswapapp.near", 'live',
  ]);
  assert.deepEqual(rows('revenue').find(row => row[0] === 'ZK pool fee'), [
    'ZK pool fee',
    '0.5% on shield and on unshield in tests; none on private sends. The admin can change the rate, never above 1%',
    'One fee recipient fixed at deployment. Planned use: convert to ZEC and $DARK and add to ZEC-DARK liquidity',
    'builtproposed',
  ]);
  assert.match(section('revenue'), /aria-label="Status: built, proposed"/);
  assert.deepEqual(rows('dark-token'), [
    ['Mint', '7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3, on Solana, Token-2022 program'],
    ['Decimals', '6'],
    ['Supply', '999,851,915.57 $DARK'],
    ['Mint authority', 'None. No new $DARK can be created'],
    ['Freeze authority', 'None'],
    ['Transfer fee', 'None'],
    ['Metadata authority', "WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh. The token's name, symbol and image link can still be changed by this key"],
    ['Launch', 'StonkFun, on Raydium LaunchLab. Graduated October 1, 2026'],
    ['Main pool', '$DARK against wNEAR on Raydium, pool Cprsvqk2riV3WmTewKK9m6cm62zaAqLDArAbBmN3pe4f. RugCheck reports its liquidity tokens as 100% locked'],
    ['Creator fee', '1% of $DARK trades, paid in wNEAR through the launch platform'],
  ]);
  assert.deepEqual(paragraphs('dark-token'), [
    '$DARK token facts, read from the chain on October 6, 2026.',
    'Sources: RugCheck and Jupiter token data, October 6, 2026.',
  ]);
  assert.match(section('dark-token'), /class="wp-table wp-token-table"/);
  assert.match(section('dark-token'), /class="wp-note"/);
  assert.match(section('dark-token'), /Status: live/);
  const sidebar = html.match(/<aside\b[^>]*aria-label="Whitepaper sections">[\s\S]*?<\/aside>/)?.[0] || '';
  assert.match(sidebar, /href="#dark-token"/);
  assert.ok(plain(sidebar).includes('The $DARK token'));
  const numbering = [
    ['revenue', '07'], ['dark-token', '08'], ['rewards', '09'], ['liquidity', '10'],
    ['trust', '11'], ['limits', '12'], ['comparison', '13'], ['roadmap', '14'],
    ['risks', '15'], ['constants', '16'],
  ];
  let previous = -1;
  for (const [id, number] of numbering) {
    const start = html.indexOf(`id="${id}"`);
    assert.ok(start > previous, `${id} must follow the previous section`);
    previous = start;
    assert.match(section(id), new RegExp(`<span[^>]*class="docs-section-num"[^>]*>${number}</span>`));
  }
  assert.ok(paragraphs('rewards')[0].endsWith('So far the treasury half has gone into creating and funding the ZEC-DARK pool (section 10).'));
  const bullets = (section('rewards').match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || []).map(plain);
  assert.equal(bullets.length, 7);
  assert.deepEqual(bullets.slice(0, 4), [
    'What is split. Only creator-fee proceeds actually received, in wNEAR. Not all trading volume, router commissions or customer deposits. There is no buyback and burn of creator fees, and buying $DARK to pair in a liquidity pool is not burning it.',
    'Scheduled wNEAR payouts. At 6 a.m. and 6 p.m. America/Los_Angeles time, adjusting for daylight saving, sent direct with no claim step. Each payout uses a fresh snapshot taken at that payout. Background monitoring snapshots do not set the payout\'s weight and are not a countdown to an automatic ZEC payout.',
    'How to qualify. Hold at least 100,000 $DARK in the scheduled snapshot. Excluded wallets remain ineligible. Allocations are weighted by qualifying balances in that snapshot. Earlier awards keep the rules they were paid under.',
    'ZEC award, historical. A completed loyalty award distributed 1 ZEC token on Solana across 92 holders on October 5, 2026, weighted by holdings under its original checkpoint rules. Further ZEC awards require separate approval.',
  ]);
  assert.deepEqual(bullets.slice(4), [
    'Which wNEAR. wNEAR here is a token on Solana that represents NEAR (mint 3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG). It is the token $DARK trades against, and payouts are sent on Solana. It is not NEAR on the NEAR network. Its mint authority is active, which is normal for a bridged token and means its issuer can create more.',
    'Which ZEC. ZEC here is a token on Solana (mint A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS), not native or shielded Zcash. Market trackers list it as OmniBridge-bridged Zcash; DarkSwap has not verified its backing. Its mint authority is active. A matching ticker does not establish backing, redemption rights or shielding.',
    'Timing. Snapshots are taken at the published payout times. A wallet that holds 100,000 $DARK only around a snapshot qualifies the same as one that holds all day.',
  ]);
  const liquidity = paragraphs('liquidity');
  assert.ok(liquidity[0].endsWith('Pool address: 5Tyakzwn8BF9cqXE5NZB9C5FJPn5UapAZMGCpXcPvU1u.'));
  assert.equal(liquidity[1], "The pool was created and funded from the treasury half of the $DARK creator fee: $DARK was bought on the open market and paired with ZEC. DarkSwap reports the first funding as 2 ZEC spent on $DARK, paired with another 2 ZEC, and that the creator wallet supplied 99.9% of the pool's liquidity. The purchase and deposit transactions are on the creator wallet; until this paper links them, treat those figures as DarkSwap's own report. Funding is separate from position ownership and withdrawable liquidity: the creator-held position includes vested and permanently locked portions. On October 6, 2026, Meteora showed about 3.66 ZEC and 3.29 million $DARK in the pool, about $9,900 in total, of which about $258 was permanently locked. That is a dated reading, not a current balance, and balance growth alone does not prove compounded fee earnings.");
  assert.equal(liquidity[2], 'It is public trading liquidity. It is not the dark pool, it is not shielded, and its figures are separate from both the dark pool and the holder rewards.');
  assert.ok(liquidity[3].startsWith('Two inflows are planned on top of trading: further treasury ZEC from the creator-fee split'));
  assert.ok(liquidity[3].includes('(section 07)'));
});

test('whitepaper v0.4 part 5 preserves exact trust, privacy and comparison wording and source links', async () => {
  const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
  const html = guides['/docs/whitepaper'];
  const section = id => html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] || '';
  const plain = text => text.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  const paragraphs = id => (section(id).match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).map(plain);
  const rows = id => (section(id).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []).map(row =>
    (row.match(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(plain));
  assert.deepEqual(paragraphs('trust'), [
    'DarkSwap has two privacy tiers with two trust models.',
    "Other parties on both tiers: the routing providers that carry funds between chains, whose availability and terms are outside DarkSwap's control, and the chains themselves.",
    'On both tiers, privacy from the public is not privacy from a lawful request.',
  ]);
  assert.deepEqual(rows('trust'), [
    ['', 'Dark pool on NEAR', 'DarkSwap ZK pools'],
    ['Privacy from', "The public. Not from the operators of NEAR's private shard", 'The public and DarkSwap, by proof, for what happens inside the pool. Deposits and withdrawals are public'],
    ['How', 'Encrypted execution on a private shard with permissioned validators', 'Encrypted notes and zero-knowledge proofs built on your device'],
    ['Who holds funds', 'NEAR Intents; you authorise every action with your own wallet', "The pool contract; only the holder of a note's key can spend it. That key sits in your browser while the pool page is unlocked"],
    ['Screening', 'NEAR Intents screens funds as they enter, under its own rules', 'Asset listing and deposit limits set by the admin. Ethereum and Base: an optional sanctions-list check on the depositing address, set at deployment. Solana: none. Nothing can be frozen or revoked after a deposit is accepted'],
    ['Can withdrawals be stopped?', "Subject to NEAR Intents' availability and terms", 'No admin role can pause withdrawals. On Solana the upgrade authority could replace the program until it is behind a multisig with a delay or removed. The asset, the network or the deployment can still affect them'],
    ['What DarkSwap runs', 'The terminal only. The balance and the execution are on NEAR Intents', 'The terminal, the only relayer, the indexer, the admin key and, until it is removed or placed behind a multisig, the Solana upgrade authority'],
    ['If darkswap.app is down', 'Not confirmed that another front end can reach your balance', 'The contracts keep working. You need your 24 words, a copy of the client and a wallet with gas to submit. A standalone recovery page is not built yet'],
  ]);
  assert.deepEqual(paragraphs('limits'), [
    'Every tier hides activity in the middle. None hides the edges. Someone watching the chain can see that you deposited an amount and that someone withdrew an amount; the question is whether they can connect the two.',
    'No route or pool makes activity invisible. This paper does not claim otherwise, and neither should anyone describing it.',
  ]);
  assert.deepEqual((section('limits').match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || []).map(plain), [
    'Amount and timing. An unusual amount withdrawn soon after a matching deposit can be linked, on any tier. Common amounts and waiting help.',
    "Small pools hide less. In the ZK pools, a small pool is a small crowd to hide in. NEAR's confidential balances are encrypted per user rather than pooled, but edge correlation still applies.",
    'Deposits name their wallet. In the ZK pools every shield is public, with its amount and the wallet that paid.',
    "Network details. The site, DarkSwap's servers and relayer, and the RPC providers the page reads from can see your IP address and when you connect. A proof does not hide that.",
    'Your own habits. Reusing addresses, posting transaction details or withdrawing to a labelled wallet undoes privacy no system can restore.',
  ]);
  assert.match(section('limits'), /<strong[^>]*>Deposits name their wallet\.<\/strong>/);
  assert.match(section('limits'), /<strong[^>]*>Network details\.<\/strong>/);
  assert.deepEqual(paragraphs('comparison'), [
    "The two peers reviewed here each run their own pool on one chain, and both are deployed. DarkSwap's own pools are not deployed. What DarkSwap has live is private swap routing from Solana and holder payouts, on a network that already connects many chains.",
    'Peer columns are project-reported, checked October 4 to 6, 2026. Nullmask figures come from its own DefiLlama filings: the fees adapter and the TVL adapter. The ZeroTrace column comes from its own site and was not independently checked. “No public report identified” means none was found in this review; it does not mean none exists.',
  ]);
  assert.deepEqual(rows('comparison'), [
    ['', 'ZeroTrace', 'Nullmask', 'DarkSwap'],
    ['Chains', 'Robinhood Chain', 'EVM; pool on Ethereum', 'Live routes start on Solana and deliver to 8 networks through NEAR Intents (routes vary); ZK tier built for Solana, Ethereum and Base'],
    ['Privacy model', 'Zero-knowledge notes', 'Zero-knowledge notes, through a wallet proxy', 'Confidential routing live; confidential balances planned; zero-knowledge notes later'],
    ['Assets', 'ZERO only', 'Multi-asset', 'Assets supported by NEAR Intents, where a route is available'],
    ['Protocol fee', 'Not reviewed', '0.5% on deposits and 0.5% on withdrawals, per its own DefiLlama filing', '0.40% partner fee on Privacy swap, half to DarkSwap; ZK tier 0.5% on shield and unshield in tests, not live'],
    ['Holder payouts', 'Through the vault, to private notes', 'No holder payout stated; its filing counts all fees as protocol revenue', 'wNEAR paid direct to holders; one ZEC-token award paid'],
    ['Own pool deployed', 'Yes, by its own account', 'Yes; about $13.1k TVL on Oct 2, 2026, per its own filing', 'No. Built and tested on local chains only'],
    ['Live product', 'Deployed', 'Deployed', 'Private swaps live; dark pool planned'],
    ['Audit of own contracts', 'No public report identified', 'Its filing says an audit is in progress (October 2026); no public report identified', 'None yet; required before the ZK tier takes funds'],
  ]);
  assert.doesNotMatch(section('comparison'), /wp-tags|wp-tag-/);
  const links = (section('comparison').match(/<a\b[^>]*>[\s\S]*?<\/a>/g) || []);
  assert.equal(links.length, 2);
  for (const [index, url, label] of [
    [0, 'https://github.com/DefiLlama/dimension-adapters/pull/9855', 'fees adapter'],
    [1, 'https://github.com/DefiLlama/DefiLlama-Adapters/pull/21369', 'TVL adapter'],
  ]) {
    assert.ok(links[index].includes(`href="${url}"`));
    assert.match(links[index], /target="_blank"/);
    assert.match(links[index], /rel="noopener noreferrer"/);
    assert.equal(plain(links[index]), label);
  }
});

test('each public route has unique crawlable content and an absolute canonical', () => {
  const titles = new Set();
  for (const path of publicRoutes) {
    const html = renderPageHtml(template, path);
    const url = `https://darkswap.app${path}`;
    const title = html.match(/<title>(.*?)<\/title>/)?.[1];
    assert.ok(title, path);
    assert.ok(!titles.has(title), `duplicate title for ${path}`);
    titles.add(title);
    assert.match(html, /<h1>[^<]+<\/h1>/);
    assert.match(html, /<nav aria-label="Main navigation">/);
    assert.match(html, /<meta name="robots" content="index, follow"/);
    assert.ok(html.includes(`<link rel="canonical" href="${url}"`), path);
    assert.ok(html.includes(`<meta property="og:url" content="${url}"`), path);
    assert.match(html, /<meta property="og:site_name" content="DarkSwap"/);
    assert.match(html, /<meta name="twitter:description"/);
    assert.ok(!html.includes('<!--SEO_'), path);
  }
});

test('private and unknown URLs have no canonical or indexable order data', () => {
  for (const path of ['/order/sensitive-id', '/near-order', '/not-found', '/public-swap', ...previews]) {
    const html = renderPageHtml(template, path);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(html, /rel="canonical"|property="og:url"|sensitive-id/);
  }
});

test('confidential routing article is a classified public route with factual fallback content', async () => {
  const path = '/docs/confidential-routing';
  const routes = JSON.parse(await readFile(new URL('./src/seo-routes.json', import.meta.url), 'utf8'));
  const sitemap = await readFile(new URL('./public/sitemap.xml', import.meta.url), 'utf8');
  const app = await readFile(new URL('./src/App.tsx', import.meta.url), 'utf8');
  const html = renderPageHtml(template, `${path}/`);
  assert.ok(routes.indexable.includes(path));
  assert.ok(!routes.nonIndexable.includes(path));
  assert.ok(isKnownRoute(path));
  assert.ok(isKnownRoute(`${path}/`));
  assert.match(app, /<Route path="\/docs\/confidential-routing" component=\{ConfidentialRoutingDocs\}/);
  assert.ok(sitemap.includes(`<loc>https://darkswap.app${path}</loc>`));
  assert.match(html, /<title>Confidential routing and ZK shielding \| DarkSwap Docs<\/title>/);
  assert.match(html, /<h1>Confidential routing and ZK shielding<\/h1>/);
  assert.match(html, /private shard with independent, permissioned validators/);
  assert.match(html, /rather than client-side proof generation/);
  assert.match(html, /This is not a ZK shielded pool/);
  assert.match(html, /Zcash shielded pools use zero-knowledge proofs/);
  assert.match(html, /basic confidentiality for both its dry preview and deposit order/);
  assert.match(html, /transparent t1\/t3 only/);
  assert.match(html, /Not connecting a wallet is not a privacy guarantee/);
  assert.match(html, /October 1, 2026/);
  assert.match(html, /href="\/near-swap">Review Privacy swap/);
  assert.match(html, /href="\/docs#privacy">Privacy limitations/);
  assert.doesNotMatch(html, /export default|import\.meta|function ConfidentialRoutingDocs|private-query-value/);
  assert.match(renderPageHtml(template, '/docs'), /href="\/docs\/confidential-routing"/);
});

test('homepage and Privacy swap metadata describe reviewed routing, not wallet privacy or shielding', () => {
  const launch = renderPageHtml(template, '/');
  const swap = renderPageHtml(template, '/near-swap');
  assert.match(launch, /<h1>Go dark\. On NEAR Intents\.<\/h1>/);
  assert.match(launch, /ZK pools are built on local chains, not publicly deployed/);
  assert.match(launch, /Review a supported Solana-origin route, check fees and destination details/);
  assert.match(swap, /basic confidential processing/);
  assert.match(swap, /Confidential routing is not ZK shielding/);
  // The NEAR Intents positioning is intentional public copy since the partnership pivot.
  assert.match(swap, /NEAR Intents/);
  assert.doesNotMatch(swap, /wallet-free|Zashi/);
});

test('aliases point only to canonical routes', () => {
  for (const destination of Object.values(aliases)) assert.ok([...publicRoutes, ...previews].includes(destination));
});

test('tokenomics is paused: navigation points to the rewards site', async () => {
  const html = renderPageHtml(template, '/');
  const nav = html.match(/<nav aria-label="Main navigation">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav);
  assert.match(nav, /href="https:\/\/rewards\.darkswap\.app"/);
  assert.doesNotMatch(nav, /\/tokenomics|terminal-preview|founder|near-trends|near-discovery/);
  for (const path of ['/tokenomics', '/tokenomics/leaderboard']) {
    assert.equal(externalRedirects[path], 'https://rewards.darkswap.app');
    assert.ok(isKnownRoute(`${path}/`));
  }
  const routes = JSON.parse(await readFile(new URL('./src/seo-routes.json', import.meta.url), 'utf8'));
  const sitemap = await readFile(new URL('./public/sitemap.xml', import.meta.url), 'utf8');
  assert.ok(![...routes.indexable, ...routes.nonIndexable].some(path => path.startsWith('/tokenomics')));
  assert.doesNotMatch(sitemap, /tokenomics/);
  const swapUi = await readFile(new URL('./src/components/swap-ui.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(swapUi, /href="\/tokenomics"/);
  assert.match(swapUi, /href="https:\/\/rewards\.darkswap\.app"/);
});

test('landing retains navigation and current rewards boundaries', async () => {
  const launch = await readFile(new URL('./src/pages/launch.tsx', import.meta.url), 'utf8');
  const nav = launch.match(/<nav id="launch-navigation"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, 'landing must retain its accessible navigation');
  assert.match(nav, /href="\/swap"/);
  assert.match(nav, /href="\/near-swap"/);
  assert.match(nav, /href="https:\/\/rewards\.darkswap\.app"/);
  assert.doesNotMatch(nav, /\/tokenomics"|terminal-preview|founder|near-trends|near-discovery|Coming soon/);
  const footer = launch.match(/<footer className="[^"]*launch-footer[^"]*"[\s\S]*?<\/footer>/)?.[0];
  assert.match(footer || '', /href="\/docs"/);
  // Product cards and hero may link to Docs; top navigation stays concise.
  assert.doesNotMatch(nav, /\/docs/);
  assert.match(launch, /RiskDisclaimer showDocsLink=\{false\}/);
  assert.match(launch, /purchases ZEC tokens on Solana for the protocol treasury/);
  assert.match(launch, /fresh snapshot/);
  assert.doesNotMatch(launch, /compounded in the creator wallet|lowest balance|ZEC payouts have not|buyback and burn/i);
  // The NEAR Intents positioning must survive future copy edits.
  assert.match(launch, /Built on NEAR Intents/);
  assert.match(launch, /dark pool on NEAR/i);
  assert.match(launch, /<RewardsEstimate/);
  assert.doesNotMatch(launch, /704\.7|3,140,000|2,000,000 DARK|226\.25/);
  assert.match(launch, /https:\/\/rewards\.darkswap\.app/);
  assert.match(launch, /received \$DARK creator fees funds qualifying holders in wNEAR/);
  assert.doesNotMatch(launch, /No automatic snapshot system or payouts are active|PAYOUTS NOT LIVE|12-hour snapshots|qualifying week|targeting 20%|20% share of|3% holder-rewards|\$20-or-more|token and payouts are not live/);
});

test('official DARK identity is exact and does not activate rewards or holder data', async () => {
  const identity = JSON.parse(await readFile(new URL('./src/token-identity.json', import.meta.url), 'utf8'));
  const address = '7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3';
  assert.equal(identity.address, address);
  assert.equal(identity.chain, 'Solana');
  assert.equal(identity.explorerUrl, `https://solscan.io/token/${address}`);
  assert.equal(identity.listingUrl, `https://www.stonkfun.xyz/token/${address}`);
});
