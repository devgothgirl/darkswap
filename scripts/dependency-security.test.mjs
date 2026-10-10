import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkWalletDependencies } from "./check-wallet-dependencies.mjs";
import { checkPoolDependencies } from "./check-pool-dependencies.mjs";

const root = new URL("../", import.meta.url);
const rootRequire = createRequire(new URL("package.json", root));
const lock = readFileSync(new URL("pnpm-lock.yaml", root), "utf8");

// Resolve the exact audited release, without adding transitive packages as
// application dependencies. The lockfile test also checks every resolved copy.
function auditedPackage(name, version) {
  const store = fileURLToPath(new URL("node_modules/.pnpm/", root));
  const prefix = `${name.replaceAll("/", "+")}@${version}`;
  const patchHash = lock.match(new RegExp(`  ${name}@${version}:\\n    hash: ([a-f0-9]+)`))?.[1];
  const directory = readdirSync(store).find(
    entry => patchHash
      ? entry.startsWith(`${prefix}_patch_hash=${patchHash}`)
      : entry === prefix || entry.startsWith(`${prefix}_`),
  );
  assert.ok(directory, `${name}@${version} must be installed`);
  return createRequire(`${store}/${directory}/node_modules/${name}/package.json`)(name);
}

test("the workspace lockfile excludes vulnerable versions that have replacements", () => {
  for (const [name, versions] of Object.entries({
    "brace-expansion": ["5.0.9"],
    ws: ["8.18.0", "8.18.3"],
    uuid: ["8.3.2", "9.0.1"],
    "stream-json": ["1.9.1"],
    "fast-uri": ["3.1.7"],
    "decode-uri-component": ["0.2.2"],
    "bigint-buffer": ["1.1.5"],
    elliptic: ["6.6.1"],
    underscore: ["1.13.6"],
    "source-map-js": ["1.2.1"],
    "postcss-selector-parser": ["6.0.10"],
  })) {
    for (const version of versions) {
      assert.ok(!lock.includes(`  ${name}@${version}:`), `${name}@${version} remains in the lockfile`);
    }
  }
  assert.ok(!/^  stream-json@/m.test(lock), "the incompatible old parser must be removed, not forcibly upgraded");
  for (const name of ["braces", "micromatch", "fast-glob"]) {
    assert.ok(!new RegExp(`^  ${name}@`, "m").test(lock), `${name} must not re-enter the preview tooling graph`);
  }
});

test("every Solana crate uses the same lockfile without the flagged Rust dependencies", () => {
  const cargoRoot = new URL("packages/darkswap-pool/solana/", root);
  const cargoLock = readFileSync(new URL("Cargo.lock", cargoRoot), "utf8");
  const packages = cargoLock.split("[[package]]").slice(1).map(block => ({
    name: block.match(/^name = "([^"]+)"/m)?.[1],
    version: block.match(/^version = "([^"]+)"/m)?.[1],
  }));
  for (const name of ["derivative", "paste", "bincode", "libsecp256k1", "solana-program"]) {
    assert.ok(!packages.some(pkg => pkg.name === name), `${name} must not re-enter the Solana graph`);
  }
  assert.ok(!packages.some(pkg => pkg.name === "rand" && pkg.version?.startsWith("0.7.")));
  assert.ok(!packages.some(pkg => pkg.name === "borsh" && pkg.version?.startsWith("0.10.")));
  assert.ok(packages.some(pkg => pkg.name === "pastey"));
  assert.ok(packages.some(pkg => pkg.name === "wincode"));
  for (const crate of ["pool", "pool-probe", "test-logspam", "verifier-parity"]) {
    assert.throws(() => readFileSync(new URL(`${crate}/Cargo.lock`, cargoRoot)), { code: "ENOENT" });
  }
});

test("preview glob replacement discovers nested TSX files but excludes private and hidden files", async t => {
  const consumer = createRequire(new URL("artifacts/mockup-sandbox/package.json", root));
  const { glob } = consumer("tinyglobby");
  const cwd = mkdtempSync(path.join(tmpdir(), "mockup-glob-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const file of [
    "Card.tsx", "nested/Panel.tsx", "_Private.tsx", "_helpers/Hidden.tsx",
    "nested/_Hidden.tsx", ".hidden.tsx", ".hidden/Panel.tsx", "Card.ts",
  ]) {
    const filename = path.join(cwd, "src/components/mockups", file);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, "");
  }
  const files = await glob("src/components/mockups/**/*.tsx", {
    cwd, ignore: ["**/_*/**", "**/_*.tsx"],
  });
  assert.deepEqual(files.sort(), [
    "src/components/mockups/Card.tsx", "src/components/mockups/nested/Panel.tsx",
  ]);
});

test("fixed source-map-js preserves normal indexed maps and rejects unsafe offsets", { timeout: 5000 }, () => {
  const { SourceMapConsumer, SourceNode } = auditedPackage("source-map-js", "1.2.2");
  const map = { version: 3, sections: [{
    offset: { line: 0, column: 0 },
    map: { version: 3, sources: ["input.js"], names: [], mappings: "AAAA", sourcesContent: ["hello"] },
  }] };
  const consumer = new SourceMapConsumer(map);
  const mappings = [];
  consumer.eachMapping(mapping => mappings.push(mapping));
  assert.equal(mappings[0].source, "input.js");
  assert.equal(mappings[0].generatedLine, 1);
  assert.equal(SourceNode.fromStringWithSourceMap("hello", consumer).toString(), "hello");
  for (const line of [-1, 0.5, Number.MAX_SAFE_INTEGER, Infinity, NaN]) {
    const malicious = { ...map, sections: [{ ...map.sections[0], offset: { line, column: 0 } }] };
    assert.throws(() => SourceNode.fromStringWithSourceMap("hello", new SourceMapConsumer(malicious)));
  }
});

test("fixed selector parser handles flat attack selectors and typography's used APIs", { timeout: 5000 }, () => {
  const parser = auditedPackage("postcss-selector-parser", "7.1.6");
  const selector = ".a".repeat(200000);
  assert.equal(parser().processSync(selector), selector);
  const consumer = createRequire(new URL("artifacts/darkswap-design-system/package.json", root));
  const typography = createRequire(consumer.resolve("@tailwindcss/typography"));
  assert.equal(typography("postcss-selector-parser/package.json").version, "7.1.6");
  const { commonTrailingPseudos } = typography("./utils");
  assert.deepEqual(commonTrailingPseudos("p::before, a::before"), ["::before", "p, a"]);
  assert.deepEqual(commonTrailingPseudos("p:hover, a:focus"), [null, "p:hover, a:focus"]);
  assert.deepEqual(commonTrailingPseudos("p::before::marker, a::before::marker"), ["::before::marker", "p, a"]);
});

test("native bigint replacement round-trips Solana integer widths and rejects overflow", () => {
  const native = rootRequire("./lib/bigint-buffer/index.cjs");
  for (const width of [0, 8, 16, 24, 32]) {
    const max = width === 0 ? 0n : (1n << BigInt(width * 8)) - 1n;
    for (const value of [0n, max / 3n, max]) {
      for (const endian of ["LE", "BE"]) {
        const bytes = native[`toBuffer${endian}`](value, width);
        assert.equal(bytes.length, width);
        assert.equal(native[`toBigInt${endian}`](bytes), value);
      }
    }
    assert.throws(() => native.toBufferLE(max + 1n, width), RangeError);
  }
  assert.equal(native.toBufferBE(0x1234n, 2).toString("hex"), "1234");
  assert.equal(native.toBufferLE(0x1234n, 2).toString("hex"), "3412");
  assert.throws(() => native.toBufferLE(-1n, 8), RangeError);
  assert.throws(() => native.toBufferLE(0n, -1), RangeError);
  assert.throws(() => native.toBufferLE(0n, Infinity), RangeError);
  const layout = createRequire(new URL("packages/darkswap-pool/package.json", root))("@solana/spl-token");
  const account = Buffer.alloc(layout.AccountLayout.span);
  layout.AccountLayout.encode({
    mint: rootRequire("@solana/web3.js").PublicKey.default,
    owner: rootRequire("@solana/web3.js").PublicKey.default,
    amount: 123n, delegateOption: 0,
    delegate: rootRequire("@solana/web3.js").PublicKey.default,
    state: 1, isNativeOption: 0, isNative: 0n,
    delegatedAmount: 0n, closeAuthorityOption: 0,
    closeAuthority: rootRequire("@solana/web3.js").PublicKey.default,
  }, account);
  assert.equal(layout.AccountLayout.decode(account).amount, 123n);
});

test("circomlibjs ESM and CJS keep identical hashes and generated contracts without signing dependencies", async () => {
  await checkPoolDependencies(root);
});

test("brace expansion handles nested and comma-heavy attack patterns", { timeout: 5000 }, () => {
  const { expand } = auditedPackage("brace-expansion", "5.0.12");
  assert.deepEqual(expand("a{b,c}"), ["ab", "ac"]);
  for (const pattern of [
    "{" + "{a},".repeat(7000) + "b}",
    "{{x}," + "a,".repeat(125000) + "b}",
    "{a,".repeat(4000) + "z" + "}".repeat(4000),
    "{".repeat(3200) + "a,b" + "}".repeat(3200),
    "{a}" + "}".repeat(16000) + ",z}",
  ]) {
    assert.doesNotThrow(() => expand(pattern, { max: 1, maxLength: 1 }));
  }
});

test("UUID CJS consumers still work and short buffers are rejected", () => {
  const uuid = auditedPackage("uuid", "11.1.1");
  assert.ok(uuid.validate(uuid.v4()));
  const namespace = uuid.v5.DNS;
  for (const generate of [uuid.v3, uuid.v5]) {
    assert.throws(() => generate("example", namespace, new Uint8Array(8), 4), RangeError);
    assert.ok(uuid.validate(generate("example", namespace)));
  }
  assert.throws(() => uuid.v6({}, new Uint8Array(8), 4), RangeError);
});

test("fast-uri normalizes percent-encoded uppercase hosts consistently", () => {
  const uri = auditedPackage("fast-uri", "3.1.8");
  assert.equal(uri.parse("//%41.com").host, "a.com");
  assert.equal(uri.equal("//%41.com", "//a.com"), true);
});

test("the wallet's actual query-string dependency uses the patched decoder", { timeout: 5000 }, () => {
  checkWalletDependencies(root);
});

test("Solana's JSON-RPC client works with Jayson 5 without network access", async () => {
  const { Connection, PublicKey } = rootRequire("@solana/web3.js");
  const connection = new Connection("http://localhost:8899", {
    fetch: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.method, "getBalance");
      assert.equal(typeof request.id, "string");
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: request.id,
        result: { context: { slot: 1 }, value: 123 },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  assert.equal(await connection.getBalance(new PublicKey("11111111111111111111111111111111")), 123);
});

test("WebSocket typed-array close reasons do not expose uninitialized bytes", { timeout: 5000 }, async t => {
  const { WebSocket, WebSocketServer } = auditedPackage("ws", "8.21.0");
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1", skipUTF8Validation: true });
  t.after(() => { for (const client of server.clients) client.terminate(); server.close(); });
  await once(server, "listening");
  server.on("connection", socket => {
    // The patched API rejects non-byte typed arrays rather than transmitting
    // a partially initialized close frame.
    assert.throws(() => socket.close(1000, new Float32Array(20)), TypeError);
    socket.terminate();
  });
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { skipUTF8Validation: true });
  t.after(() => client.terminate());
  const [code, reason] = await once(client, "close");
  assert.equal(code, 1006);
  assert.equal(reason.length, 0);
});

test("WebSocket fragment limits reject tiny-fragment memory amplification", { timeout: 5000 }, async t => {
  const { WebSocket, WebSocketServer } = auditedPackage("ws", "8.21.0");
  const server = new WebSocketServer({ port: 0, host: "127.0.0.1", maxFragments: 4 });
  t.after(() => { for (const client of server.clients) client.terminate(); server.close(); });
  await once(server, "listening");
  const rejected = new Promise(resolve => server.on("connection", socket => socket.on("error", resolve)));
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`);
  t.after(() => client.terminate());
  await once(client, "open");
  const closed = once(client, "close");
  for (let index = 0; index < 6; index++) client.send(Buffer.from([1]), { fin: false });
  const error = await rejected;
  assert.equal(error.code, "WS_ERR_TOO_MANY_BUFFERED_PARTS");
  const [code] = await closed;
  assert.equal(code, 1008);
});