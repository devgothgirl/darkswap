import { Buffer } from "buffer";
export function toBigIntLE(bytes: Uint8Array): bigint;
export function toBigIntBE(bytes: Uint8Array): bigint;
export function toBufferLE(value: bigint, width: number): Buffer;
export function toBufferBE(value: bigint, width: number): Buffer;