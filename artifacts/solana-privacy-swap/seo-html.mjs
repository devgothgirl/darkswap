import seoRoutes from './src/seo-routes.json' with { type: 'json' };

// Public, non-personal page summaries. Keep these aligned with the page copy in src/pages.
// Never include quotes, wallet state, order IDs or account details in this document.
const origin = seoRoutes.origin;
const image = `${origin}/brand/social-share-private-swaps.jpg`;
const indexablePaths = new Set(seoRoutes.indexable);

const pages = {
  '/': {
    title: 'DarkSwap | Solana-origin private swaps',
    description: 'Compare Solana-origin private routes, review a live quote, then decide whether to deposit manually. No wallet connection is required; route availability varies.',
    heading: 'Move value. Leave less behind.',
    paragraphs: [
      'A deposit-based route for Solana holders who want more separation between the wallet they send from and where assets arrive.',
      'DarkSwap prepares the order. You review the quote and deposit manually from your own wallet if you choose. Availability, fees and timing vary by route.',
    ],
  },
  '/swap': {
    title: 'Private swap route from Solana | DarkSwap',
    description: 'Compare a live private Solana-origin swap or bridge quote, review destination and fees, and choose whether to send a manual deposit. No wallet connection.',
    heading: 'Move value. Leave less behind.',
    paragraphs: ['A quieter way out of Solana. Compare a live private route, choose where your assets land, then send from any Solana wallet. Nothing to connect here.', 'Choose a Solana asset, review the live quote and recipient carefully, then create an order to see deposit instructions. A quote is not a guarantee of availability.'],
  },
  '/near-swap': {
    title: 'Privacy swap from Solana | DarkSwap',
    description: 'Request a Solana-origin privacy swap route, inspect its live terms and choose whether to fund a manual deposit. No wallet connection or automatic transfer.',
    heading: 'Review the route. Then decide.',
    paragraphs: ['A wallet-free way to prepare a Solana-origin swap. Request a confidential-mode route, inspect its terms, and decide whether to fund it yourself.', 'Check the receiving address, refund address, destination network, minimum amount and deadline against the live quote before you send. Privacy is not anonymity.'],
  },
  '/docs': {
    title: 'Private swaps & cross-chain terminal | DarkSwap Docs',
    description: 'Understand DarkSwap’s live private swaps and planned cross-chain trading terminal with NEAR Intents. Read about the demo, deposits, safety and privacy limits.',
    heading: 'Private swaps today. A terminal in development.',
    paragraphs: ['DarkSwap offers live Solana-origin private swap routes and is developing a cross-chain trading terminal with NEAR Intents. The current terminal is a read-only demo with fictional tokens and simulated calculations, not live trading.', 'The existing private route and Privacy swap use manual deposits and require their own live quotes. Neither requires a wallet connection or an account for guest orders. A supported asset does not guarantee an executable route.', 'Creating an order does not transfer funds. Check the active deposit instructions and do not send a second payment to fix a delayed deposit. Solana deposits remain visible on-chain; no route guarantees anonymity.'],
    links: [['/tokenomics', 'Tokenomics and holder rewards'], ['/swap', 'Existing private route'], ['/near-swap', 'Privacy swap'], ['/help', 'Deposit help']],
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
  '/tokenomics': {
    title: '$DARK tokenomics & holder streaks | DarkSwap',
    description: 'Understand the planned DARK flywheel: NEAR holder rewards, three-day ZEC loyalty streaks, and a 50/50 team-reward split for streak bonuses and buyback + burn.',
    heading: 'Hold for the long term. Understand the flywheel.',
    paragraphs: ['DARK is not launched. The planned StonkFun model distributes fee-derived NEAR rewards to eligible holders, subject to verified provider rules. Rewards accrued by the DARK team are proposed to split 50% into holder-streak bonuses and 50% into DARK buyback + burn.', 'Additional ZEC streak rewards are planned after three qualifying days, once a treasury pool is built and funded. Daily progression and compounding are proposed; the exact formula and rates are undecided, not a guaranteed yield.', 'No verified mint, treasury addresses, or holder statistics are connected. Treasury balances, payouts, burns, and liquidity statistics are unavailable rather than assumed to be zero. This holder program is separate from non-cash email account points.'],
    links: [['/tokenomics/leaderboard', '$DARK holdings leaderboard'], ['/docs', 'Route and safety documentation'], ['/rewards', 'Separate email account points']],
  },
  '/terminal-preview': {
    title: 'Founder terminal preview | DarkSwap',
    description: 'Preview the planned cross-chain trading terminal with NEAR Intents. Fictional tokens and simulated orders only; no wallet connection or live execution.',
    heading: 'Cross-chain trading terminal with NEAR Intents — founder preview',
    paragraphs: ['A read-only founder demo with fictional tokens and simulated calculations. It does not execute trades or fund an order.'],
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
  '/tokenomics/leaderboard': {
    title: '$DARK Holdings Leaderboard | DarkSwap',
    description: 'The prelaunch home for wallets ranked by $DARK holdings, highest first. Rankings are unavailable until the mint is confirmed and verified holder data is connected.',
    heading: '$DARK holdings leaderboard',
    paragraphs: ['Wallet rankings will be ordered by $DARK holdings, highest first. The token has not launched and its mint is unconfirmed, so no wallet rankings or balances are published.', 'Holdings rankings do not establish loyalty eligibility or guarantee rewards. The snapshot-based streak checker remains on hold.'],
    links: [['/tokenomics', 'Back to tokenomics']],
  },
};

export const aliases = {
  '/index.html': '/',
  '/splitwise-preview': '/split-mixer-preview',
  '/screener-preview': '/screener-beta',
};

const nav = [['/', 'Home'], ['/swap', 'Private route'], ['/near-swap', 'Privacy swap'], ['/tokenomics', 'Tokenomics'], ['/docs', 'Docs']];
const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function renderPageHtml(template, pathname) {
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  const page = pages[path];
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
    <style>#seo-static{min-height:100vh;box-sizing:border-box;background:#17111f;color:#f5eefb;font:18px/1.6 system-ui,sans-serif;padding:3rem max(24px,calc((100vw - 1050px)/2))}#seo-static a{color:#d9b5ff}#seo-static nav{display:flex;flex-wrap:wrap;gap:1rem}#seo-static h1{font-size:clamp(2.5rem,6vw,5rem);line-height:1.1;max-width:800px;margin:3rem 0 1.5rem}#seo-static p{max-width:760px}</style>`;
  const body = page
    ? `<div id="seo-static"><header><a href="/">DarkSwap</a><nav aria-label="Main navigation">${nav.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav></header><main><h1>${escapeHtml(page.heading)}</h1>${page.paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join('')}${page.links ? `<section><h2>Explore more</h2><ul>${page.links.map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join('')}</ul></section>` : ''}</main><footer><a href="/docs">Read the guide</a> · <a href="/help">Get help</a></footer></div>`
    : '<div id="seo-static"><main><h1>Open DarkSwap</h1><p>This address is not a public page. Return to the homepage to review available routes.</p><a href="/">DarkSwap home</a></main></div>';
  return template.replace('<!--SEO_HEAD-->', head).replace('<!--SEO_CONTENT-->', body);
}

// Keep client-side navigations in sync with the initial response's page identity.
export function applyPageMetadata(pathname) {
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : '/';
  const page = pages[path];
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