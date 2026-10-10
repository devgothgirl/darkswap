import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NEAR_NATIVE_ASSETS, NEAR_ORIGIN_CAPABLE_CHAINS, NEAR_ROUTE_CHAINS,
  chainAddress, isNativeAsset, originAddressShape, parseOriginChains, sameAddress,
} from "./near-chains";

function collectingLogger() {
  const warnings: { details: Record<string, unknown>; message: string }[] = [];
  return { warnings, log: { warn(details: Record<string, unknown>, message: string) { warnings.push({ details, message }); } } };
}

test("origin allow-list defaults to Solana and always keeps it enabled", () => {
  const { warnings, log } = collectingLogger();
  assert.deepEqual([...parseOriginChains(undefined, log)], ["sol"]);
  assert.deepEqual([...parseOriginChains("", log)], ["sol"]);
  assert.deepEqual([...parseOriginChains("base", log)].sort(), ["base", "sol"]);
  assert.equal(warnings.length, 0);
});

test("origin allow-list accepts the staging set and logs and ignores everything else", () => {
  const { warnings, log } = collectingLogger();
  assert.deepEqual(
    [...parseOriginChains("sol,eth,arb,base,op,pol,bsc", log)].sort(),
    ["arb", "base", "bsc", "eth", "op", "pol", "sol"],
  );
  assert.equal(warnings.length, 0);

  const origins = parseOriginChains(" ETH ,near,btc,,zec,solana", log);
  assert.deepEqual([...origins].sort(), ["eth", "sol"]);
  assert.deepEqual(warnings.map(warning => warning.details.value), ["near", "btc", "zec", "solana"]);
  assert.match(warnings[0].message, /NEAR is not an enabled origin/);
  assert.equal(origins.has("near"), false, "NEAR is never an origin even when listed");
});

test("origin-capable networks are route networks and each has an exact native asset", () => {
  for (const chain of NEAR_ORIGIN_CAPABLE_CHAINS) {
    assert.equal(NEAR_ROUTE_CHAINS.has(chain), true, chain);
    assert.equal(typeof NEAR_NATIVE_ASSETS[chain], "string", chain);
    assert.equal(isNativeAsset(chain, NEAR_NATIVE_ASSETS[chain]), true, chain);
  }
  assert.equal(NEAR_ORIGIN_CAPABLE_CHAINS.has("near"), false);
  // Native status is by exact identity on the same network only.
  assert.equal(isNativeAsset("eth", "nep141:arb.omft.near"), false);
  assert.equal(isNativeAsset("base", "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near"), false);
  assert.equal(isNativeAsset("near", "nep141:wrap.near"), false);
  assert.equal(isNativeAsset("toString", "x"), false);
});

test("addresses are validated against the network that will use them", () => {
  const evm = "0x52908400098527886E0F7030069857D2E4169EE7";
  const solana = "So11111111111111111111111111111111111111112";
  for (const chain of ["eth", "arb", "base", "op", "pol", "bsc"]) {
    assert.equal(chainAddress(chain, evm), true, chain);
    assert.equal(chainAddress(chain, evm.toLowerCase()), true, chain);
    assert.equal(chainAddress(chain, solana), false, chain);
    assert.equal(chainAddress(chain, `${evm}0`), false, chain);
    assert.equal(chainAddress(chain, evm.slice(2)), false, chain);
  }
  assert.equal(chainAddress("sol", solana), true);
  assert.equal(chainAddress("sol", evm), false);
  assert.equal(chainAddress("btc", evm), false);
  assert.equal(originAddressShape(evm), true);
  assert.equal(originAddressShape(solana), true);
  assert.equal(originAddressShape("darkswapapp.near"), false, "NEAR is not an origin network");
});

test("repeated deposit-address copies ignore hex case on EVM networks only", () => {
  const issued = "0x52908400098527886E0F7030069857D2E4169EE7";
  assert.equal(sameAddress("base", issued, issued.toLowerCase()), true);
  assert.equal(sameAddress("bsc", issued.toUpperCase().replace("0X", "0x"), issued), true);
  assert.equal(sameAddress("base", issued, "0x0000000000000000000000000000000000000001"), false);
  assert.equal(sameAddress("base", "not-an-address", "NOT-AN-ADDRESS"), false);
  assert.equal(sameAddress("base", issued, undefined), false);
  const solana = "So11111111111111111111111111111111111111112";
  assert.equal(sameAddress("sol", solana, solana), true);
  assert.equal(sameAddress("sol", solana, solana.toLowerCase()), false);
});
