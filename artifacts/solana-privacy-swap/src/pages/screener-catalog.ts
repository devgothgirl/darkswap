// Provider-reported quote-pair catalog captured from StonkFun's public /pairs
// endpoint on 2026-09-27. This is a static discovery snapshot, not a live market
// feed or an independent verification of issuance, backing, or availability.
export const CATALOG_AS_OF = '2026-09-27';
export type RwaCatalogEntry = { name: string; symbol: string; mint: string; category: 'xstock' | 'prestock' };
export const RWA_CATALOG: readonly RwaCatalogEntry[] = [
  { name: "SP500", symbol: "SPYX", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", category: "xstock" },
  { name: "NVIDIA", symbol: "NVDAX", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", category: "xstock" },
  { name: "GOOGLE", symbol: "GOOGLX", mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN", category: "xstock" },
  { name: "QQQ", symbol: "QQQX", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ", category: "xstock" },
  { name: "TESLA", symbol: "TSLAX", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", category: "xstock" },
  { name: "CIRCLE", symbol: "CRCLX", mint: "XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1", category: "xstock" },
  { name: "COIN", symbol: "COINX", mint: "Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu", category: "xstock" },
  { name: "MICROSTRATEGY", symbol: "MSTRX", mint: "XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", category: "xstock" },
  { name: "AMAZON", symbol: "AMZNX", mint: "Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg", category: "xstock" },
  { name: "HOOD", symbol: "HOODX", mint: "XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg", category: "xstock" },
  { name: "SPACEX", symbol: "SPCXX", mint: "Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8", category: "xstock" },
  { name: "APPLE", symbol: "APPLX", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", category: "xstock" },
  { name: "GOLD", symbol: "GLDX", mint: "Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re", category: "xstock" },
  { name: "META", symbol: "METAX", mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu", category: "xstock" },
  { name: "PLTR", symbol: "PLTRX", mint: "XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4", category: "xstock" },
  { name: "MSFT", symbol: "MSFTX", mint: "XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX", category: "xstock" },
  { name: "GME", symbol: "GMEX", mint: "Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc", category: "xstock" },
  { name: "STRCX", symbol: "STRCX", mint: "Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH", category: "xstock" },
  { name: "MCDX", symbol: "MCDX", mint: "XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2", category: "xstock" },
  { name: "BRKX", symbol: "BRKX", mint: "Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x", category: "xstock" },
  { name: "COCA COLA", symbol: "KOX", mint: "XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ", category: "xstock" },
  { name: "INTC", symbol: "INTCX", mint: "XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM", category: "xstock" },
  { name: "ANTHROPIC", symbol: "ANTHROPIC", mint: "Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw", category: "prestock" },
  { name: "ANDURIL", symbol: "ANDURIL", mint: "PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB", category: "prestock" },
  { name: "POLYMARKET", symbol: "POLYMARKET", mint: "Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP", category: "prestock" },
  { name: "KALSHI", symbol: "KALSHI", mint: "PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua", category: "prestock" },
  { name: "NEURALINK", symbol: "NEURALINK", mint: "PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S", category: "prestock" },
  { name: "OPENAI", symbol: "OPENAI", mint: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF", category: "prestock" },
  { name: "VIDAX", symbol: "VIDAX", mint: "XsfCC9VL4DamVGNgdJpfLXB3sBVa158Gbx8sh7NzmTk", category: "xstock" },
  { name: "FIGUREAI", symbol: "FIGUREAI", mint: "PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd", category: "prestock" },
  { name: "DFDV", symbol: "DFDV", mint: "Xs2yquAgsHByNzx68WJC55WHjHBvG9JsMB7CWjTLyPy", category: "xstock" },
];