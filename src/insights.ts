import type { Pool } from "@liquidium/client";
import { formatBaseUnits, type MarketData } from "./liquidium";

export type MarketInsight = {
  pool: Pool;
  asset: string;
  price: number;
  suppliedUsd: number;
  borrowedUsd: number;
  availableUsd: number;
  utilization: number;
  optimalUtilization: number;
  supplyApy: number;
  borrowApy: number;
};

export function buildMarketInsights(market: MarketData): MarketInsight[] {
  return market.pools
    .map((pool) => {
      const price = market.prices[pool.asset] ?? 0;
      return {
        pool,
        asset: pool.asset,
        price,
        suppliedUsd: toAssetAmount(pool.totalSupply, pool.decimals) * price,
        borrowedUsd: toAssetAmount(pool.totalDebt, pool.decimals) * price,
        availableUsd: toAssetAmount(pool.availableLiquidity, pool.decimals) * price,
        utilization: toRatePercent(pool.utilizationRate, pool.rateDecimals),
        optimalUtilization: toRatePercent(pool.optimalUtilizationRate, pool.rateDecimals),
        supplyApy: toRatePercent(pool.lendingRate, pool.rateDecimals),
        borrowApy: toRatePercent(pool.borrowingRate, pool.rateDecimals),
      };
    })
    .sort((a, b) => b.suppliedUsd - a.suppliedUsd);
}

function toAssetAmount(amount: bigint, decimals: bigint): number {
  return Number(formatBaseUnits(amount, decimals, 8));
}

function toRatePercent(rate: bigint, decimals: bigint): number {
  return Number(formatBaseUnits(rate * 100n, decimals, 4));
}
