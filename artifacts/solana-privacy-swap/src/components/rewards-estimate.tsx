import { getGetDarkRewardsEstimateQueryKey, useGetDarkRewardsEstimate } from '@workspace/api-client-react';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Progress of confirmed holder distributions. The DARK Rewards console is the record of
 *  amounts and wallet counts; this site deliberately does not restate those figures, so the
 *  two surfaces cannot drift apart. */
export function RewardsEstimate({ className = '' }: { className?: string }) {
  const query = useGetDarkRewardsEstimate({ query: { queryKey: getGetDarkRewardsEstimateQueryKey(), staleTime: 60 * 60 * 1000, retry: 1 } });
  const data = query.data;
  if (query.isPending) return <p className={`rewards-estimate ${className}`} role="status">Loading the distribution record…</p>;
  if (!data) return <p className={`rewards-estimate ${className}`} role="status" data-testid="status-rewards-estimate-unavailable">The distribution record is unavailable right now.</p>;
  return <div className={`rewards-estimate ${className}`} data-testid="rewards-estimate">
    <p className="rewards-estimate-total"><strong>{ordinal(data.latestAirdrop.number)} $DARK airdrop complete</strong></p>
    <ul>
      <li>wNEAR paid direct to eligible holders, with no claim to make</li>
      <li>All payments verified on-chain</li>
    </ul>
    <small>Every round, the amount paid and the number of wallets paid are listed on the <a href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer">DARK Rewards console</a>, which is the record. Past distributions do not guarantee future payouts.</small>
  </div>;
}
