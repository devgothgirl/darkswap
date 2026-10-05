// Wallet tests that need no chain: addresses, note encryption, scanning,
// deposit-key search, transaction planning.
import test from "node:test";
import assert from "node:assert/strict";
import { initPoseidon, commitmentOf, publicKeyOf } from "./lib.mjs";
import {
  Keys, encodeAddress, decodeAddress, encryptNote, decryptNote, scanNotes, nextDepositNumber,
  planTransaction, planShield, unspent, selectNotes,
} from "./wallet.mjs";

await initPoseidon();
const ASSET = 0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeen;
const OTHER = 0x1234n;

const shieldEvent = (keys, amount, n, index, assetId = ASSET) => {
  const s = planShield({ keys, amount, depositNumber: n });
  return { commitment: commitmentOf({ amount, assetId, publicKey: s.publicKey, blinding: s.blinding }), index, encryptedOutput: s.encryptedOutput };
};

test("addresses round-trip and refuse a typo", () => {
  const k = Keys.random();
  const back = decodeAddress(k.address);
  assert.equal(back.publicKey, k.publicKey);
  assert.deepEqual(Buffer.from(back.encPublic), Buffer.from(k.encPublic));
  const typo = k.address.slice(0, 20) + (k.address[20] === "a" ? "b" : "a") + k.address.slice(21);
  assert.throws(() => decodeAddress(typo), /checksum/);
});

test("only the recipient can open a note", () => {
  const a = Keys.random(), b = Keys.random();
  const ct = encryptNote({ amount: 123n, blinding: 456n }, a.encPublic);
  assert.deepEqual(decryptNote(ct, a), { amount: 123n, blinding: 456n });
  assert.equal(decryptNote(ct, b), null);
  const tampered = Uint8Array.from(ct); tampered[40] ^= 1;
  assert.equal(decryptNote(tampered, a), null);
});

test("same keys from the same secret", () => {
  const secret = Buffer.alloc(32, 7);
  assert.equal(new Keys(secret).address, new Keys(secret).address);
  assert.notEqual(new Keys(secret).depositPrivateKey(0), new Keys(secret).depositPrivateKey(1));
});

test("scanning finds deposits far past the first 64 keys", () => {
  const k = Keys.random();
  const events = [shieldEvent(k, 5n, 0, 0), shieldEvent(k, 6n, 40, 2), shieldEvent(k, 7n, 70, 4), shieldEvent(k, 8n, 130, 6)];
  events.push(shieldEvent(Keys.random(), 9n, 0, 8)); // someone else's
  const notes = scanNotes(events, k, [OTHER, ASSET]);
  assert.deepEqual(notes.map((n) => n.amount), [5n, 6n, 7n, 8n]);
  assert.equal(nextDepositNumber(notes), 131);
});

test("plans balance: send, unshield, deposit", () => {
  const alice = Keys.random(), bob = Keys.random();
  const notes = scanNotes([shieldEvent(alice, 700n, 0, 0), shieldEvent(alice, 300n, 1, 2)], alice, [ASSET]);
  const sum = (xs) => xs.reduce((s, x) => s + x.amount, 0n);

  const send = planTransaction({ kind: "send", keys: alice, notes: unspent(notes, new Set(), ASSET), assetId: ASSET, amount: 900n, to: bob.address });
  assert.equal(sum(send.inputs), sum(send.outputs));
  assert.equal(send.outputs[0].publicKey, bob.publicKey);
  assert.equal(send.outputs[1].publicKey, alice.publicKey);
  assert.deepEqual(decryptNote(send.encryptedOutputs[0], bob).amount, 900n);
  assert.deepEqual(decryptNote(send.encryptedOutputs[1], alice).amount, 100n);
  assert.throws(() => planTransaction({ kind: "send", keys: alice, notes, assetId: ASSET, amount: 1n, fee: 1n, to: bob.address }), /free/);

  const out = planTransaction({ kind: "unshield", keys: alice, notes: unspent(notes, new Set(), ASSET), assetId: ASSET, amount: 650n, fee: 10n });
  assert.equal(sum(out.inputs) + out.extAmount - out.fee, sum(out.outputs));
  assert.equal(out.outputs[0].amount, 40n);

  const dep = planTransaction({ kind: "deposit", keys: alice, notes: [], assetId: ASSET, amount: 500n, fee: 5n });
  assert.equal(dep.extAmount - dep.fee, sum(dep.outputs));
});

test("coin selection uses at most two notes", () => {
  const k = Keys.random();
  const notes = scanNotes([shieldEvent(k, 10n, 0, 0), shieldEvent(k, 20n, 1, 2), shieldEvent(k, 30n, 2, 4)], k, [ASSET]);
  const c = unspent(notes, new Set(), ASSET);
  assert.equal(selectNotes(c, 25n).length, 1);
  assert.equal(selectNotes(c, 45n).length, 2);
  assert.throws(() => selectNotes(c, 60n), /merge/);
});
