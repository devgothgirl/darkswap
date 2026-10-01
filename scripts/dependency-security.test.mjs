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
  const directory = readdirSync(store).find(
    entry => entry === prefix || entry.startsWith(`${prefix}_`),
  );
  assert.ok(directory, `${name}@${version} must be installed`);
  return createRequire(`${store}/${directory}/node_modules/${name}/package.json`)(name);
}

test("the lockfile contains no versions from the 12 reported findings", () => {
  for (const [name, versions] of Object.entries({
    "brace-expansion": ["5.0.9"],
    ws: ["8.18.0", "8.18.3"],
    uuid: ["8.3.2", "9.0.1"],
    "stream-json": ["1.9.1"],
    "fast-uri": ["3.1.7"],
    "decode-uri-component": ["0.2.2"],
  })) {
    for (const version of versions) {
      assert.ok(!lock.includes(`  ${name}@${version}:`), `${name}@${version} remains in the lockfile`);
    }
  }
  assert.ok(!/^  stream-json@/m.test(lock), "the incompatible old parser must be removed, not forcibly upgraded");
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