import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  Chain,
  SimpleLoanCreatedError,
  type SimpleLoan,
  type Pool,
} from "@liquidium/client";
import {
  InstantLoanRecoveryError,
  client,
  getInflowQuote,
  buildAssetRoutes,
  buildInstantLoanRequest,
  formatActivityStatusDetail,
  formatBaseUnits,
  formatHealthFactor,
  getRoute,
  getPool,
  getRecoverableInstantLoanId,
  parseDecimalToBaseUnits,
  routeKey,
  recoverCreatedInstantLoan,
  selectChainTarget,
  type AssetRoute,
  type QuoteState,
} from "./liquidium";

afterEach(() => vi.restoreAllMocks());

function pool(asset: Pool["asset"], id: string, decimals: bigint): Pool {
  const chain = asset === Asset.BTC ? Chain.BTC : asset === Asset.ICP ? Chain.ICP : Chain.ETH;
  return { asset, chain, id, decimals, frozen: false } as Pool;
}

describe("production SDK configuration", () => {
  it("selects the bundled mainnet SOL pool for native SOL and ckSOL", async () => {
    // given
    const mainnetSolPool = {
      ...pool(Asset.SOL, "xhh4q-qyaaa-aaaar-qci2q-cai", 9n),
      chain: Chain.SOL,
    };
    const retiredSolPool = { ...mainnetSolPool, id: "retired-sol", frozen: true };
    vi.spyOn(client.market, "listPools").mockResolvedValue([retiredSolPool, mainnetSolPool]);

    // when
    const nativePool = await client.market.findPool({ asset: Asset.SOL, chain: Chain.SOL });
    const chainKeyPool = await client.market.findPool({ asset: Asset.SOL, chain: Chain.ICP });

    // then
    expect(nativePool.id).toBe(mainnetSolPool.id);
    expect(chainKeyPool.id).toBe(mainnetSolPool.id);
  });

  it("uses the production SDK API without a deployment override", async () => {
    // given
    const fetchRequest = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ items: [] })));

    // when
    await client.history.getProtocolActivity();

    // then
    const EXPECTED_API_URL = "https://app.liquidium.fi/api/sdk/v2/history/activities";
    expect(fetchRequest).toHaveBeenCalledExactlyOnceWith(EXPECTED_API_URL, expect.any(Object));
  });
});

describe("Liquidium route helpers", () => {
  it("exposes native SOL and ckSOL only for the unfrozen pool", () => {
    // given
    const activePool = { ...pool(Asset.SOL, "active-sol", 9n), chain: Chain.SOL };
    const retiredPool = { ...activePool, id: "retired-sol", frozen: true };

    // when
    const routes = buildAssetRoutes([retiredPool, activePool]);

    // then
    expect(routes).toEqual([
      {
        poolId: activePool.id,
        asset: Asset.SOL,
        chain: Chain.SOL,
        displaySymbol: "SOL",
        decimals: 9n,
      },
      {
        poolId: activePool.id,
        asset: Asset.SOL,
        chain: Chain.ICP,
        displaySymbol: "ckSOL",
        decimals: 9n,
      },
    ]);
  });
  it("expands backing pools into native and ICP asset identifiers", () => {
    // given
    const pools = [
      pool(Asset.BTC, "btc-pool", 8n),
      pool(Asset.ICP, "icp-pool", 8n),
      pool(Asset.ETH, "eth-pool", 18n),
      pool(Asset.USDT, "usdt-pool", 6n),
    ];

    // when
    const routes = buildAssetRoutes(pools);

    // then
    expect(routes.map((route) => [route.chain, route.displaySymbol])).toEqual([
      [Chain.BTC, "BTC"],
      [Chain.ICP, "ckBTC"],
      [Chain.ICP, "ICP"],
      [Chain.ETH, "ETH"],
      [Chain.ICP, "ckETH"],
      [Chain.ETH, "USDT"],
      [Chain.ICP, "ckUSDT"],
    ]);
    expect(getRoute(routes, "ICP:USDT")?.poolId).toBe("usdt-pool");
  });

  it("uses stable chain and asset route keys", () => {
    expect(routeKey({ chain: Chain.ICP, asset: Asset.USDC })).toBe("ICP:USDC");
  });

  it("resolves pools and transfer targets without losing the selected chain", () => {
    const pools = [pool(Asset.BTC, "btc-pool", 8n), pool(Asset.USDC, "usdc-pool", 6n)];
    expect(getPool(pools, "usdc-pool")?.asset).toBe(Asset.USDC);
    expect(selectChainTarget({ [Chain.BTC]: "native", [Chain.ICP]: "icrc" }, Chain.ICP)).toBe(
      "icrc",
    );
    expect(selectChainTarget({ [Chain.BTC]: "native" }, Chain.ICP, false)).toBeUndefined();
  });
});

describe("SOL inflow quotes", () => {
  const route: AssetRoute = {
    asset: Asset.SOL,
    chain: Chain.SOL,
    poolId: "xhh4q-qyaaa-aaaar-qci2q-cai",
    displaySymbol: "SOL",
    decimals: 9n,
  };

  it("includes the profile and repayment action in account-specific fee requests", async () => {
    // given
    const profileId = "test-profile";
    const amount = 1_000_000n;
    const fee = 500n;
    const minimumSendAmount = 501n;
    const estimate = vi
      .spyOn(client.lending, "estimateInflowFee")
      .mockResolvedValue({ totalFee: fee, minimumSendAmount });

    // when
    const quote = await getInflowQuote(route, amount, { profileId, action: "repayment" });

    // then
    expect(estimate).toHaveBeenCalledWith({ ...route, profileId, action: "repayment" });
    expect(quote).toEqual({ amount, fee, total: amount + fee });
  });

  it("rejects a quote below the minimum instead of showing an unsafe manual transfer", async () => {
    // given
    const amount = 1n;
    const fee = 500n;
    const minimumSendAmount = 1_000_000n;
    vi.spyOn(client.lending, "estimateInflowFee").mockResolvedValue({
      totalFee: fee,
      minimumSendAmount,
    });

    // when
    const quote = getInflowQuote(route, amount, { profileId: "test-profile", action: "deposit" });

    // then
    await expect(quote).rejects.toThrow("Transfer must be at least 0.001 SOL");
  });

  it("does not replace a failed SOL fee request with zero fees", async () => {
    // given
    const amount = 1_000_000n;
    const cause = new Error("SOL quotes unavailable");
    vi.spyOn(client.lending, "estimateInflowFee").mockRejectedValue(cause);

    // when
    const quote = getInflowQuote(route, amount, { profileId: "test-profile", action: "deposit" });

    // then
    await expect(quote).rejects.toBe(cause);
  });
});

describe("amount conversion", () => {
  it("converts decimal input to base units without floating point math", () => {
    expect(parseDecimalToBaseUnits("12.345", 6n)).toBe(12_345_000n);
    expect(formatBaseUnits(12_345_000n, 6n)).toBe("12.345");
  });

  it("rejects excess precision", () => {
    expect(() => parseDecimalToBaseUnits("1.001", 2n)).toThrow("no more than 2");
  });
});

describe("portfolio display formatting", () => {
  it("derives a health factor when the live aggregate returns an invalid zero", () => {
    expect(
      formatHealthFactor({
        totalDebtUsd: 74_060_000n,
        healthFactor: 0n,
        currentLtvBps: 1_441n,
        weightedLiquidationThresholdBps: 7_500n,
      }),
    ).toBe("5.20");
  });

  it("does not show a pending chain message for completed activity", () => {
    expect(
      formatActivityStatusDetail({
        operation: "borrow",
        state: "completed",
        confirmations: null,
        requiredConfirmations: null,
      }),
    ).toBe("Finalized on chain");
    expect(
      formatActivityStatusDetail({
        operation: "borrow",
        state: "processing",
        confirmations: null,
        requiredConfirmations: null,
      }),
    ).toBe("Processing protocol update");
  });
});

describe("simple-loan request", () => {
  it("keeps transfer chains on borrow and refund legs", () => {
    // given
    const collateralRoute: AssetRoute = {
      chain: Chain.ICP,
      asset: Asset.BTC,
      poolId: "btc-pool",
      displaySymbol: "ckBTC",
      decimals: 8n,
    };
    const borrowRoute: AssetRoute = {
      chain: Chain.ICP,
      asset: Asset.USDT,
      poolId: "usdt-pool",
      displaySymbol: "ckUSDT",
      decimals: 6n,
    };
    const quote = {
      status: "ready",
      collateralAmount: 100_000n,
      borrowAmount: 10_000_000n,
      ltv: { maxAllowedLtvBps: 6_000n },
    } as Extract<QuoteState, { status: "ready" }>;

    // when
    const request = buildInstantLoanRequest({
      collateralRoute,
      borrowRoute,
      quote,
      borrowDestination: "aaaaa-aa",
      refundDestination: "aaaaa-aa",
    });

    // then
    expect(request.collateral).toMatchObject({ poolId: "btc-pool", asset: Asset.BTC });
    expect(request.borrow).toMatchObject({
      chain: Chain.ICP,
      asset: Asset.USDT,
      destination: "aaaaa-aa",
    });
    expect(request.refund).toEqual({
      chain: Chain.ICP,
      destination: "aaaaa-aa",
    });
  });

  it("retains the created loan id when hydration fails", () => {
    const error = new SimpleLoanCreatedError(42n, new Error("hydrate failed"));
    expect(getRecoverableInstantLoanId(error)).toBe(42n);
    expect(getRecoverableInstantLoanId(new Error("other"))).toBeNull();
  });

  it("loads an already-created loan without creating again and preserves its reference on failure", async () => {
    const created = new SimpleLoanCreatedError(42n, new Error("hydrate failed"));
    const loan = { loanId: 42n } as SimpleLoan;
    await expect(
      recoverCreatedInstantLoan(created, async (loanId) => {
        expect(loanId).toBe(42n);
        return loan;
      }),
    ).resolves.toBe(loan);

    await expect(
      recoverCreatedInstantLoan(created, async () => {
        throw new Error("still unavailable");
      }),
    ).rejects.toMatchObject({
      name: "InstantLoanRecoveryError",
      loanId: 42n,
      ref: created.ref,
    } satisfies Partial<InstantLoanRecoveryError>);
  });
});
