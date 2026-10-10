import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const guides = JSON.parse(await readFile(new URL('./dist/public-guides.json', import.meta.url), 'utf8'));
const html = guides['/docs/whitepaper'];
const section = id => html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))?.[0] || '';
const plain = text => text.replace(/<[^>]+>/g, '').replaceAll('&#x27;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
const paragraphs = id => (section(id).match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).map(plain);
const rows = id => (section(id).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g) || []).map(row =>
  (row.match(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/g) || []).map(plain));

test('final whitepaper roadmap and risks use exact owner copy without duplicate additions', () => {
  assert.deepEqual(rows('roadmap'), [
    ['Stage', 'What'],
    ['Live', 'Private swaps from Solana through NEAR Intents (with a partner fee) and the sponsored privacy swap by Houdini. wNEAR payouts and one ZEC-token award to $DARK holders. The ZEC-DARK pool on Meteora.'],
    ['On the site', 'The ZK pool terminal at darkswap.app/pool, a local-development preview, not deployed on any public network.'],
    ['Next', "The dark pool on NEAR Confidential Intents. Target late October 2026, subject to NEAR enabling access; beta on mainnet with DarkSwap's own funds first."],
    ['Built, held back', 'Our own ZK pools for Solana, Ethereum and Base. No date is set. In order: public testnets; the two circuit decisions; the fee recipient contracts, which must exist before the pools because the recipient is fixed at deployment; a setup ceremony with outside contributors; an independent audit with its findings resolved; then mainnet with deposit caps.'],
    ['Not built yet', 'Viewing keys, a standalone recovery page, swaps inside the ZK pools, and funding the Ethereum and Base pools from Solana.'],
  ]);
  assert.deepEqual(paragraphs('roadmap'), ['Targets move; the gates do not.']);
  assert.match(section('roadmap'), /Status: live, scheduled, built/);
  const expected = [
    ['The dark pool depends on NEAR.', "DarkSwap's access to the confidential balance integration is not confirmed yet. NEAR can change its terms, fees or availability."],
    ['Confidential is not zero-knowledge.', "The NEAR tier hides activity from the public, not from the operators of NEAR's private shard."],
    ['No test environment for NEAR Intents.', "Testing happens on mainnet with small amounts of DarkSwap's own funds."],
    ['The ZK tier is unaudited and not deployed.', 'It has run on local chains only, with development proving keys.'],
    ['Routes vary.', 'Not every asset pair has a live route, and providers can pause routes.'],
    ['Revenue depends on use.', 'Fees, rewards and liquidity inflows exist only when people swap and trade $DARK.'],
    ['Market risk.', '$DARK, wNEAR and ZEC prices move; reward values and pool liquidity move with them.'],
    ['Legal.', 'No legal opinion has been obtained. Privacy tools draw regulatory attention.'],
    ['Your key sits in the browser.', 'On the ZK tier, the pool page holds your spending key while it is unlocked. A compromised or look-alike site can spend your notes.'],
    ['Trusted setup.', "Groth16 needs a setup ceremony. If every contributor to it colluded or was compromised, proofs could be forged. Today's keys were made on one machine and are for development only."],
    ['Solana upgrade authority.', 'Until it is behind a multisig with a delay or removed, its holder can replace the Solana pool program.'],
    ['One relayer.', 'DarkSwap runs the only relayer. If it is down, you submit from your own wallet, which pays gas and is public as the sender.'],
    ['Bridged tokens.', 'The wNEAR and ZEC used for rewards and liquidity are bridged tokens on Solana. Their value depends on the bridge that issues them, and their issuers can create more.'],
    ['Launch platform.', 'The $DARK creator fee is paid through the platform $DARK launched on. DarkSwap does not control that platform, and a change there would change the payouts.'],
    ['Snapshot timing.', 'Payout snapshots are taken at published times, so wallets that hold only around a snapshot dilute long-term holders.'],
    ['Token metadata.', '$DARK has no mint or freeze authority, but its name, symbol and image link can still be changed by the metadata authority.'],
  ];
  assert.deepEqual((section('risks').match(/<li\b[^>]*>[\s\S]*?<\/li>/g) || []).map(plain),
    expected.map(([lead, text]) => `${lead} ${text}`));
  assert.deepEqual((section('risks').match(/<strong\b[^>]*>[\s\S]*?<\/strong>/g) || []).map(plain),
    expected.map(([lead]) => lead));
});

test('final key numbers keep exact values, row order, status tags and closing copy', () => {
  assert.deepEqual(rows('constants'), [
    ['Item', 'Value', 'Status'],
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
  ]);
  assert.deepEqual(paragraphs('constants'), [
    'The figures in this paper, with their status. A built or proposed number is a design value, not a commitment.',
    'It is a summary for information only. It is not an offer to sell tokens or securities, and it is not investment advice. DarkSwap is built on NEAR Intents and is not endorsed by NEAR Foundation. Questions and corrections: darkswap.app/help.',
  ]);
  const statusTags = (section('constants').match(/<span\b[^>]*class="wp-tag wp-tag-[^"]+"[^>]*>[\s\S]*?<\/span>/g) || []);
  assert.equal(statusTags.length, 13);
  for (const tag of statusTags) assert.ok(tag.includes(`class="wp-tag wp-tag-${plain(tag)}"`));
});

test('whole whitepaper has 16 ordered unique sections, complete sidebar and correct cross references', () => {
  const blocks = html.match(/<section\b[^>]*class="docs-section wp-section"[^>]*>[\s\S]*?<\/section>/g) || [];
  const ids = blocks.map(block => block.match(/\bid="([^"]+)"/)?.[1]);
  assert.deepEqual(ids, ['summary', 'problem', 'architecture', 'swaps', 'darkpool', 'zk', 'revenue', 'dark-token',
    'rewards', 'liquidity', 'trust', 'limits', 'comparison', 'roadmap', 'risks', 'constants']);
  assert.deepEqual(blocks.map(block => plain(block.match(/<span\b[^>]*class="docs-section-num"[^>]*>[\s\S]*?<\/span>/)?.[0] || '')),
    Array.from({ length: 16 }, (_, index) => String(index + 1).padStart(2, '0')));
  const titles = blocks.map(block => plain(block.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/)?.[0] || ''));
  assert.equal(new Set(titles).size, 16);
  assert.equal(titles[7], 'The $DARK token');
  assert.equal(titles[15], 'Key numbers');
  const sidebar = html.match(/<aside\b[^>]*aria-label="Whitepaper sections">[\s\S]*?<\/aside>/)?.[0] || '';
  assert.deepEqual([...sidebar.matchAll(/href="#([^"]+)"/g)].map(match => match[1]), ids);
  assert.deepEqual(plain(html).match(/section \d+/g), ['section 10', 'section 07']);
  const prose = blocks.flatMap(block => (block.match(/<(p|li)\b[^>]*>[\s\S]*?<\/\1>/g) || []).map(plain)).filter(text => text.length > 120);
  assert.equal(new Set(prose).size, prose.length, 'long prose blocks must not be duplicated');
});

test('llms retains v0.4 and uses exactly one generic partner route line', async () => {
  const llms = await readFile(new URL('./public/llms.txt', import.meta.url), 'utf8');
  assert.match(llms, /Whitepaper v0\.4/);
  assert.deepEqual(llms.split('\n').filter(line => line.startsWith('- Private swaps from Solana:')), [
    '- Private swaps from Solana: Privacy swap on the NEAR Intents 1Click API with confidential handling, and a second partner route. https://darkswap.app/swap',
  ]);
});
