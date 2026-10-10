/** The rewards console owns changing payout records and rules. This summary
 * deliberately avoids locally maintained round numbers, totals and wallet counts. */
export function RewardsEstimate({ className = '' }: { className?: string }) {
  return <div className={`rewards-estimate ${className}`} data-testid="rewards-estimate">
    <p className="rewards-estimate-total"><strong>Holder rewards, on record.</strong></p>
    <ul>
      <li>Scheduled wNEAR holder payouts and one completed ZEC-token award</li>
      <li>Confirmed holder payments, with on-chain proof on the console</li>
      <li>ZEC treasury purchases and holdings are separate from rewards paid to holders</li>
    </ul>
    <small>Current eligibility rules, payout totals and proof are on the <a href="https://rewards.darkswap.app" target="_blank" rel="noopener noreferrer">DARK Rewards console</a>, which is the record. USD totals there are current-price estimates, not payout-time value. ZEC here is a token on Solana, not native or shielded Zcash. Further ZEC awards require separate approval. Past distributions do not guarantee future payouts.</small>
  </div>;
}
