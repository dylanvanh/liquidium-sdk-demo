import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AssetIcon } from "@/components/asset-icon";
import { Bar } from "@/components/dither-kit/bar";
import { BarChart } from "@/components/dither-kit/bar-chart";
import type { ChartConfig } from "@/components/dither-kit/chart-context";
import { Grid } from "@/components/dither-kit/grid";
import { Legend } from "@/components/dither-kit/legend";
import { Pie } from "@/components/dither-kit/pie";
import { PieChart } from "@/components/dither-kit/pie-chart";
import { Tooltip } from "@/components/dither-kit/tooltip";
import { XAxis } from "@/components/dither-kit/x-axis";
import { YAxis } from "@/components/dither-kit/y-axis";
import { Button } from "@/components/ui/button";
import { InsightsLoading } from "@/components/insights-loading";
import {
  fetchMarketData,
  formatBaseUnits,
  formatScaledRate,
  getErrorMessage,
  type MarketData,
} from "./liquidium";
import { buildMarketInsights } from "./insights";

const CAPITAL_CONFIG = {
  suppliedUsd: { label: "Supplied", color: "green" },
  borrowedUsd: { label: "Borrowed", color: "blue" },
} satisfies ChartConfig;

const ASSET_COLORS = ["orange", "blue", "purple", "green", "pink", "red"] as const;

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000 ? 2 : 0,
  }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export default function InsightsApp() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMarketData()
      .then((data) => {
        if (cancelled) return;
        setMarket(data);
        setUpdatedAt(new Date());
      })
      .catch((cause) => !cancelled && setError(getErrorMessage(cause)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [requestVersion]);

  const rows = useMemo(() => (market ? buildMarketInsights(market) : []), [market]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          supplied: sum.supplied + row.suppliedUsd,
          borrowed: sum.borrowed + row.borrowedUsd,
          available: sum.available + row.availableUsd,
        }),
        { supplied: 0, borrowed: 0, available: 0 },
      ),
    [rows],
  );
  const pieConfig = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row, index) => [
          row.asset,
          {
            label: row.asset,
            color: ASSET_COLORS[index % ASSET_COLORS.length],
          },
        ]),
      ) satisfies ChartConfig,
    [rows],
  );

  if (loading && !market) return <InsightsLoading />;

  if (error && !market) {
    return (
      <section className="insights-view insights-state" aria-labelledby="insights-title">
        <p className="eyebrow">Protocol pulse</p>
        <h1 id="insights-title">Markets could not be loaded.</h1>
        <p>{error}</p>
        <Button type="button" onClick={() => setRequestVersion((value) => value + 1)}>
          Try again
        </Button>
      </section>
    );
  }

  return (
    <section className="insights-view" aria-labelledby="insights-title">
      <header className="insights-heading">
        <div>
          <p className="eyebrow">Protocol pulse</p>
          <h1 id="insights-title">Markets at a glance.</h1>
          <p>
            Live pool liquidity, borrowing, and rates from the Liquidium SDK. No historical values
            are inferred.
          </p>
        </div>
        <div className="insights-refresh">
          <span>
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Live mainnet data"}
          </span>
          <Button
            variant="outline"
            type="button"
            disabled={loading}
            onClick={() => setRequestVersion((value) => value + 1)}
          >
            <RefreshCw aria-hidden="true" className={loading ? "is-spinning" : undefined} />
            {loading ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </header>

      {error ? (
        <p className="insights-warning">Showing the previous snapshot. Refresh failed: {error}</p>
      ) : null}

      <div className="insight-metrics" aria-label="Protocol totals">
        <InsightMetric label="Total supplied" value={formatCompactUsd(totals.supplied)} />
        <InsightMetric label="Total borrowed" value={formatCompactUsd(totals.borrowed)} />
        <InsightMetric label="Total available" value={formatCompactUsd(totals.available)} />
      </div>

      {rows.length === 0 ? (
        <div className="insights-empty">
          <span>∿</span>
          <h2>No supported pools returned</h2>
          <p>The SDK response was valid, but there are no markets to chart.</p>
        </div>
      ) : (
        <>
          <div className="insight-charts">
            <article className="insight-panel capital-panel">
              <div className="insight-panel-heading">
                <div>
                  <p className="eyebrow">Capital by market</p>
                  <h2>Supplied vs borrowed</h2>
                </div>
                <span>USD snapshot</span>
              </div>
              <div className="capital-chart">
                <BarChart
                  data={rows}
                  config={CAPITAL_CONFIG}
                  margins={{ top: 34, right: 12, bottom: 28, left: 58 }}
                  bloom="low"
                  bloomOnHover
                >
                  <Grid />
                  <XAxis dataKey="asset" />
                  <YAxis tickFormatter={formatCompactUsd} />
                  <Legend isClickable />
                  <Tooltip labelKey="asset" valueFormatter={formatUsd} variant="frosted-glass" />
                  <Bar dataKey="suppliedUsd" variant="gradient" isClickable />
                  <Bar dataKey="borrowedUsd" variant="hatched" isClickable />
                </BarChart>
              </div>
            </article>

            <article className="insight-panel share-panel">
              <div className="insight-panel-heading">
                <div>
                  <p className="eyebrow">Market composition</p>
                  <h2>Share of deposits</h2>
                </div>
              </div>
              <div className="share-chart">
                <PieChart
                  data={rows}
                  config={pieConfig}
                  dataKey="suppliedUsd"
                  nameKey="asset"
                  innerRadius={0.58}
                  margins={{ top: 34 }}
                  bloom="low"
                  bloomOnHover
                >
                  <Legend isClickable align="center" />
                  <Tooltip valueFormatter={formatUsd} variant="frosted-glass" />
                  <Pie variant="gradient" />
                </PieChart>
                <div className="share-chart-total" aria-hidden="true">
                  <strong>{formatCompactUsd(totals.supplied)}</strong>
                  <span>supplied</span>
                </div>
              </div>
            </article>
          </div>

          <section className="market-table-section" aria-labelledby="markets-title">
            <div className="insight-panel-heading">
              <div>
                <p className="eyebrow">All assets</p>
                <h2 id="markets-title">Market details</h2>
              </div>
              <span>{rows.length} pools</span>
            </div>
            <div className="market-table-scroll">
              <table className="market-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Price</th>
                    <th>Supply APY</th>
                    <th>Borrow APY</th>
                    <th>Deposits</th>
                    <th>Utilization</th>
                    <th>Optimal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.pool.id}>
                      <td>
                        <span className="market-asset">
                          <AssetIcon asset={row.pool.asset} chain={row.pool.chain} />
                          <span>
                            <strong>{row.asset}</strong>
                            <small>{row.pool.chain}</small>
                          </span>
                        </span>
                      </td>
                      <td>{formatUsd(row.price)}</td>
                      <td>{formatScaledRate(row.pool.lendingRate, row.pool.rateDecimals)}</td>
                      <td>{formatScaledRate(row.pool.borrowingRate, row.pool.rateDecimals)}</td>
                      <td>
                        <strong>{formatCompactUsd(row.suppliedUsd)}</strong>
                        <small>
                          {formatBaseUnits(row.pool.totalSupply, row.pool.decimals)} {row.asset}
                        </small>
                      </td>
                      <td>{row.utilization.toFixed(2)}%</td>
                      <td>{row.optimalUtilization.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function InsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>Live pool sum</small>
    </article>
  );
}
