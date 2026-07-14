import { describe, expect, it } from "vitest";
import {
  Asset,
  Chain,
  SimpleLoanCreatedError,
  LiquidiumAccountType,
  type SimpleLoan,
  type Pool,
} from "@liquidium/client";
import {
  InstantLoanRecoveryError,
  buildAssetRoutes,
  buildInstantLoanRequest,
  buildTypedDestination,
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
  validateDestination,
  type AssetRoute,
  type QuoteState,
} from "./liquidium";

function pool(asset: Pool["asset"], id: string, decimals: bigint): Pool {
  const chain = asset === Asset.BTC ? Chain.BTC : asset === Asset.ICP ? Chain.ICP : Chain.ETH;
  return { asset, chain, id, decimals, frozen: false } as Pool;
}

describe("Liquidium route helpers", () => {
  it("expands backing pools into native and ICP asset identifiers", () => {
    const routes = buildAssetRoutes([
      pool(Asset.BTC, "btc-pool", 8n),
      pool(Asset.ICP, "icp-pool", 8n),
      pool(Asset.USDT, "usdt-pool", 6n),
    ]);

    expect(routes.map((route) => [route.chain, route.displaySymbol])).toEqual([
      [Chain.BTC, "BTC"],
      [Chain.ICP, "ckBTC"],
      [Chain.ICP, "ICP"],
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

describe("instant-loan RC request", () => {
  it("keeps transfer chains on borrow and refund legs", () => {
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
    const request = buildInstantLoanRequest({
      collateralRoute,
      borrowRoute,
      quote,
      borrowDestination: "aaaaa-aa",
      refundDestination: "aaaaa-aa",
    });

    expect(request.collateral).toMatchObject({ poolId: "btc-pool", asset: Asset.BTC });
    expect(request.borrow).toMatchObject({
      chain: Chain.ICP,
      asset: Asset.USDT,
      destination: { type: LiquidiumAccountType.IcPrincipal, address: "aaaaa-aa" },
    });
    expect(request.refund).toEqual({
      chain: Chain.ICP,
      destination: { type: LiquidiumAccountType.IcPrincipal, address: "aaaaa-aa" },
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

describe("destination validation", () => {
  it("validates and types native and ICP-chain destinations", () => {
    const eth = { chain: Chain.ETH, asset: Asset.USDC } as const;
    const btc = { chain: Chain.BTC, asset: Asset.BTC } as const;
    const ck = { chain: Chain.ICP, asset: Asset.BTC } as const;

    expect(validateDestination(eth, "0x1111111111111111111111111111111111111111")).toBeNull();
    expect(validateDestination(btc, "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh")).toBeNull();
    expect(validateDestination(ck, "aaaaa-aa")).toBeNull();
    expect(validateDestination(ck, "not-a-principal")).toContain("IC principal");
    expect(buildTypedDestination(eth, "0x1111111111111111111111111111111111111111")).toEqual({
      type: LiquidiumAccountType.ChainAddress,
      address: "0x1111111111111111111111111111111111111111",
    });
  });
});
