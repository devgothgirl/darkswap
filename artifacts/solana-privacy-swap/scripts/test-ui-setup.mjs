// Setup for UI tests (npm run test:ui): module hooks and a browser-like document.
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register('./test-ui-hooks.mjs', import.meta.url);

const { window } = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  Object.defineProperty(globalThis, key, { configurable: true, get: () => window[key] });
}
// Window events (popstate, online, focus) are inherited methods, not own properties.
for (const method of ['addEventListener', 'removeEventListener', 'dispatchEvent']) globalThis[method] = window[method].bind(window);
// Node ships its own navigator; components read the browser one (clipboard, onLine).
Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
