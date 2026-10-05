// Turns a wallet signature (or 24 words) into the 32-byte shielded secret.
import { sha256 } from "@noble/hashes/sha2.js";
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Keys } from "./wallet.js";

/** Signed by the user's wallet. No chain id or address, so any device opens the same balance. */
export const ACTIVATION_MESSAGE =
  "DarkSwap shielded balance v1\nThis signature is your spending key. Only sign it on darkswap.app or darkswap.world.";

/** secret = sha256(raw signature bytes). */
export function secretFromSignature(signature) {
  if (!(signature instanceof Uint8Array) || signature.length < 64) throw new Error("expected the raw signature bytes");
  return sha256(signature);
}

/** The 24 BIP-39 words that encode the 32-byte secret. */
export function secretToWords(secret) {
  if (secret.length !== 32) throw new Error("secret must be 32 bytes");
  return entropyToMnemonic(Uint8Array.from(secret), wordlist);
}

export function normalizeWords(words) {
  return words.trim().toLowerCase().split(/\s+/).join(" ");
}

export function wordsToSecret(words) {
  const phrase = normalizeWords(words);
  if (phrase.split(" ").length !== 24) throw new Error("enter all 24 words");
  if (!validateMnemonic(phrase, wordlist)) throw new Error("these words do not form a valid backup (check spelling and order)");
  return mnemonicToEntropy(phrase, wordlist);
}

export const keysFromSignature = (signature) => new Keys(secretFromSignature(signature));
export const keysFromWords = (words) => new Keys(wordsToSecret(words));

/**
 * Holds the unlocked keys in memory only. lock() drops them; they also drop
 * after `idleMs` (30 minutes) without touch(). Nothing is written to storage.
 */
export class KeySession {
  constructor({ idleMs = 30 * 60 * 1000, onLock } = {}) {
    this.idleMs = idleMs;
    this.onLock = onLock;
    this.keys = null;
    this.secret = null;
    this._timer = null;
  }
  unlock(secret) {
    this.lock(false);
    this.secret = Uint8Array.from(secret);
    this.keys = new Keys(this.secret);
    this.touch();
    return this.keys;
  }
  touch() {
    if (!this.keys) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.lock(), this.idleMs);
  }
  words() {
    if (!this.secret) throw new Error("locked");
    return secretToWords(this.secret);
  }
  lock(notify = true) {
    clearTimeout(this._timer);
    this._timer = null;
    if (this.secret) this.secret.fill(0);
    if (this.keys?._secret) this.keys._secret.fill(0);
    const wasOpen = this.keys !== null;
    this.secret = null;
    this.keys = null;
    if (notify && wasOpen) this.onLock?.();
  }
}
