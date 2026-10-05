import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PublicKey, Keypair } from "@solana/web3.js";
import {
  initPoseidon, randomField, FIELD, Keys, decodeAddress, encryptNote, decryptNote,
  ACTIVATION_MESSAGE, secretFromSignature, secretToWords, wordsToSecret, keysFromSignature, KeySession,
  solana,
} from "../src/node.js";

await initPoseidon();

test("activation message is exact", () => {
  assert.equal(ACTIVATION_MESSAGE,
    "DarkSwap shielded balance v1\nThis signature is your spending key. Only sign it on darkswap.app or darkswap.world.");
});

test("signature -> secret -> 24 words -> same keys", () => {
  const sig = new Uint8Array(65).map((_, i) => (i * 7 + 3) & 0xff);
  const secret = secretFromSignature(sig);
  assert.deepEqual(Buffer.from(secret), createHash("sha256").update(sig).digest());
  const words = secretToWords(secret);
  assert.equal(words.split(" ").length, 24);
  assert.deepEqual(Buffer.from(wordsToSecret(`  ${words.toUpperCase()}  `)), Buffer.from(secret));
  assert.equal(keysFromSignature(sig).address, new Keys(wordsToSecret(words)).address);
  assert.throws(() => wordsToSecret(words.split(" ").slice(0, 23).join(" ")), /24 words/);
  const swapped = words.split(" "); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  if (swapped[0] !== swapped[1]) assert.throws(() => wordsToSecret(swapped.join(" ")));
});

test("key session drops the secret on lock and when idle", async () => {
  let locked = 0;
  const s = new KeySession({ idleMs: 30, onLock: () => locked++ });
  const secret = new Uint8Array(32).fill(9);
  const keys = s.unlock(secret);
  assert.ok(keys.address.startsWith("dark1"));
  assert.equal(s.words().split(" ").length, 24);
  s.lock();
  assert.equal(s.keys, null);
  assert.ok(keys._secret.every((b) => b === 0), "secret bytes zeroed");
  s.unlock(secret);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(s.keys, null);
  assert.equal(locked, 2);
});

test("getRandomValues-backed randomness and note round trip", () => {
  const x = randomField();
  assert.ok(x > 0n && x < FIELD);
  const a = Keys.random();
  const ct = encryptNote({ amount: 123n, blinding: 456n }, decodeAddress(a.address).encPublic);
  assert.deepEqual(decryptNote(ct, a), { amount: 123n, blinding: 456n });
  assert.equal(decryptNote(ct, Keys.random()), null);
});

test("solana extDataHash matches the node:crypto reference", () => {
  const args = {
    programId: Keypair.generate().publicKey, recipient: Keypair.generate().publicKey,
    relayer: Keypair.generate().publicKey, mint: PublicKey.default,
    extAmount: -1_000_000n, fee: 5000n, enc0: new Uint8Array(96).fill(1), enc1: new Uint8Array(96).fill(2),
  };
  const le = (n, bytes, signed) => { const b = Buffer.alloc(bytes); signed ? b.writeBigInt64LE(n) : b.writeBigUInt64LE(n); return b; };
  const withLen = (b) => { const l = Buffer.alloc(2); l.writeUInt16LE(b.length); return Buffer.concat([l, Buffer.from(b)]); };
  const h = createHash("sha256").update(Buffer.from("darkswap.solana.extdata.v1"))
    .update(args.programId.toBuffer()).update(args.recipient.toBuffer()).update(args.relayer.toBuffer()).update(args.mint.toBuffer())
    .update(le(args.extAmount, 8, true)).update(le(args.fee, 8, false)).update(withLen(args.enc0)).update(withLen(args.enc1)).digest();
  h[0] &= 0x1f;
  assert.equal(solana.extDataHash(args), BigInt("0x" + h.toString("hex")));
});
