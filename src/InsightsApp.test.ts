import { describe, expect, it } from "vitest";
import { Asset, Chain, type Pool } from "@liquidium/client";
import { buildMarketInsights } from "./insights";

describe("market insights", () => {
  it("derives truthful USD totals and rate percentages from the SDK pool snapshot", () => {
    const pool = {
      id: "btc-pool",
      asset: Asset.BTC,
      chain: Chain.BTC,
      decimals: 8n,
      totalSupply: 200_000_000n,
      totalDebt: 50_000_000n,
      availableLiquidity: 150_000_000n,
      utilizationRate: 25_000_000n,
      optimalUtilizationRate: 80_000_000n,
      lendingRate: 1_250_000n,
      borrowingRate: 5_000_000n,
      rateDecimals: 8n,
    } as Pool;

    const [insight] = buildMarketInsights({
      pools: [pool],
      prices: { BTC: 60_000 },
      routes: [],
    });

    expect(insight.suppliedUsd).toBe(120_000);
    expect(insight.borrowedUsd).toBe(30_000);
    expect(insight.availableUsd).toBe(90_000);
    expect(insight.utilization).toBe(25);
    expect(insight.optimalUtilization).toBe(80);
    expect(insight.supplyApy).toBe(1.25);
    expect(insight.borrowApy).toBe(5);
  });
});
