import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { getGetZecDarkLiquidityQueryKey, useGetZecDarkLiquidity } from "@workspace/api-client-react";
import { Button } from "@workspace/darkswap-design-system/components/ui/button";
import "./zec-dark-liquidity.css";

const METEORA_URL = "https://www.meteora.ag/dammv2/5Tyakzwn8BF9cqXE5NZB9C5FJPn5UapAZMGCpXcPvU1u?referrer=portfolio";
const MAX_AGE_MS = 120_000;

const usd = (n: number, digits = 0) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const pct = (n: number) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)}%`;

export function ZecDarkLiquidity() {
  const query = useGetZecDarkLiquidity({
    query: { queryKey: getGetZecDarkLiquidityQueryKey(), staleTime: 30_000, refetchInterval: 60_000, retry: 1 },
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const data = query.data;
  const fetched = data ? Date.parse(data.fetchedAt) : NaN;
  const fresh = !query.isError && !!data && Number.isFinite(fetched) && now - fetched <= MAX_AGE_MS && fetched - now < MAX_AGE_MS;
  const loading = query.isPending;
  const live = fresh ? data : undefined;

  const stats = live
    ? [
        { label: "Liquidity", value: usd(live.liquidityUsd), id: "liquidity" },
        { label: "24h volume", value: usd(live.volume24hUsd), id: "volume" },
        { label: "24h fees", value: usd(live.fees24hUsd, 2), id: "fees" },
        { label: "Base fee", value: pct(live.baseFeePct), id: "base-fee" },
        { label: "Fees compounded", value: pct(live.compoundingFeePct), id: "compounding" },
        ...(live.permanentLockedPct !== null ? [{ label: "Permanently locked", value: pct(live.permanentLockedPct), id: "locked" }] : []),
      ]
    : [];

  return (
    <section className="launch-shell launch-section zec-liq" id="zec-dark-liquidity" aria-labelledby="zec-liq-title" data-testid="section-zec-dark-liquidity">
      <div className="section-head">
        <div>
          <span className="overline"><span className="overline-square" /> Public liquidity</span>
          <h2 id="zec-liq-title">ZEC-DARK pool.</h2>
        </div>
        <p>Protocol-funded ZEC-DARK liquidity on Solana (Meteora DAMM v2). It is not the Dark Pool, which is in development and not available to use.</p>
      </div>

      <div className="zec-liq-panel">
        {loading && !live && (
          <div className="zec-liq-grid" role="status" aria-live="polite" aria-label="Loading liquidity statistics" data-testid="status-zec-liquidity-loading">
            {Array.from({ length: 6 }, (_, i) => (
              <div className="zec-liq-cell" key={i}><span className="zec-liq-skel zec-liq-skel-s" /><span className="zec-liq-skel" /></div>
            ))}
          </div>
        )}

        {!loading && !live && (
          <div className="zec-liq-unavailable" role="status" data-testid="status-zec-liquidity-unavailable">
            <strong>Pool statistics are unavailable right now.</strong>
            <span>We hide numbers we cannot confirm are current. Live figures are on Meteora.</span>
          </div>
        )}

        {live && (
          <dl className="zec-liq-grid" data-testid="zec-liquidity-stats">
            {stats.map((s) => (
              <div className="zec-liq-cell" key={s.id}>
                <dt>{s.label}</dt>
                <dd data-testid={`text-zec-${s.id}`}>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <ul className="zec-liq-notes">
          {live && <li>{pct(live.baseFeePct)} is the base fee{live.dynamicFeeEnabled ? "; dynamic fees are possible, so the fee paid can be higher" : ""}.</li>}
          {live && <li>{pct(live.compoundingFeePct)} of LP fees is configured to compound into pool liquidity. This is not an APR or yield.</li>}
          <li data-testid="text-zec-liquidity-funding">Protocol-reported: the $DARK creator wallet funded 99.9% of the ZEC-DARK pool’s liquidity. Reported initial funding used 2 ZEC to buy DARK, paired with another 2 ZEC. Purchase and deposit transactions are not linked here yet. Funding does not mean all liquidity is withdrawable; the creator-held position includes vested and permanently locked portions.</li>
          <li>Pool balance growth alone does not prove compounded fee earnings. ZEC here is a token on Solana, not native or shielded Zcash.</li>
        </ul>

        <div className="zec-liq-foot">
          <span className="zec-liq-meta" data-testid="text-zec-liquidity-source">
            Source: Meteora
            {live ? <> · Updated <time dateTime={live.fetchedAt}>{new Date(fetched).toLocaleTimeString()}</time></> : null}
          </span>
          <Button asChild variant="link" className="zec-liq-link">
            <a href={METEORA_URL} target="_blank" rel="noopener noreferrer" data-testid="link-zec-dark-meteora">
              View pool on Meteora <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
