import darkToken from '../token-identity.json';

// Editorial proposal only. Do not import these values into execution or account-points logic.
export const rewardsProposalDate = "October 1, 2026";

export const rewardsSources = [
  { label: "Official DARK listing: provider-reported graduation, NEAR pairing and market activity", href: darkToken.listingUrl },
  { label: "StonkFun general developer mechanics (not verified DARK fee configuration)", href: "https://www.stonkfun.xyz/developers" },
  { label: "StonkFun general rewards and asset caveat", href: "https://www.stonkfun.xyz/rewards-disclaimer" },
  { label: "Solana transfer-fee extension (general reference; DARK tax details unverified)", href: "https://solana.com/docs/tokens/extensions/transfer-fees" },
  { label: "NEAR Intents chain and address support", href: "https://docs.near-intents.org/resources/chain-support" },
  { label: "Zcash transparent versus shielded", href: "https://z.cash/learn/what-is-the-difference-between-shielded-and-transparent-zcash/" },
] as const;