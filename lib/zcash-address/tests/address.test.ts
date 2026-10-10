import assert from "node:assert/strict";
import { test } from "node:test";
import { isShieldedZcashAddress, MAX_ZCASH_ADDRESS_LENGTH } from "../src/index";

// Synthetic public vectors from the official NEAR SDK. Never fund these.
const orchard = "u1mvjnzd2jv4mwpzv0v5ze2p8d0txt4erah3ffx2m68wz74et90nx2wzhvxkv4kdaw2e5lv5c59f8r8j3cnev277jjgljywujnkct3q6kq";
const saplingOrchard = "u1x08faycv384llwet8r8zedp0w8axcjtckhpv03sj0anft683j2ku9lfamp5q60avusdt4xkg2rlf6nq7pxy444jm3lwtequrzwxm5d8dgcy023fjl4hh4j68c8uuy79v6dk4j5w042zl5wk3vgwatvfr8rlky09vwkjw5yltrqreyr3f";
const sapling = "u1c4q5lx2m27v5n8m0v8eeehd3zy43a27v8ze7thlns6njkea00f8p5e6an3hhsa3cmzvhdcgxjmyfpw6v8wxq35gh74hsrw7z2c2ze2y7";
const mixed = "u1ngljcknkpc3k59rg493pz2fck9u7pd3fhq7yc45rt92s3c97rcm3nxxs659vn9d8u4n4x65yfsav90t0am2yea9huj8fgk8hzmh5w5g0sxdrm4q2dyp4jq839srf435uwxnvjf2xzaa9awprt76zrq45ppy60rzlru6p2t87el9m3syfn36jfdl5ts0kmyd629paqwfcqddnw8s6t3l";
const transparentSapling = "u1t9qnfm852emx7a8am0pg5ygh3s4astw5t60lnw6w40043vz8hz6v8a8ew8yk79wfykemjdfw4h7gkpsmyw4nkqud2f826mrx2rmr6xpun05mdn50jd08qvdspqvtnrt32xsn50wyzdt";

test("accepts checksum-valid Orchard-only and Sapling+Orchard mainnet UAs", () => {
  assert.equal(isShieldedZcashAddress(orchard), true);
  assert.ok(saplingOrchard.length > 120, "long UAs must not be truncated");
  assert.equal(isShieldedZcashAddress(saplingOrchard), true);
});

test("rejects valid mixed receivers, transparent destinations and unsupported shielded pools", () => {
  for (const address of [mixed, transparentSapling, sapling, "t1Q879cLgqaCd7zKRi79wQYuGBenmNX6cKn", "zs1example"]) {
    assert.equal(isShieldedZcashAddress(address), false);
  }
});

test("rejects wrong network, casing, checksum damage, truncation and oversized input", () => {
  for (const address of ["", orchard.toUpperCase(), `utest${orchard.slice(1)}`, orchard.slice(0, -1), `${orchard.slice(0, -1)}p`, ` ${orchard}`, "u1" + "a".repeat(MAX_ZCASH_ADDRESS_LENGTH)]) {
    assert.equal(isShieldedZcashAddress(address), false);
  }
  // Every single-character receiver/padding/checksum mutation is rejected.
  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  for (let i = 2; i < orchard.length; i++) {
    const replacement = alphabet[(alphabet.indexOf(orchard[i]!) + 1) % alphabet.length];
    assert.equal(isShieldedZcashAddress(orchard.slice(0, i) + replacement + orchard.slice(i + 1)), false);
  }
});
