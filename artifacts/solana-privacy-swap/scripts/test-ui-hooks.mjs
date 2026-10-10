// Module hooks for UI tests run under node's test runner. In the app, Vite
// handles stylesheets and import.meta.env; a test render needs only markup.
const privyStub = new URL('./test-privy-stub.mjs', import.meta.url).href;
const viteEnv = `(${JSON.stringify({ BASE_URL: '/', MODE: 'test', DEV: false, PROD: false, SSR: false })})`;

export async function resolve(specifier, context, next) {
  if (/\.css(?:\?.*)?$/.test(specifier)) return { url: 'data:text/javascript,', shortCircuit: true };
  // Rewards sign-in is optional; tests render the signed-out context, never the Privy SDK.
  if (specifier === '@privy-io/react-auth') return { url: privyStub, shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  const result = await next(url, context);
  if (!url.includes('/artifacts/solana-privacy-swap/src/') || result.source == null) return result;
  const source = typeof result.source === 'string' ? result.source : new TextDecoder().decode(result.source);
  return source.includes('import.meta.env') ? { ...result, source: source.replaceAll('import.meta.env', viteEnv) } : result;
}
