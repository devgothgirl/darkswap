import seoRoutes from './src/seo-routes.json' with { type: 'json' };
import darkToken from './src/token-identity.json' with { type: 'json' };
import poolPaths from './src/pool/routes.json' with { type: 'json' };

// Public, non-personal page summaries. Keep these aligned with the page copy in src/pages.
// Never include quotes, wallet state, order IDs or account details in this document.
const origin = seoRoutes.origin;
const image = `${origin}/brand/social-share-private-swaps.jpg`;
const indexablePaths = new Set(seoRoutes.indexable);

const pages = {
  ...Object.fromEntries(poolPaths.map(path => [path, {
    title: path === '/pool/what-stays-public' ? 'What stays public | DarkSwap Pool (testnet)' : `DarkSwap Pool (testnet)${path === '/pool' ? '' : ` | ${path.split('/').at(-1)}`}`,
    description: 'Experimental shielded pool on testnet. Development proving keys. Do not deposit real funds. Read what stays public and the limits of pool privacy.',
    heading: path === '/pool/what-stays-public' ? 'What stays public' : 'Shielded pool (testnet)',
    paragraphs: ['Testnet. Development proving keys. Do not deposit real funds.', 'Deposits and withdrawals remain public. Amounts, timing and a small pool can make activity easy to match. No anonymity guarantee.'],
    links: [['/pool/what-stays-public', 'What stays public: safety and privacy limits']],
  }])),
  '/': {
    title: 'DarkSwap | Private swaps from Solana, built on NEAR Intents',
    description: 'Quote, review and fund Solana-origin private swaps yourself. DarkSwap’s Privacy swap is built on NEAR Intents. Route availability and privacy limits vary.',
    heading: 'Swap through Privacy Routers.',
    paragraphs: [
      'Review a supported Solana-origin route, check fees and destination details, then send your deposit from your own wallet.',
      'Privacy swap, DarkSwap’s confidential-routing route, is built on the NEAR Intents 1Click API, and the planned cross-chain terminal is being built on NEAR Intents too.',
      'DarkSwap prepares the order. You review the quote and deposit manually from your own wallet if you choose. Availability, fees and timing vary by route.',
      'StonkFun reports DARK graduated with a NEAR pairing and market activity. wNEAR rewards have been distributed to qualifying holders on Solana; ZEC rewards remain planned.',
    ],
  },
  '/swap': {
    title: 'Private swap route from Solana | DarkSwap',
    description: 'Compare a live private Solana-origin swap or bridge quote, review destination and fees, and choose whether to send a manual deposit.',
    heading: 'Swap from Solana to another chain.',
    paragraphs: ['Live quote, your review, a manual deposit. Pick a Solana asset and a destination, review the estimate, fee and address, then send the exact amount from your own wallet.', 'Choose a Solana asset, review the live quote and recipient carefully, then create an order to see deposit instructions. A quote is not a guarantee of availability.'],
  },
  '/near-swap': {
    title: 'Privacy swap on NEAR Intents: confidential routing from Solana | DarkSwap',
    description: 'Review a Solana-origin route built on NEAR Intents with basic confidential processing, check fees and destination details, then choose whether to fund a manual deposit from your wallet.',
    heading: 'Review the route. Then decide.',
    paragraphs: ['Request a Solana-origin route with basic confidential processing through the NEAR Intents 1Click API, inspect its terms, and decide whether to fund it yourself. Confidential routing is not ZK shielding.', 'Check the receiving address, Solana refund address, destination network, minimum amount and deadline against the live quote before you send. Public deposits and destination activity may still be associated; privacy is not anonymity.'],
  },
  '/docs': {
    title: 'Private swaps & cross-chain terminal | DarkSwap Docs',
    description: 'Understand DarkSwap’s live private swaps and planned cross-chain trading terminal with NEAR Intents. Read about the demo, deposits, safety and privacy limits.',
    heading: 'Private swaps today. A terminal in development.',
    paragraphs: ['DarkSwap offers live Solana-origin private swap routes and is developing a cross-chain trading terminal with NEAR Intents. The current terminal is a read-only demo with fictional tokens and simulated calculations, not live trading.', 'The existing private route and Privacy swap use manual deposits and require their own live quotes. Neither requires a wallet connection or an account for guest orders. A supported asset does not guarantee an executable route.', 'Creating an order does not transfer funds. Check the active deposit instructions and do not send a second payment to fix a delayed deposit. Solana deposits remain visible on-chain; no route guarantees anonymity.', 'StonkFun reports DARK graduated with a NEAR pairing and market activity. The reported creator fee is 1%, paid only in wNEAR, not DARK; configuration and claim authority remain unverified. wNEAR airdrops to qualifying DARK holders are live on Solana, with ZEC scheduled for day 3 of each 3-day cycle; the other half of the creator fee is converted to ZEC and compounded in the creator wallet. Non-cash account points are separate.'],
    links: [['/docs/whitepaper', 'Whitepaper in plain language'], ['/docs/confidential-routing', 'Confidential routing and ZK shielding'], ['https://rewards.darkswap.app', '$DARK holder rewards'], ['/swap', 'Existing private route'], ['/near-swap', 'Privacy swap'], ['/help', 'Deposit help']],
  },
  '/docs/whitepaper': {
    title: 'Whitepaper in plain language | DarkSwap Docs',
    description: 'A reader-friendly edition of the DarkSwap whitepaper v0.2: live private swaps, the planned Dark Pool on Base, $DARK holder rewards, the trust model and the accepted privacy limits.',
    heading: 'The DarkSwap whitepaper, in plain language',
    paragraphs: [
      'Based on the DarkSwap whitepaper, v0.2, October 2026. Every section carries the same status tag the technical draft uses: live, testnet, scheduled or proposed. Live means deployed and used with real funds; proposed means designed with no owner or date, and likely to change.',
      'Live today: two Solana-origin private swap routes, with manual deposits you send yourself. Holder rewards have been paid in wNEAR directly to eligible $DARK wallets. ZEC rewards remain planned and have not been paid.',
      'The Dark Pool is a planned shielded pool on Base holding ETH, USDC and USDT, which Solana users can fund without holding ETH. Transfers inside the pool hide sender, recipient and amount; deposits and exits remain public. The pool fee is 0.5% on shielding and unshielding, with a 1% contract cap. Contracts are planned to be immutable and have not been independently audited.',
      'Accepted limits are stated, not minimised: a small pool at launch can still be correlated by amount and timing, round lots and a 2 to 24 hour exit delay reduce that but do not remove it, and no route or pool makes activity invisible. Three items are withheld from this edition until the owner confirms them.',
    ],
    links: [['/docs', 'Back to Docs'], ['/docs/confidential-routing', 'Confidential routing and ZK shielding'], ['/docs#privacy', 'Privacy limitations'], ['/swap', 'Existing private route']],
  },
  '/docs/confidential-routing': {
    title: 'Confidential routing and ZK shielding | DarkSwap Docs',
    description: 'Understand private-shard confidential processing versus Zcash ZK shielding, what DarkSwap Privacy swap supports, and the trust boundary and public-transfer limits.',
    heading: 'Confidential routing and ZK shielding',
    paragraphs: [
      'Confidential routing adds restricted processing to a cross-chain swap. NEAR describes encryption and restricted visibility in a private shard with independent, permissioned validators, rather than client-side proof generation. This is not a ZK shielded pool.',
      'Zcash shielded pools use zero-knowledge proofs to validate transfers without publicly revealing protected details. Galaxy’s November 4, 2025 Zcash and Zashi research is context, not evidence that DarkSwap integrates Zashi or shields funds.',
      'Privacy swap requests basic confidentiality for both its dry preview and deposit order. Funding is a manual Solana deposit after quote review, with a recipient and Solana refund address. There is no advanced-mode UI, confidential wallet balance, or native Zcash destination in this route. The provider’s broader Zcash support is transparent t1/t3 only.',
      'Solana deposits are public and destination transfers may be public. Provider records, amounts, timing and external data may associate activity. Not connecting a wallet is not a privacy guarantee. Original guide reviewed October 1, 2026.',
    ],
    links: [['/near-swap', 'Review Privacy swap'], ['/docs', 'Back to Docs'], ['/docs#privacy', 'Privacy limitations']],
  },
  '/help': {
    title: 'Help & reviewed answers | DarkSwap',
    description: 'Find reviewed answers about DarkSwap deposits, order status and recovery. Keep your order details, do not resend funds, and report unresolved issues.',
    heading: 'Know what to do. And what not to.',
    paragraphs: ['Clear guidance for deposits, order status, and recovery. Search reviewed answers first; report what is unresolved.', 'If a deposit appears delayed, stop and do not resend. Save your order reference and transaction hash. Recovery is not guaranteed. The active order page is the source of truth.'],
    links: [['/docs', 'Read the route guide'], ['/swap', 'Existing private route']],
  },
  '/previews': {
    title: 'Founder preview directory | DarkSwap',
    description: 'Explore DarkSwap research and planning concepts, including Screener Beta, Split Mixer and Privacy Bundle. Previews do not initiate a transfer or quote.',
    heading: 'Founder previews.',
    paragraphs: ['Explore what we are working on without confusing a draft with a live route. The existing private route and Privacy swap are the open Solana-origin transaction flows.', 'Previews are for exploration. No wallet connection, payment, funding, or launch transaction is initiated here.'],
    links: [['/screener-beta', 'Screener Beta'], ['/split-mixer-preview', 'Split Mixer for Solana'], ['/privacy-bundle-preview', 'Privacy Bundle for Launchers']],
  },
  '/founder': {
    title: 'Founder previews | DarkSwap',
    description: 'Explore DarkSwap founder previews: a read-only cross-chain trading terminal with NEAR Intents, research tools and planning concepts. Not live terminal trading.',
    heading: 'Founder previews.',
    paragraphs: ['A public preview area for founders and early supporters. The terminal uses fictional tokens and simulated orders; live terminal trading is not enabled.', 'Research tools show third-party market data, not execution guarantees. Planning tools do not move, pool, mix or hide funds.'],
    links: [['/terminal-preview', 'Cross-chain trading terminal with NEAR Intents'], ['/near-trends', 'NEAR market research'], ['/near-discovery', 'NEAR pool discovery']],
  },
  '/terminal-preview': {
    title: 'Founder terminal preview | DarkSwap',
    description: 'Preview the planned cross-chain trading terminal with NEAR Intents. Fictional tokens and simulated orders only; no wallet connection or live execution.',
    heading: 'Cross-chain trading terminal with NEAR Intents — founder preview',
    paragraphs: ['A read-only founder demo with fictional tokens and simulated calculations. It does not execute trades or fund an order.', 'Separately, wNEAR rewards have been distributed to qualifying DARK holders; ZEC payouts to holders remain planned. StonkFun reports DARK graduated; the reported 1% creator-fee configuration and claim authority remain unverified. The arbitrary 0.3% demo fee is not a live quote or the reported creator fee.'],
    links: [['/founder', 'All founder previews']],
  },
  '/screener-beta': {
    title: 'Screener Beta for Solana assets | DarkSwap',
    description: 'Search a dated provider-reported Solana xStock and PreStock catalog for research. Listings are not live quotes, verification or investment advice.',
    heading: 'Screener Beta',
    paragraphs: ['Search a dated provider-reported Solana asset catalog for research. Listings and backing are not independently verified. Research does not connect a wallet or initiate a trade.'],
  },
  '/split-mixer-preview': {
    title: 'Split Mixer for Solana preview | DarkSwap',
    description: 'Draft recipient allocations and intended Solana legs in a planning preview. It does not pool funds, hide on-chain links or initiate transfers.',
    heading: 'Split Mixer for Solana.',
    paragraphs: ['Draft recipient allocations and intended legs manually or with CSV. This preview does not pool or mix funds, hide on-chain links, or connect to a provider.'],
  },
  '/privacy-bundle-preview': {
    title: 'Privacy Bundle for Launchers preview | DarkSwap',
    description: 'Explore a launch-planning concept with a 1–12 hour funding window. The preview does not schedule or randomize transfers or guarantee privacy.',
    heading: 'Privacy Bundle for Launchers.',
    paragraphs: ['Choose a 1–12 hour planning horizon and create a conceptual brief. It does not schedule or randomize transfers, and clean wallets do not guarantee privacy.'],
  },
  '/near-trends': {
    title: 'NEAR pool trends | DarkSwap',
    description: 'Explore public NEAR liquidity pool activity and compare 24-hour signals. Trending is not a safety assessment, endorsement or live swap quote.',
    heading: 'Watch the market. Keep your judgment.',
    paragraphs: ['Explore activity across NEAR liquidity pools. Search tokens, compare 24-hour signals, and inspect the pool behind each listing.', 'Trending means activity, not quality or safety. Verify token and pool addresses before making any decision.'],
  },
  '/near-discovery': {
    title: 'NEAR pool discovery | DarkSwap',
    description: 'Discover NEAR liquidity pools and inspect public market data. Listings are not verified tokens, a safety assessment or an executable route.',
    heading: 'Find the pool, not hype.',
    paragraphs: ['Explore public NEAR pool data for research, not a live swap quote. Listings do not verify a token or guarantee a route.'],
  },
  '/rewards': {
    title: 'Optional rewards | DarkSwap',
    description: 'Learn about optional DarkSwap email rewards and their privacy tradeoffs. Guest swaps remain unlinked; planned points are not a guaranteed payout.',
    heading: 'Privacy first. Recognition by choice.',
    paragraphs: ['Rewards are optional. Guest orders remain unlinked; linking a new order to an email account at creation can reduce privacy. Planned rewards are not a guaranteed payout.'],
  },
};

export const aliases = {
  '/index.html': '/',
  '/splitwise-preview': '/split-mixer-preview',
  '/screener-preview': '/screener-beta',
};

// Tokenomics is paused until the ZEC airdrop starts; its old URLs temporarily redirect to the rewards site.
const rewardsSite = 'https://rewards.darkswap.app';
export const externalRedirects = seoRoutes.externalRedirects;

const nav = [['/', 'Home'], ['/swap', 'Swap'], [rewardsSite, 'Rewards'], ['/docs', 'Docs']];
const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Private client routes are valid URLs, but never receive personal initial HTML.
export function isKnownRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return Object.hasOwn(pages, path) || Object.hasOwn(aliases, path) || Object.hasOwn(externalRedirects, path)
    || ['/near-order', '/explore', '/privacy-terminal', '/public-swap'].includes(path)
    || /^\/order\/[^/]+$/.test(path);
}

export function renderPageHtml(template, pathname, publicGuides = {}, researchHtml = '') {
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  const page = Object.hasOwn(pages, path) ? pages[path] : undefined;
  const indexable = indexablePaths.has(path);
  const title = page?.title ?? 'DarkSwap | Page unavailable';
  const description = page?.description ?? 'Open DarkSwap to review available Solana-origin routes and documentation.';
  const url = indexable ? `${origin}${path}` : null;
  const head = `<title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${indexable ? 'index, follow' : 'noindex, nofollow'}" />
    ${url ? `<link rel="canonical" href="${url}" />` : ''}
    <meta property="og:site_name" content="DarkSwap" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${url ? `<meta property="og:url" content="${url}" />` : ''}
    <meta property="og:image" content="${image}" />
    <meta property="og:image:alt" content="DarkSwap Private Swaps banner" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${image}" />
    <style>#seo-static{min-height:100vh;box-sizing:border-box;background:#17111f;color:#f5eefb;font:18px/1.6 system-ui,sans-serif;padding:3rem max(24px,calc((100vw - 1050px)/2))}#seo-static a{color:#d9b5ff}#seo-static nav{display:flex;flex-wrap:wrap;gap:1rem}#seo-static h1{font-size:clamp(2.5rem,6vw,5rem);line-height:1.1;max-width:800px;margin:3rem 0 1.5rem}#seo-static p{max-width:760px;overflow-wrap:anywhere}</style>`;
  const body = page
    ? `<div id="seo-static"><header><a href="/">DarkSwap</a><nav aria-label="Main navigation">${nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav></header><main><h1>${escapeHtml(page.heading)}</h1>${page.paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join('')}${page.links ? `<section><h2>Explore more</h2><ul>${page.links.map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join('')}</ul></section>` : ''}</main><footer><a href="/docs">Read the guide</a> · <a href="/help">Get help</a></footer></div>`
    : '<div id="seo-static"><main><h1>Open DarkSwap</h1><p>This address is not a public page. Return to the homepage to review available routes.</p><a href="/">DarkSwap home</a></main></div>';
  const content = Object.hasOwn(publicGuides, path) ? publicGuides[path] : undefined;
  return template.replace('<!--SEO_HEAD-->', head).replace('<!--SEO_CONTENT-->', content
    ? `<div class="app-shell">${path === '/help' ? `<nav aria-label="Main navigation">${nav.map(([href, label]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('')}</nav>` : ''}${content}</div>`
    : (researchHtml && ['/near-trends', '/near-discovery'].includes(path) ? body.replace('</main>', `${researchHtml}</main>`) : body));
}

// Keep client-side navigations in sync with the initial response's page identity.
export function applyPageMetadata(pathname) {
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  const page = Object.hasOwn(pages, path) ? pages[path] : undefined;
  const indexable = indexablePaths.has(path);
  const title = page?.title ?? 'DarkSwap | Page unavailable';
  const description = page?.description ?? 'Open DarkSwap to review available Solana-origin routes and documentation.';
  document.title = title;
  const setMeta = (attribute, name, content) => {
    const selector = `meta[${attribute}="${name}"]`;
    let element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, name);
      document.head.append(element);
    }
    element.setAttribute('content', content);
  };
  setMeta('name', 'description', description);
  setMeta('name', 'robots', indexable ? 'index, follow' : 'noindex, nofollow');
  for (const [name, value] of Object.entries({
    'og:title': title, 'og:description': description,
    'twitter:title': title, 'twitter:description': description,
  })) {
    setMeta(name.startsWith('og:') ? 'property' : 'name', name, value);
  }
  const url = indexable ? `${origin}${path}` : null;
  let canonical = document.head.querySelector('link[rel="canonical"]');
  let socialUrl = document.head.querySelector('meta[property="og:url"]');
  if (!url) {
    canonical?.remove();
    socialUrl?.remove();
  } else {
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.append(canonical);
    }
    canonical.setAttribute('href', url);
    if (!socialUrl) {
      socialUrl = document.createElement('meta');
      socialUrl.setAttribute('property', 'og:url');
      document.head.append(socialUrl);
    }
    socialUrl.setAttribute('content', url);
  }
}