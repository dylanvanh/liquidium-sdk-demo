// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  Chain,
  SimpleLoanCreatedError,
  type SimpleLoan,
  type SimpleLoanFindResult,
  type Pool,
} from "@liquidium/client";
import { InstantLoanRecoveryError } from "./liquidium";

const mocks = vi.hoisted(() => ({
  fetchMarketData: vi.fn(),
  findLoans: vi.fn(),
  fetchLoanTracking: vi.fn(),
  createInstantLoan: vi.fn(),
}));

vi.mock("./AdvancedApp", () => ({ default: () => <div>Advanced wallet workspace</div> }));
vi.mock("./InsightsApp", () => ({ default: () => <div>Live market insights</div> }));
vi.mock("./liquidium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./liquidium")>();
  return {
    ...actual,
    fetchMarketData: mocks.fetchMarketData,
    findLoans: mocks.findLoans,
    fetchLoanTracking: mocks.fetchLoanTracking,
    createInstantLoan: mocks.createInstantLoan,
    buildQuoteState: vi.fn(() => ({
      status: "ready",
      collateralAmount: 100_000n,
      borrowAmount: 25_000_000n,
      ltv: {
        ltvBps: 4_000n,
        maxAllowedLtvBps: 6_000n,
        borrowUsd: 2_500_000_000n,
        collateralUsd: 6_250_000_000n,
        validationErrors: [],
      },
    })),
  };
});

import { App } from "./App";

const btcPool = { id: "btc-pool", asset: Asset.BTC, chain: Chain.BTC, decimals: 8n } as Pool;
const ethPool = { id: "eth-pool", asset: Asset.ETH, chain: Chain.ETH, decimals: 18n } as Pool;
const usdcPool = { id: "usdc-pool", asset: Asset.USDC, chain: Chain.ETH, decimals: 6n } as Pool;
const routes = [
  { poolId: btcPool.id, asset: Asset.BTC, chain: Chain.BTC, displaySymbol: "BTC", decimals: 8n },
  { poolId: btcPool.id, asset: Asset.BTC, chain: Chain.ICP, displaySymbol: "ckBTC", decimals: 8n },
  { poolId: usdcPool.id, asset: Asset.USDC, chain: Chain.ETH, displaySymbol: "USDC", decimals: 6n },
  {
    poolId: usdcPool.id,
    asset: Asset.USDC,
    chain: Chain.ICP,
    displaySymbol: "ckUSDC",
    decimals: 6n,
  },
  { poolId: ethPool.id, asset: Asset.ETH, chain: Chain.ETH, displaySymbol: "ETH", decimals: 18n },
];

const recoveredLoan = {
  loanId: 7n,
  ref: "ABC123",
  status: {
    operation: "borrow",
    state: "active",
    confirmations: null,
    requiredConfirmations: null,
  },
  profileId: "aaaaa-aa",
  terms: { ltvMaxBps: 6_000n, depositWindowSeconds: 3_600n },
  collateral: { poolId: btcPool.id, asset: Asset.BTC, decimals: 8n, amount: 100_000n },
  borrow: {
    poolId: usdcPool.id,
    asset: Asset.USDC,
    chain: Chain.ETH,
    decimals: 6n,
    amount: 25_000_000n,
    destination: { type: "ChainAddress", address: "0x2222222222222222222222222222222222222222" },
  },
  refundDestination: {
    type: "ChainAddress",
    address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  },
  initialDeposit: {
    decimals: 8n,
    collateralAmount: 100_000n,
    asset: Asset.BTC,
    detectedTimestamp: null,
    expiryTimestamp: null,
    targets: {
      [Chain.BTC]: {
        amount: 100_120n,
        inflowFeeAmount: 120n,
        target: {
          poolId: btcPool.id,
          asset: Asset.BTC,
          chain: Chain.BTC,
          action: "deposit",
          address: "bc1qdeposit",
        },
      },
    },
  },
  repayment: {
    decimals: 6n,
    debtAmount: 25_000_000n,
    interestBufferAmount: 100n,
    interestBufferSeconds: 60n,
    asset: Asset.USDC,
    targets: {
      [Chain.ETH]: {
        amount: 25_001_100n,
        inflowFeeAmount: 1_000n,
        inflowFeeEstimateAvailable: true,
        target: {
          poolId: usdcPool.id,
          asset: Asset.USDC,
          chain: Chain.ETH,
          action: "repayment",
          address: "0x3333333333333333333333333333333333333333",
        },
      },
    },
  },
  position: {
    collateralAmount: 100_000n,
    collateralDecimals: 8n,
    collateralInterestAmount: 0n,
    borrowedAmount: 25_000_000n,
    borrowedDecimals: 6n,
    debtInterestAmount: 0n,
    totalDebtAmount: 25_000_000n,
  },
} as SimpleLoan;

beforeEach(() => {
  window.history.replaceState(null, "", "/simple-loan");
  mocks.fetchMarketData.mockResolvedValue({ pools: [btcPool, ethPool, usdcPool], prices: {}, routes });
  mocks.findLoans.mockResolvedValue([]);
  mocks.fetchLoanTracking.mockResolvedValue({
    loan: recoveredLoan,
    activities: [],
    activityError: null,
  });
  mocks.createInstantLoan.mockResolvedValue(recoveredLoan);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("product mode navigation", () => {
  it("links to the demo and Liquidium SDK repositories", () => {
    render(<App />);

    const demoLink = screen.getByRole("link", { name: "Demo on GitHub" });
    expect(demoLink.getAttribute("href")).toBe("https://github.com/dylanvanh/liquidium-sdk-demo");
    expect(demoLink.getAttribute("target")).toBe("_blank");
    expect(demoLink.getAttribute("rel")).toBe("noopener noreferrer");

    const sdkLink = screen.getByRole("link", { name: "Liquidium SDK on GitHub" });
    expect(sdkLink.getAttribute("href")).toBe("https://github.com/Liquidium-Inc/liquidium-sdk");
  });

  it("starts with market insights and keeps each product mode directly addressable", async () => {
    window.history.replaceState(null, "", "/");
    render(<App />);
    expect(await screen.findByText("Live market insights")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Insights" }).getAttribute("aria-current")).toBe(
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Simple loan" }));
    expect(screen.getByRole("heading", { name: /borrow across chains/i })).toBeTruthy();
    expect(window.location.pathname).toBe("/simple-loan");

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(await screen.findByText("Advanced wallet workspace")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Insights" }));
    expect(await screen.findByText("Live market insights")).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });

  it("keeps the previous insights path working", async () => {
    // given
    window.history.replaceState(null, "", "/insights");

    // when
    render(<App />);

    // then
    expect(await screen.findByText("Live market insights")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Insights" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("switches the collateral picker between native and ICP routes", async () => {
    render(<App />);
    const collateralSelect = (await screen.findByLabelText(
      "You deposit asset",
    )) as HTMLSelectElement;
    expect(collateralSelect.value).toBe("BTC:BTC");

    fireEvent.click(screen.getAllByText("ICP assets")[0]);
    await waitFor(() => expect(collateralSelect.value).toBe("ICP:BTC"));
    expect(screen.getByRole("option", { name: "ckBTC" })).toBeTruthy();
  });

  it("warns that native ETH destinations cannot be smart contract wallets", async () => {
    // given
    render(<App />);
    const borrowSelect = (await screen.findByLabelText("You borrow asset")) as HTMLSelectElement;

    // when
    fireEvent.change(borrowSelect, { target: { value: "ETH:ETH" } });

    // then
    expect(screen.getByText(/smart contract wallets are not supported/i)).toBeTruthy();
  });

  it("recovers an address lookup candidate through canonical get", async () => {
    mocks.findLoans.mockResolvedValueOnce([
      {
        loanId: 7n,
        ref: "ABC123",
        createdAt: 1_700_000_000n,
        profileId: "aaaaa-aa",
        collateral: { poolId: btcPool.id, asset: Asset.BTC, amount: 100_000n },
        borrow: { poolId: usdcPool.id, asset: Asset.USDC },
      } as SimpleLoanFindResult,
    ]);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /find an existing loan/i }));
    fireEvent.change(screen.getByLabelText("Loan lookup"), {
      target: { value: "bc1qlookup-address" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find loan" }));
    fireEvent.click(await screen.findByRole("button", { name: /ABC123/i }));

    await waitFor(() => expect(mocks.fetchLoanTracking).toHaveBeenCalledWith(7n));
    expect(await screen.findByRole("button", { name: "Copy reference ABC123" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy loan id 7" })).toBeTruthy();
    expect(screen.getByText("0.001 BTC")).toBeTruthy();
    expect(screen.getByText("25 USDC")).toBeTruthy();
  });

  it("preserves an already-created loan reference and blocks duplicate creation", async () => {
    const createdError = new SimpleLoanCreatedError(7n, new Error("first hydration failed"));
    const recovery = new InstantLoanRecoveryError(
      createdError,
      new Error("second hydration failed"),
    );
    mocks.createInstantLoan.mockRejectedValueOnce(recovery);
    render(<App />);
    await screen.findByLabelText("You deposit asset");
    fireEvent.change(screen.getByLabelText("USDC destination"), {
      target: { value: "0x2222222222222222222222222222222222222222" },
    });
    fireEvent.change(screen.getByLabelText("Collateral refund address"), {
      target: { value: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create simple loan" }));

    expect(await screen.findByText(`Loan ${recovery.ref} was created.`)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Loan already created" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Load created loan" }));
    await waitFor(() => expect(mocks.fetchLoanTracking).toHaveBeenCalledWith(7n));
    expect(await screen.findByRole("button", { name: "Copy reference ABC123" })).toBeTruthy();
    expect(mocks.createInstantLoan).toHaveBeenCalledTimes(1);
  });
});
