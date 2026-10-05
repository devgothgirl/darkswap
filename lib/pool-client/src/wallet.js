// Chain-independent wallet logic: keys, shielded addresses, note
// encryption, note scanning and coin selection. The browser client will
// reuse this file as is; only the chain adapters (evm.mjs, solana.mjs) differ.
import { x25519 } from "@noble/curves/ed25519.js";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { Buffer } from "buffer";
import { randomBytes } from "./random.js";
import {
  FIELD, mod, poseidon, publicKeyOf, inputNote, outputNote, randomField, dummyInput,
} from "./lib.js";

const enc = new TextEncoder();
const toHex = (b) => Buffer.from(b).toString("hex");
const beBytes = (x, n) => Buffer.from(BigInt(x).toString(16).padStart(n * 2, "0"), "hex");
const fromBe = (b) => BigInt("0x" + (toHex(b) || "0"));

// ---- keys ------------------------------------------------------------------

/**
 * All keys come from one 32-byte secret. In the app the secret is a hash of
 * the user's wallet signature over a fixed message (or their 24 words).
 */
export class Keys {
  constructor(secret) {
    if (secret.length !== 32) throw new Error("secret must be 32 bytes");
    const derive = (label) => sha256(Buffer.concat([Buffer.from(secret), enc.encode(label)]));
    this.privateKey = mod(fromBe(derive("darkswap.spend")));
    this.publicKey = publicKeyOf(this.privateKey);
    this.encPrivate = derive("darkswap.encrypt");
    this.encPublic = x25519.getPublicKey(this.encPrivate);
    this._secret = Buffer.from(secret);
  }
  /**
   * One-time spending key for the i-th public deposit. A deposit publishes
   * its public key, so reusing one key would link all of a wallet's deposits.
   */
  depositPrivateKey(i) {
    const h = sha256(Buffer.concat([this._secret, enc.encode("darkswap.deposit"), beBytes(i, 8)]));
    return mod(fromBe(h));
  }

  static random() {
    return new Keys(randomBytes(32));
  }
  /** What someone needs to pay you: 32-byte public key + 32-byte encryption key. */
  get address() {
    return encodeAddress(this.publicKey, this.encPublic);
  }
}

// dark1 + hex(publicKey || encPublic || 4-byte checksum). Bech32m comes later;
// the checksum already refuses mistyped addresses.
export function encodeAddress(publicKey, encPublic) {
  const body = Buffer.concat([beBytes(publicKey, 32), Buffer.from(encPublic)]);
  const check = sha256(Buffer.concat([enc.encode("dark1"), body])).slice(0, 4);
  return "dark1" + toHex(Buffer.concat([body, check]));
}

export function decodeAddress(address) {
  if (!address.startsWith("dark1")) throw new Error("not a dark1 address");
  const raw = Buffer.from(address.slice(5), "hex");
  if (raw.length !== 68) throw new Error("bad address length");
  const body = raw.subarray(0, 64);
  const check = sha256(Buffer.concat([enc.encode("dark1"), body])).slice(0, 4);
  if (!Buffer.from(check).equals(raw.subarray(64))) throw new Error("address checksum does not match");
  const publicKey = fromBe(body.subarray(0, 32));
  if (publicKey >= FIELD) throw new Error("public key out of field");
  return { publicKey, encPublic: new Uint8Array(body.subarray(32)) };
}

// ---- note encryption -------------------------------------------------------
// ciphertext = ephemeralPub(32) || chacha20poly1305(key, nonce=0, amount(16) || blinding(32))
// key = sha256("darkswap.note" || ECDH(ephemeral, recipient) || ephemeralPub || recipientEncPub)
// Each message has a fresh ephemeral key, so its derived key is used once
// and a fixed nonce is safe. The asset is not encrypted: the recipient
// tries each listed asset when rebuilding the commitment.

export const ENCRYPTED_NOTE_BYTES = 32 + 48 + 16;

function noteKey(shared, ephPub, recipientPub) {
  return sha256(Buffer.concat([enc.encode("darkswap.note"), shared, ephPub, recipientPub]));
}

export function encryptNote({ amount, blinding }, recipientEncPub) {
  const eph = randomBytes(32);
  const ephPub = x25519.getPublicKey(eph);
  const key = noteKey(x25519.getSharedSecret(eph, recipientEncPub), ephPub, recipientEncPub);
  const plain = Buffer.concat([beBytes(amount, 16), beBytes(blinding, 32)]);
  const sealed = chacha20poly1305(key, new Uint8Array(12)).encrypt(plain);
  return new Uint8Array(Buffer.concat([ephPub, sealed]));
}

/** Returns { amount, blinding } or null if this note is not for these keys. */
export function decryptNote(ciphertext, keys) {
  const bytes = Buffer.from(ciphertext);
  if (bytes.length !== ENCRYPTED_NOTE_BYTES) return null;
  const ephPub = bytes.subarray(0, 32);
  try {
    const key = noteKey(x25519.getSharedSecret(keys.encPrivate, ephPub), ephPub, keys.encPublic);
    const plain = chacha20poly1305(key, new Uint8Array(12)).decrypt(bytes.subarray(32));
    return { amount: fromBe(plain.subarray(0, 16)), blinding: fromBe(plain.subarray(16)) };
  } catch {
    return null;
  }
}

// ---- scanning --------------------------------------------------------------

/**
 * Finds the notes these keys own among public commitments.
 * `events`: [{ commitment, index, encryptedOutput }]
 * `assetIds`: candidate asset ids (listed assets)
 * Returns notes with amount, assetId, blinding, pathIndex, commitment, nullifier.
 */
export function scanNotes(events, keys, assetIds, gap = 64) {
  // Deposit keys are numbered. Keep widening the search while notes turn up
  // near its edge, so a wallet with many deposits still finds all of them
  // (the usual "gap limit" from HD wallets).
  const opened = [];
  for (const ev of events) {
    const o = decryptNote(ev.encryptedOutput, keys);
    if (o) opened.push({ ev, ...o });
  }
  const found = new Map();
  let window = gap;
  let searched = -1; // deposit numbers below this are already tried
  for (;;) {
    const candidates = [];
    if (searched < 0) candidates.push({ privateKey: keys.privateKey, depositNumber: null });
    for (let i = Math.max(searched, 0); i < window; i++) candidates.push({ privateKey: keys.depositPrivateKey(i), depositNumber: i });
    for (const { ev, amount, blinding } of opened) {
      if (found.has(ev.index)) continue;
      search: for (const { privateKey, depositNumber } of candidates) {
        for (const assetId of assetIds) {
          const note = inputNote({ amount, assetId, privateKey, blinding, pathIndex: Number(ev.index) });
          if (note.commitment === BigInt(ev.commitment)) {
            found.set(ev.index, { ...note, depositNumber });
            break search;
          }
        }
      }
    }
    searched = window;
    const highest = Math.max(-1, ...[...found.values()].map((n) => n.depositNumber ?? -1));
    if (highest < window - gap) break; // at least `gap` unused keys after the last one found
    window += gap;
  }
  return [...found.values()].sort((x, y) => x.pathIndex - y.pathIndex);
}

/** The deposit number to use for the next public deposit. */
export function nextDepositNumber(notes) {
  return 1 + Math.max(-1, ...notes.map((n) => n.depositNumber ?? -1));
}

/**
 * Arguments for a public deposit (shield) of `amount`, using the wallet's
 * `depositNumber`-th one-time key. The note is encrypted to the wallet
 * itself so it is found again on any device.
 */
export function planShield({ keys, amount, depositNumber }) {
  const privateKey = keys.depositPrivateKey(depositNumber);
  const blinding = randomField();
  return {
    publicKey: publicKeyOf(privateKey),
    blinding,
    encryptedOutput: encryptNote({ amount: BigInt(amount), blinding }, keys.encPublic),
  };
}

/** Unspent notes of one asset, largest first. */
export function unspent(notes, spentSet, assetId) {
  return notes
    .filter((n) => n.assetId === BigInt(assetId) && n.amount > 0n && !spentSet.has(n.nullifier))
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

/** Picks at most two notes covering `need`. */
export function selectNotes(candidates, need) {
  if (need <= 0n) return [];
  for (const n of candidates) if (n.amount >= need) return [n];
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++)
      if (candidates[i].amount + candidates[j].amount >= need) return [candidates[i], candidates[j]];
  throw new Error("not enough in two notes; merge notes first with a send to yourself");
}

// ---- building transactions -------------------------------------------------

/**
 * Plans the notes for one transaction.
 *   kind "send":     pay `amount` to `to` (a dark1 address); change back to `keys`.
 *   kind "unshield": pay `amount` + `fee` out of the pool; change back to `keys`.
 *   kind "deposit":  bring `amount` into the pool through the circuit.
 * Returns { inputs, outputs, encryptedOutputs, extAmount, fee }.
 */
export function planTransaction({ kind, keys, notes, assetId, amount, fee = 0n, to }) {
  amount = BigInt(amount);
  fee = BigInt(fee);
  let inputs, extAmount, payTo;
  if (kind === "deposit") {
    inputs = [];
    extAmount = amount;
    payTo = { publicKey: keys.publicKey, encPublic: keys.encPublic, amount: amount - fee };
  } else if (kind === "send") {
    if (fee !== 0n) throw new Error("relayed sends are free; a fee would reveal the asset");
    inputs = selectNotes(notes, amount);
    extAmount = 0n;
    const dest = decodeAddress(to);
    payTo = { ...dest, amount };
  } else if (kind === "unshield") {
    inputs = selectNotes(notes, amount + fee);
    extAmount = -amount;
    payTo = null;
  } else throw new Error(`unknown kind ${kind}`);

  const inTotal = inputs.reduce((s, n) => s + n.amount, 0n);
  const change = inTotal + extAmount - fee - (payTo ? (kind === "deposit" ? 0n : payTo.amount) : 0n);
  if (change < 0n) throw new Error("inputs do not cover the transaction");

  const self = { publicKey: keys.publicKey, encPublic: keys.encPublic };
  const recipients =
    kind === "deposit" ? [payTo, { ...self, amount: 0n }]
    : kind === "send" ? [payTo, { ...self, amount: change }]
    : [{ ...self, amount: change }, { ...self, amount: 0n }];

  const outputs = recipients.map((r) =>
    outputNote({ amount: r.amount, assetId, publicKey: r.publicKey, blinding: randomField() }));
  const encryptedOutputs = outputs.map((o, i) =>
    encryptNote({ amount: o.amount, blinding: o.blinding }, recipients[i].encPublic));
  return { inputs, outputs, encryptedOutputs, extAmount, fee };
}

/** The pool's protocol fee on `amount` at `bps`, rounded up (same rule on both chains). */
export const protocolFeeOn = (amount, bps) => (BigInt(amount) * BigInt(bps) + 9_999n) / 10_000n;

export { dummyInput, randomField };
