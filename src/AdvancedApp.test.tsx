// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Asset,
  Chain,
  type Activity,
  type Pool,
  type SupplyFlow,
  type UserReserve,
} from "@liquidium/client";

const mocks = vi.hoisted(() => ({
  createSupplyFlow: vi.fn(),
  submitManualSupply: vi.fn(),
  getInflowQuote: vi.fn(),
  getMaxRepay: vi.fn(),
  getMaxWithdraw: vi.fn(),
  resolveProfile: vi.fn(),
  createProfile: vi.fn(),
  fetchPortfolio: vi.fn(),
  borrowWithProfile: vi.fn(),
  withdrawWithProfile: vi.fn(),
  connectedWallet: {
    current: {
      address: "0x1111111111111111111111111111111111111111",
      chain: "ETH",
      adapter: { signMessage: vi.fn(), sendEthTransaction: vi.fn() },
    } as { address: string; chain: "ETH"; adapter: object } | null,
  },
  primaryWallet: {
    current: { address: "0x1111111111111111111111111111111111111111" } as object | null,
  },
}));

vi.mock("@dynamic-labs/bitcoin", () => ({ BitcoinWalletConnectors: {} }));
vi.mock("@dynamic-labs/ethereum", () => ({ EthereumWalletConnectors: {} }));
vi.mock("@dynamic-labs/sdk-react-core", () => ({
  DynamicContextProvider: ({ children }: { children: React.ReactNode }) => children,
  DynamicWidget: () => <button type="button">Connected wallet</button>,
  useDynamicContext: () => ({ primaryWallet: mocks.primaryWallet.current }),
}));
vi.mock("./dynamic-wallet", () => ({
  getConnectedWallet: () => mocks.connectedWallet.current,
}));

const pool = {
  id: "usdt-pool",
  asset: Asset.USDT,
  chain: Chain.ETH,
  decimals: 6n,
  frozen: false,
  lendingRate: 3_000_000n,
  borrowingRate: 4_000_000n,
  rateDecimals: 8n,
} as Pool;
const btcPool = {
  id: "btc-pool",
  asset: Asset.BTC,
  chain: Chain.BTC,
  decimals: 8n,
  frozen: false,
} as Pool;
const reserve = {
  pool,
  position: {
    poolId: pool.id,
    asset: Asset.USDT,
    deposited: 50_000_000n,
    depositedDecimals: 6n,
    borrowed: 10_000_000n,
    borrowedDecimals: 6n,
    earnedInterest: 0n,
    debtInterest: 0n,
    lastUpdate: 0n,
  },
  priceUsd: 1,
  suppliedUsd: 50_000_000n,
  borrowedUsd: 10_000_000n,
  usdDecimals: 6n,
} satisfies UserReserve;

vi.mock("./liquidium", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./liquidium")>();
  return {
    ...actual,
    fetchMarketData: vi.fn(async () => ({
      pools: [pool, btcPool],
      prices: { USDT: 1, BTC: 100_000 },
      routes: [
        {
          poolId: pool.id,
          asset: Asset.USDT,
          chain: Chain.ETH,
          displaySymbol: "USDT",
          decimals: 6n,
        },
        {
          poolId: pool.id,
          asset: Asset.USDT,
          chain: Chain.ICP,
          displaySymbol: "ckUSDT",
          decimals: 6n,
        },
        {
          poolId: btcPool.id,
          asset: Asset.BTC,
          chain: Chain.BTC,
          displaySymbol: "BTC",
          decimals: 8n,
        },
        {
          poolId: btcPool.id,
          asset: Asset.BTC,
          chain: Chain.ICP,
          displaySymbol: "ckBTC",
          decimals: 8n,
        },
      ],
    })),
    resolveProfile: mocks.resolveProfile,
    createProfile: mocks.createProfile,
    fetchPortfolio: mocks.fetchPortfolio,
    createSupplyFlow: mocks.createSupplyFlow,
    submitManualSupply: mocks.submitManualSupply,
    getInflowQuote: mocks.getInflowQuote,
    getMaxRepay: mocks.getMaxRepay,
    getMaxWithdraw: mocks.getMaxWithdraw,
    borrowWithProfile: mocks.borrowWithProfile,
    withdrawWithProfile: mocks.withdrawWithProfile,
  };
});

const defaultPortfolio = {
  summary: {
    totalCollateralUsd: 50_000_000n,
    totalDebtUsd: 10_000_000n,
    availableBorrowsUsd: 20_000_000n,
    netWorthUsd: 40_000_000n,
    usdDecimals: 6n,
    currentLtvBps: 2_000n,
    weightedMaxLtvBps: 6_500n,
    weightedLiquidationThresholdBps: 7_500n,
    healthFactor: 2_000_000_000_000_000_000_000_000_000n,
  },
  reserves: [reserve],
  activities: [],
  activityError: null,
};

beforeEach(() => {
  vi.stubEnv("VITE_DYNAMIC_ENVIRONMENT_ID", "test-environment");
  mocks.connectedWallet.current = {
    address: "0x1111111111111111111111111111111111111111",
    chain: "ETH",
    adapter: { signMessage: vi.fn(), sendEthTransaction: vi.fn() },
  };
  mocks.primaryWallet.current = { address: "0x1111111111111111111111111111111111111111" };
  mocks.resolveProfile.mockResolvedValue("profile-id");
  mocks.createProfile.mockResolvedValue("profile-id");
  mocks.fetchPortfolio.mockResolvedValue(defaultPortfolio);
  mocks.createSupplyFlow.mockResolvedValue({
    type: "transfer",
    target: {
      poolId: pool.id,
      asset: Asset.USDT,
      chain: Chain.ICP,
      action: "deposit",
      address: "aaaaa-aa",
    },
    status: {
      operation: "deposit",
      state: "action_required",
      confirmations: null,
      requiredConfirmations: null,
    },
    submit: vi.fn(),
  } as SupplyFlow);
  mocks.submitManualSupply.mockResolvedValue(undefined);
  mocks.getInflowQuote.mockImplementation(async (_route, amount: bigint) => ({
    amount,
    fee: 10n,
    total: amount + 10n,
  }));
  mocks.getMaxRepay.mockResolvedValue(10_100_000n);
  mocks.getMaxWithdraw.mockResolvedValue(50_000_000n);
  mocks.borrowWithProfile.mockResolvedValue({
    id: "borrow-7",
    outflowType: "borrow",
    amount: 2_000_000n,
    receiver: { type: "ChainAddress", address: "0x2222222222222222222222222222222222222222" },
    status: {
      operation: "borrow",
      state: "processing",
      confirmations: null,
      requiredConfirmations: null,
    },
  });
  mocks.withdrawWithProfile.mockResolvedValue({
    id: "withdraw-8",
    outflowType: "withdrawal",
    amount: 2_000_000n,
    receiver: { type: "IcPrincipal", address: "aaaaa-aa" },
    status: {
      operation: "withdrawal",
      state: "processing",
      confirmations: null,
      requiredConfirmations: null,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

async function renderAdvanced() {
  vi.resetModules();
  const { default: AdvancedApp } = await import("./AdvancedApp");
  const view = render(<AdvancedApp />);
  return { rerender: () => view.rerender(<AdvancedApp />) };
}

async function selectRoute(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("Asset and route"));
  await user.click(await screen.findByRole("option", { name }));
}

describe("advanced profile flow", () => {
  it("creates a manual ICRC target and submits its transaction reference", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    await selectRoute("ckUSDT on ICP");
    fireEvent.change(screen.getByLabelText("supply amount"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Supply ckUSDT" }));

    expect(await screen.findByText("Transfer target")).toBeTruthy();
    expect(screen.getByText("aaaaa-aa")).toBeTruthy();
    expect(screen.getByText("Send exactly 12.00001 ckUSDT")).toBeTruthy();
    expect(screen.getByText("Inflow fee")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Transaction reference"), {
      target: { value: "12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track transfer" }));
    await waitFor(() =>
      expect(mocks.submitManualSupply).toHaveBeenCalledWith(expect.anything(), "12345"),
    );
  });

  it("falls back to a manual target when the connected wallet cannot broadcast the native route", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    await selectRoute("BTC on BTC");
    fireEvent.change(screen.getByLabelText("supply amount"), { target: { value: "0.001" } });
    fireEvent.click(screen.getByRole("button", { name: "Supply BTC" }));

    await waitFor(() =>
      expect(mocks.createSupplyFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          route: expect.objectContaining({ chain: Chain.BTC, asset: Asset.BTC }),
          amount: undefined,
          account: undefined,
          walletAdapter: undefined,
        }),
      ),
    );
  });

  it("passes the fee-inclusive amount to the matching connected wallet adapter", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.change(screen.getByLabelText("supply amount"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Supply USDT" }));

    await waitFor(() =>
      expect(mocks.createSupplyFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 12_000_010n,
          account: "0x1111111111111111111111111111111111111111",
          walletAdapter: mocks.connectedWallet.current?.adapter,
        }),
      ),
    );
  });

  it("opens repayment from a reserve and loads the SDK maximum", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "portfolio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Repay" }));
    fireEvent.click(screen.getByRole("button", { name: "Max" }));

    await waitFor(() => expect(mocks.getMaxRepay).toHaveBeenCalledWith("profile-id", pool.id));
    expect((screen.getByLabelText("repay amount") as HTMLInputElement).value).toBe("10.1");
    await selectRoute("ckUSDT on ICP");
    fireEvent.click(screen.getByRole("button", { name: "Repay ckUSDT" }));
    await waitFor(() =>
      expect(mocks.createSupplyFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "repayment",
          route: expect.objectContaining({ chain: Chain.ICP }),
          amount: undefined,
        }),
      ),
    );
  });

  it("loads the withdrawal maximum from the selected reserve", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "portfolio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    fireEvent.click(screen.getByRole("button", { name: "Max" }));

    await waitFor(() => expect(mocks.getMaxWithdraw).toHaveBeenCalledWith("profile-id", pool.id));
    expect((screen.getByLabelText("withdraw amount") as HTMLInputElement).value).toBe("50");
  });

  it("withdraws to the selected ICP delivery route with the profile owner signer", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "portfolio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));
    await selectRoute("ckUSDT on ICP");
    fireEvent.change(screen.getByLabelText("withdraw amount"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("withdraw destination"), {
      target: { value: "aaaaa-aa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw ckUSDT" }));

    await waitFor(() =>
      expect(mocks.withdrawWithProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "profile-id",
          route: expect.objectContaining({ chain: Chain.ICP, asset: Asset.USDT }),
          receiver: "aaaaa-aa",
          signerWalletAddress: "0x1111111111111111111111111111111111111111",
        }),
      ),
    );
    expect(await screen.findByText("Outflow withdraw-8", { exact: false })).toBeTruthy();
  });

  it("shows wallet, missing-profile, and portfolio empty states", async () => {
    mocks.connectedWallet.current = null;
    mocks.primaryWallet.current = null;
    await renderAdvanced();
    expect(await screen.findByRole("heading", { name: /advanced lending starts/i })).toBeTruthy();
    cleanup();

    mocks.connectedWallet.current = {
      address: "0x1111111111111111111111111111111111111111",
      chain: "ETH",
      adapter: { signMessage: vi.fn(), sendEthTransaction: vi.fn() },
    };
    mocks.primaryWallet.current = { address: "0x1111111111111111111111111111111111111111" };
    mocks.resolveProfile.mockResolvedValueOnce(null);
    await renderAdvanced();
    fireEvent.click(await screen.findByRole("button", { name: "Create profile" }));
    await waitFor(() => expect(mocks.createProfile).toHaveBeenCalled());
    cleanup();

    mocks.fetchPortfolio.mockResolvedValueOnce({ ...defaultPortfolio, reserves: [] });
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "portfolio" }));
    expect(await screen.findByRole("heading", { name: "No positions yet" })).toBeTruthy();
  });

  it("validates minimums and destination formats before signing", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "borrow" }));
    fireEvent.change(screen.getByLabelText("borrow amount"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("borrow destination"), {
      target: { value: "not-an-address" },
    });

    expect(screen.getByText(/minimum borrow/i)).toBeTruthy();
    expect(screen.getByText(/valid Ethereum mainnet address/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Borrow USDT" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows signed outflow success and failure receipts without broadcasting in tests", async () => {
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "borrow" }));
    fireEvent.change(screen.getByLabelText("borrow amount"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("borrow destination"), {
      target: { value: "0x2222222222222222222222222222222222222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Borrow USDT" }));
    expect(await screen.findByText("Outflow borrow-7", { exact: false })).toBeTruthy();
    await waitFor(() => expect(mocks.fetchPortfolio.mock.calls.length).toBeGreaterThanOrEqual(2));
    cleanup();

    mocks.borrowWithProfile.mockRejectedValueOnce(new Error("Wallet request rejected"));
    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "borrow" }));
    fireEvent.change(screen.getByLabelText("borrow amount"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("borrow destination"), {
      target: { value: "0x2222222222222222222222222222222222222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Borrow USDT" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Wallet request rejected",
    );
  });

  it("resolves the profile again when Dynamic changes the primary wallet", async () => {
    const view = await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    mocks.primaryWallet.current = { address: "0x4444444444444444444444444444444444444444" };
    mocks.connectedWallet.current = {
      address: "0x4444444444444444444444444444444444444444",
      chain: "ETH",
      adapter: { signMessage: vi.fn(), sendEthTransaction: vi.fn() },
    };
    view.rerender();

    await waitFor(() =>
      expect(mocks.resolveProfile).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
      ),
    );
  });

  it("keeps loading and portfolio errors explicit", async () => {
    mocks.fetchPortfolio.mockImplementationOnce(() => new Promise(() => undefined));
    await renderAdvanced();
    expect(await screen.findByText("Syncing…")).toBeTruthy();
    cleanup();

    mocks.fetchPortfolio.mockRejectedValueOnce(new Error("Portfolio unavailable"));
    await renderAdvanced();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Portfolio unavailable");
  });

  it("links each activity transaction to its chain explorer", async () => {
    const activities = [
      {
        id: "btc-deposit",
        poolId: btcPool.id,
        asset: Asset.BTC,
        chain: Chain.BTC,
        amount: 100_000n,
        timestampMs: 3,
        txids: ["btc-transaction-id"],
        status: {
          operation: "deposit",
          state: "completed",
          confirmations: 6,
          requiredConfirmations: 6,
        },
      },
      {
        id: "eth-borrow",
        poolId: pool.id,
        asset: Asset.USDT,
        chain: Chain.ETH,
        amount: 2_000_000n,
        timestampMs: 2,
        txids: ["0xethereum-transaction-id"],
        status: {
          operation: "borrow",
          state: "completed",
          confirmations: 12,
          requiredConfirmations: 12,
        },
      },
      {
        id: "icp-repayment",
        poolId: pool.id,
        asset: Asset.USDT,
        chain: Chain.ICP,
        amount: 2_000_000n,
        timestampMs: 1,
        txids: ["icp-transaction-hash"],
        status: {
          operation: "repayment",
          state: "completed",
          confirmations: null,
          requiredConfirmations: null,
        },
      },
    ] satisfies Activity[];
    mocks.fetchPortfolio.mockResolvedValue({ ...defaultPortfolio, activities });

    await renderAdvanced();
    await screen.findByRole("heading", { name: "Supply an asset" });
    fireEvent.click(screen.getByRole("button", { name: "portfolio" }));

    const mempoolLink = await screen.findByRole("link", { name: /btc-transaction-id.*Mempool/i });
    expect(mempoolLink.getAttribute("href")).toBe("https://mempool.space/tx/btc-transaction-id");
    expect(mempoolLink.getAttribute("target")).toBe("_blank");
    expect(mempoolLink.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      screen
        .getByRole("link", { name: /ethereum-transaction-id.*Etherscan/i })
        .getAttribute("href"),
    ).toBe("https://etherscan.io/tx/0xethereum-transaction-id");
    expect(
      screen
        .getByRole("link", { name: /icp-transaction-hash.*ICP Dashboard/i })
        .getAttribute("href"),
    ).toBe("https://dashboard.internetcomputer.org/transaction/icp-transaction-hash");
  });
});
