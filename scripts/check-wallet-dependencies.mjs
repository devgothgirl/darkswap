import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Follow the application's installed consumer chain: a patched lockfile alone
// does not prove that the installed wallet URL parser has its compatibility fix.
export function checkWalletDependencies(root = new URL("../", import.meta.url)) {
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    checkWalletDependencies();
    console.log("Installed wallet dependency compatibility check passed.");
  } catch (error) {
    console.error("Installed wallet dependency compatibility check failed; setup stopped. Check the installed query-string compatibility patch before retrying.");
    console.error(error);
    process.exitCode = 1;
  }
}
