import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
  })) {
    for (const version of versions) {
      assert.ok(!lock.includes(`  ${name}@${version}:`), `${name}@${version} remains in the lockfile`);
    }
  }
  assert.ok(!/^  stream-json@/m.test(lock), "the incompatible old parser must be removed, not forcibly upgraded");
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

test("braces rejects excessive nesting before recursive AST processing", () => {
  const braces = auditedPackage("braces", "3.0.3");
  assert.deepEqual(braces.expand("a{b,c}"), ["ab", "ac"]);
  assert.deepEqual(braces("a{b,c}"), ["a(b|c)"]);
  for (const pattern of [
    "{".repeat(4000) + "a,b" + "}".repeat(4000),
    "(".repeat(4000) + "x" + ")".repeat(4000),
    "{(".repeat(2000) + "a,b" + ")}".repeat(2000),
  ]) {
    for (const fn of [braces, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => fn(pattern), /safe nesting depth/);
    }
  }
  let ast = { type: "text", value: "x" };
  for (let i = 0; i < 4000; i++) ast = { type: "root", nodes: [ast] };
  for (const fn of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => fn(ast), /safe nesting depth/);
  }
  const cycle = { type: "root", nodes: [] };
  cycle.nodes.push(cycle);
  for (const fn of [braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => fn(cycle), /safe nesting depth/);
  }
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
  const consumer = createRequire(new URL("lib/pool-client/package.json", root));
  const cjs = consumer("circomlibjs");
  const esm = await import(new URL("../main.js", `file://${consumer.resolve("circomlibjs")}`));
  for (const lib of [cjs, esm]) {
    const poseidon = await lib.buildPoseidon();
    assert.equal(poseidon.F.toObject(poseidon([1n, 2n])), 7853200120776062878684798364095072458815029376092732009249414926327459813530n);
    assert.equal(lib.poseidonContract.createCode(2), cjs.poseidonContract.createCode(2));
    const mimc = await lib.buildMimc7();
    const reference = await cjs.buildMimc7();
    assert.equal(mimc.F.toObject(mimc.hash(1n, 2n)), reference.F.toObject(reference.hash(1n, 2n)));
  }
  assert.throws(() => createRequire(consumer.resolve("circomlibjs")).resolve("ethers"), { code: "MODULE_NOT_FOUND" });
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
  let consumer = createRequire(new URL("artifacts/solana-privacy-swap/package.json", root));
  for (const name of ["@privy-io/react-auth", "@walletconnect/ethereum-provider", "@walletconnect/utils"]) {
    consumer = createRequire(consumer.resolve(name));
  }
  const query = consumer("query-string");
  assert.equal(query.parse("value=%E2%82%AC").value, "€");
  assert.equal(query.parse("value=hello+world").value, "hello world");
  assert.equal(query.stringify({ value: "€" }), "value=%E2%82%AC");
  // Malformed percent sequences triggered exponential work in the old decoder.
  assert.doesNotThrow(() => query.parse(`value=${"%EA".repeat(1000)}`));
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