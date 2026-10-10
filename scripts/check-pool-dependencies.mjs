import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Resolve through the pool's installed consumer, not a lockfile or arbitrary
// copy in the pnpm store. Exercise both entrypoints affected by the patch.
export async function checkPoolDependencies(root = new URL("../", import.meta.url)) {
  const consumer = createRequire(new URL("lib/pool-client/package.json", root));
  const entry = consumer.resolve("circomlibjs");
  const cjs = consumer("circomlibjs");
  const esm = await import(new URL("../main.js", pathToFileURL(entry)));
  const reference = await cjs.buildMimc7();
  const referenceHash = reference.F.toObject(reference.hash(1n, 2n));
  const contract = cjs.poseidonContract.createCode(2);
  assert.match(contract, /^0x[0-9a-f]+$/i, "Poseidon contract bytecode must be generated");
  for (const lib of [cjs, esm]) {
    const poseidon = await lib.buildPoseidon();
    assert.equal(poseidon.F.toObject(poseidon([1n, 2n])), 7853200120776062878684798364095072458815029376092732009249414926327459813530n);
    assert.equal(lib.poseidonContract.createCode(2), contract);
    const mimc = await lib.buildMimc7();
    assert.equal(mimc.F.toObject(mimc.hash(1n, 2n)), referenceHash);
  }
  // The patch intentionally uses hashing/encoding utilities only.
  assert.throws(() => createRequire(entry).resolve("ethers"), { code: "MODULE_NOT_FOUND" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkPoolDependencies();
    console.log("Installed private-pool crypto dependency compatibility check passed.");
  } catch (error) {
    console.error("Installed private-pool crypto dependency compatibility check failed; setup stopped. Check the installed circomlibjs compatibility patch before retrying.");
    console.error(error);
    process.exitCode = 1;
  }
}
