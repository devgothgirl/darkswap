import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const assets = new URL('../dist/public/', import.meta.url);
let javascriptFiles = 0;
let hasProductionAnnouncement = false;
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) {
      await inspect(file);
    } else if (/\.(?:js|css|html|map)$/.test(entry.name)) {
      const content = await readFile(file, 'utf8');
      if (entry.name.endsWith('.js')) javascriptFiles++;
      if (content.includes('darkswap:darkpool-phase-2-litepaper-v2-dismissed')) {
        hasProductionAnnouncement = true;
        for (const marker of [
          'https://x.com/darkswapapp', 'docs/DarkSwap_Litepaper_v0.3.pdf',
          'button-token-launch-close', 'button-token-launch-not-now',
        ]) {
          assert.ok(content.includes(marker), `Production announcement is missing ${marker}`);
        }
      }
      for (const marker of [
        'dk-countdown', 'darkpool-countdown', 'DarkPools reveal',
        'Reveal time reached. Check X for updates.',
        '2026-10-12T13:00:00-08:00',
        'darkswap:darkpool-phase-2-countdown-v3-dismissed',
      ]) {
        assert.ok(!content.includes(marker), `${file.pathname} includes preview-only ${marker}`);
      }
    }
  }
}
await inspect(assets);
assert.ok(javascriptFiles > 0, 'No generated JavaScript found; run the site build first.');
assert.ok(hasProductionAnnouncement, 'Original production announcement dismissal key is missing.');
console.log('Production assets contain no countdown UI, styles, deadline or dismissal revision.');
