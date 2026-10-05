// Some pool dependencies (circomlibjs, @solana/web3.js) expect Node's Buffer.
// Imported first by the pool section so it exists before they evaluate.
import { Buffer } from 'buffer';

const g = globalThis as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
