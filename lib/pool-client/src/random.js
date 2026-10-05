// crypto.getRandomValues works in browsers, Web Workers and Node 20+.
import { Buffer } from "buffer";

export function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return Buffer.from(out.buffer, out.byteOffset, n);
}
