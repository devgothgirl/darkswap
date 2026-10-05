#!/usr/bin/env node
// Real-build regression. No provider calls, workflow changes or managed output writes.
// Optional --outDir retains the verified package for a handoff; default is disposable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, prepareStandalone, targetOrigin } from "./prepare-launch-standalone.mjs";

const workspace = fileURLToPath(new URL("../../", import.meta.url));
const protectedPaths = [
  "artifacts/darkswap-launch/dist",
  "artifacts/darkswap-launch/src/seo-config.json",
  "artifacts/darkswap-launch/.replit-artifact/artifact.toml",
  "artifacts/api-server/.replit-artifact/artifact.toml",
  "artifacts/solana-privacy-swap/.replit-artifact/artifact.toml",
];
async function snapshot(relative, result = {}) {
  const full = path.join(workspace, relative);
  let stat;
  try { stat = await lstat(full); } catch (error) {
    if (error.code !== "ENOENT") throw error;
    result[relative] = "absent";
    return result;
  }
  if (stat.isDirectory()) {
    result[relative] = `directory:${stat.mode}`;
    for (const name of (await readdir(full)).sort()) await snapshot(path.join(relative, name), result);
  } else {
    assert.ok(stat.isFile(), `Unexpected protected file type: ${relative}`);
    result[relative] = `${stat.mode}:${stat.mtimeMs}:${createHash("sha256").update(await readFile(full)).digest("hex")}`;
  }
  return result;
}
async function protectedSnapshot() {
  const result = {};
  for (const item of protectedPaths) await snapshot(item, result);
  return result;
}

const options = parseArgs(process.argv.slice(2));
if (options.showHelp) {
  console.log("Usage: node scripts/src/verify-launch-standalone.mjs [--outDir NEW_DIRECTORY]\nBuilds and checks a real root client + SSR export; verifies managed output/config remain unchanged.");
} else {
  const before = await protectedSnapshot();
  const scratch = options.outDir ? null : await mkdtemp(path.join(tmpdir(), "verify-launch-export-"));
  const destination = options.outDir ?? path.join(scratch, "export");
  try {
    const { outDir, manifest } = await prepareStandalone({ outDir: destination });
    assert.equal(manifest.targetOrigin, targetOrigin);
    assert.equal(manifest.renderer.dependenciesBundled, true);
    assert.equal(manifest.live, false);
    const html = await readFile(path.join(outDir, "public/index.html"), "utf8");
    assert.ok(html.includes("<!--page-head-->") && html.includes("<!--page-state-->"));
    const assetRefs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(match => match[1]);
    assert.ok(assetRefs.some(ref => ref.startsWith("/assets/") && ref.endsWith(".js")));
    for (const reference of assetRefs) {
      assert.ok(!reference.startsWith("/launch/"));
      assert.ok((await readFile(path.join(outDir, "public", reference))).length > 0, reference);
    }
    for (const relative of manifest.siteFiles) {
      assert.ok((await readFile(path.join(outDir, "public", relative))).length > 0, relative);
    }
    const seo = JSON.parse(await readFile(path.join(outDir, "seo-config.json"), "utf8"));
    assert.equal(seo.basePath, "/");
    assert.equal(seo.origin, targetOrigin);
    // Import outside the workspace to detect unbundled bare dependencies.
    const isolated = await mkdtemp(path.join(tmpdir(), "launch-renderer-isolated-"));
    try {
      await cp(path.join(outDir, "server"), path.join(isolated, "server"), { recursive: true });
      await writeFile(path.join(isolated, "package.json"), '{"type":"module"}');
      const { render } = await import(pathToFileURL(path.join(isolated, "server/entry-server.js")).href);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = () => { throw new Error("Integration regression must not contact a provider"); };
      try {
        for (const route of ["/docs", "/terms", "/privacy", "/risk", "/create", "/creator", "/admin"]) {
          const result = await render(route, "https://unused.invalid");
          assert.equal(result.status, 200, route);
          assert.ok(result.body.length > 100, route);
          assert.ok(result.head.includes(`${targetOrigin}${route}`), `${route}: correct root canonical`);
          assert.ok(!result.head.includes("https://darkswap.app/launch/"), route);
        }
      } finally { globalThis.fetch = originalFetch; }
    } finally { await rm(isolated, { recursive: true, force: true }); }
    assert.deepEqual(await protectedSnapshot(), before, "Managed build/config files changed");
    console.log(`PASS: real root client + bundled SSR export, all assets, seven rendered routes, root canonicals, and unchanged managed output: ${outDir}`);
  } finally {
    assert.deepEqual(await protectedSnapshot(), before, "Managed build/config files changed even on failure");
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}