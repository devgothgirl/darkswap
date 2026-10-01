// Editorial proposal only. Do not import these values into execution or account-points logic.
export const rewardsProposalDate = "October 1, 2026";

export const rewardsSources = [
  { label: "StonkFun developer mechanics", href: "https://www.stonkfun.xyz/developers" },
  { label: "StonkFun rewards and asset caveat", href: "https://www.stonkfun.xyz/rewards-disclaimer" },
  { label: "Indexed threshold / cost wording (not reproduced by current fetch)", href: "https://www.stonkfun.xyz/token/FZhXxRsFdDWqmPmEw2hFzuiUAL1wEJUJ9LZg2xS5t3vN" },
  { label: "LaunchLab pricing example and withhold authority", href: "https://www.stonkfun.xyz/api/public/v1/launchlab/pricing?quoteMint=So11111111111111111111111111111111111111112" },
  { label: "Launchable quote-mint catalog", href: "https://www.stonkfun.xyz/api/public/v1/pairs?launchable=true&launchLabReady=true" },
  { label: "Solana transfer-fee extension", href: "https://solana.com/docs/tokens/extensions/transfer-fees" },
  { label: "NEAR Intents chain and address support", href: "https://docs.near-intents.org/resources/chain-support" },
  { label: "Zcash transparent versus shielded", href: "https://z.cash/learn/what-is-the-difference-between-shielded-and-transparent-zcash/" },
] as const;