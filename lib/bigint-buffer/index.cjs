"use strict";
const { Buffer } = require("buffer");

function decode(bytes, littleEndian) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("Expected bytes");
  let value = 0n;
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[littleEndian ? bytes.length - index - 1 : index];
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function encode(value, width, littleEndian) {
  if (typeof value !== "bigint") throw new TypeError("Expected BigInt");
  if (!Number.isSafeInteger(width) || width < 0 || width > 1048576) {
    throw new RangeError("Invalid buffer width");
  }
  if (value < 0n || value.toString(16).length > Math.max(1, width * 2) || (width === 0 && value !== 0n)) {
    throw new RangeError("BigInt does not fit buffer width");
  }
  const bytes = Buffer.alloc(width);
  for (let index = 0; index < width; index++) {
    bytes[littleEndian ? index : width - index - 1] = Number(value & 255n);
    value >>= 8n;
  }
  return bytes;
}

exports.toBigIntLE = bytes => decode(bytes, true);
exports.toBigIntBE = bytes => decode(bytes, false);
exports.toBufferLE = (value, width) => encode(value, width, true);
exports.toBufferBE = (value, width) => encode(value, width, false);