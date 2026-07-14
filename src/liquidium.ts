import {
  Asset,
  Chain,
  SimpleLoanCreatedError,
  LiquidiumAccountType,
  LiquidiumClient,
  RATE_DECIMALS,
  SupplyAction,
  getMinimumBorrowAmount,
  getMinimumWithdrawAmount,
  type Activity,
  type AssetIdentifier,
  type AssetPrices,
  type CreateSimpleLoanRequest,
  type LiquidiumAccountInput,
  type LiquidiumStatus,
  type LtvCalculation,
  type OutflowDetails,
  type Pool,
  type SimpleLoan,
  type SimpleLoanFindResult,
  type SupplyFlow,
  type UserPositionSummary,
  type UserReserve,
  type WalletAdapter,
} from "@liquidium/client";
import { decodeIcrcAccount } from "@icp-sdk/canisters/ledger/icrc";
import { isIcpAccountIdentifier } from "@icp-sdk/canisters/ledger/icp";
import { Principal } from "@icp-sdk/core/principal";
import { Network, validate as validateBitcoinAddress } from "bitcoin-address-validation";
import { isAddress as isEthereumAddress } from "viem";

export const POLL_INTERVAL_MS = 4_000;
export const DEPOSIT_WINDOW_SECONDS = 3_600n;
export const USD_DECIMALS = 8n;

const MAX_SAFE_DECIMALS = 30;
const BPS_PER_PERCENT = 100;
const INFURA_MAINNET_RPC_BASE_URL = "https://mainnet.infura.io/v3";

export type AssetRoute = AssetIdentifier & {
  poolId: string;
  displaySymbol: string;
  decimals: bigint;
};

export type MarketData = { pools: Pool[]; prices: AssetPrices; routes: AssetRoute[] };

export type QuoteState =
  | { status: "ready"; ltv: LtvCalculation; collateralAmount: bigint; borrowAmount: bigint }
  | { status: "empty" | "error"; message: string };

export type LoanTracking = {
  loan: SimpleLoan;
  activities: Activity[];
  activityError: string | null;
};

export type PortfolioData = {
  summary: UserPositionSummary;
  reserves: UserReserve[];
  activities: Activity[];
  activityError: string | null;
};

export type InflowQuote = {
  amount: bigint;
  fee: bigint;
  total: bigint;
};

export class InstantLoanRecoveryError extends Error {
  readonly loanId: bigint;
  readonly ref: string;
  readonly cause: unknown;

  constructor(createdError: SimpleLoanCreatedError, cause: unknown) {
    super(`Loan ${createdError.ref} was created, but its current state could not be loaded.`);
    this.name = "InstantLoanRecoveryError";
    this.loanId = createdError.loanId;
    this.ref = createdError.ref;
    this.cause = cause;
  }
}

function resolveEvmRpcUrl(): string | undefined {
  const configured = import.meta.env.VITE_EVM_RPC_URL?.trim();
  const infuraKey = import.meta.env.VITE_INFURA_API_KEY?.trim();
  if (configured) return configured;
  return infuraKey ? `${INFURA_MAINNET_RPC_BASE_URL}/${infuraKey}` : undefined;
}

const evmRpcUrl = resolveEvmRpcUrl();
export const client = new LiquidiumClient(evmRpcUrl ? { evmRpcUrl } : {});

export async function fetchMarketData(): Promise<MarketData> {
  const [pools, prices] = await Promise.all([
    client.market.listPools(),
    client.market.getAssetPrices(),
  ]);
  return { pools, prices, routes: buildAssetRoutes(pools) };
}

export function buildAssetRoutes(pools: Pool[]): AssetRoute[] {
  return pools.flatMap((pool) => {
    const routes: AssetRoute[] = [];
    const add = (chain: AssetRoute["chain"], displaySymbol: string) => {
      routes.push({
        chain,
        asset: pool.asset,
        poolId: pool.id,
        displaySymbol,
        decimals: pool.decimals,
      } as AssetRoute);
    };

    if (pool.asset === Asset.BTC) {
      if (pool.chain === Chain.BTC) add(Chain.BTC, "BTC");
      add(Chain.ICP, "ckBTC");
    } else if (pool.asset === Asset.ICP) {
      add(Chain.ICP, "ICP");
    } else if (pool.asset === Asset.USDC || pool.asset === Asset.USDT) {
      if (pool.chain === Chain.ETH) add(Chain.ETH, pool.asset);
      add(Chain.ICP, `ck${pool.asset}`);
    }
    return routes;
  });
}

export function routeKey(route: Pick<AssetRoute, "chain" | "asset">): string {
  return `${route.chain}:${route.asset}`;
}

export function getRoute(routes: AssetRoute[], key: string): AssetRoute | undefined {
  return routes.find((route) => routeKey(route) === key);
}

export function getPool(pools: Pool[], poolId: string): Pool | undefined {
  return pools.find((pool) => pool.id === poolId);
}

export function selectChainTarget<T>(
  targets: Partial<Record<Chain, T>>,
  preferredChain: Chain,
  fallback = true,
): T | undefined {
  const preferred = targets[preferredChain];
  if (preferred || !fallback) return preferred;
  return Object.values(targets).find((target): target is T => Boolean(target));
}

export function validateDestination(route: AssetIdentifier, value: string): string | null {
  const address = value.trim();
  if (!address) return "Enter a destination address.";

  if (route.chain === Chain.ETH) {
    return isEthereumAddress(address) ? null : "Enter a valid Ethereum mainnet address.";
  }
  if (route.chain === Chain.BTC) {
    return validateBitcoinAddress(address, Network.mainnet)
      ? null
      : "Enter a valid Bitcoin mainnet address.";
  }
  if (route.chain !== Chain.ICP) return "This delivery route is not supported.";

  if (route.asset !== Asset.ICP) {
    return isPrincipal(address)
      ? null
      : `${route.asset} on ICP must be delivered to an IC principal.`;
  }
  if (isPrincipal(address) || isIcpAccountIdentifier(address) || isIcrcAddress(address))
    return null;
  return "Enter an IC principal, ICP account identifier, or ICRC account.";
}

export function buildTypedDestination(
  route: AssetIdentifier,
  value: string,
): LiquidiumAccountInput {
  const address = value.trim();
  const validationError = validateDestination(route, address);
  if (validationError) throw new Error(validationError);

  if (route.chain !== Chain.ICP) {
    return { type: LiquidiumAccountType.ChainAddress, address };
  }
  if (route.asset !== Asset.ICP || isPrincipal(address)) {
    return { type: LiquidiumAccountType.IcPrincipal, address };
  }
  if (isIcpAccountIdentifier(address)) {
    return { type: LiquidiumAccountType.IcpAccountIdentifier, address };
  }
  return { type: LiquidiumAccountType.IcrcAccount, address };
}

export function buildQuoteState(params: {
  pools: Pool[];
  prices: AssetPrices;
  collateralRoute?: AssetRoute;
  borrowRoute?: AssetRoute;
  collateralInput: string;
  borrowInput: string;
}): QuoteState {
  const { pools, prices, collateralRoute, borrowRoute, collateralInput, borrowInput } = params;
  if (!collateralRoute || !borrowRoute) {
    return { status: "empty", message: "Choose collateral and borrow assets." };
  }

  try {
    const collateralAmount = parseDecimalToBaseUnits(collateralInput, collateralRoute.decimals);
    const borrowAmount = parseDecimalToBaseUnits(borrowInput, borrowRoute.decimals);
    if (collateralAmount <= 0n || borrowAmount <= 0n) {
      return { status: "error", message: "Amounts must be greater than zero." };
    }
    const ltv = client.quote.calculateLtv(
      {
        collateralPoolId: collateralRoute.poolId,
        borrowPoolId: borrowRoute.poolId,
        collateralAmount,
        borrowAmount,
      },
      pools,
      prices,
    );
    return { status: "ready", ltv, collateralAmount, borrowAmount };
  } catch (error) {
    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function createInstantLoan(params: {
  collateralRoute: AssetRoute;
  borrowRoute: AssetRoute;
  quote: Extract<QuoteState, { status: "ready" }>;
  borrowDestination: string;
  refundDestination: string;
}): Promise<SimpleLoan> {
  const { collateralRoute, borrowRoute, quote, borrowDestination, refundDestination } = params;
  try {
    return await client.simpleLoans.create(
      buildInstantLoanRequest({
        collateralRoute,
        borrowRoute,
        quote,
        borrowDestination,
        refundDestination,
      }),
    );
  } catch (error) {
    if (error instanceof SimpleLoanCreatedError) return await recoverCreatedInstantLoan(error);
    throw error;
  }
}

export async function recoverCreatedInstantLoan(
  error: SimpleLoanCreatedError,
  load: (loanId: bigint) => Promise<SimpleLoan> = async (loanId) =>
    await client.simpleLoans.get({ loanId }),
): Promise<SimpleLoan> {
  try {
    return await load(error.loanId);
  } catch (cause) {
    throw new InstantLoanRecoveryError(error, cause);
  }
}

export function getRecoverableInstantLoanId(error: unknown): bigint | null {
  return error instanceof SimpleLoanCreatedError ? error.loanId : null;
}

export function buildInstantLoanRequest(params: {
  collateralRoute: AssetRoute;
  borrowRoute: AssetRoute;
  quote: Extract<QuoteState, { status: "ready" }>;
  borrowDestination: string;
  refundDestination: string;
}): CreateSimpleLoanRequest {
  const { collateralRoute, borrowRoute, quote, borrowDestination, refundDestination } = params;
  return {
    collateral: {
      poolId: collateralRoute.poolId,
      asset: collateralRoute.asset,
      amount: quote.collateralAmount,
    },
    borrow: {
      poolId: borrowRoute.poolId,
      asset: borrowRoute.asset,
      chain: borrowRoute.chain,
      amount: quote.borrowAmount,
      destination: buildTypedDestination(borrowRoute, borrowDestination),
    } as CreateSimpleLoanRequest["borrow"],
    refund: {
      chain: collateralRoute.chain,
      destination: buildTypedDestination(collateralRoute, refundDestination),
    },
    ltvMaxBps: quote.ltv.maxAllowedLtvBps,
    depositWindowSeconds: DEPOSIT_WINDOW_SECONDS,
  };
}

export async function fetchLoanTracking(identifier: string | bigint): Promise<LoanTracking> {
  const loan = await client.simpleLoans.get(
    typeof identifier === "bigint" ? { loanId: identifier } : { ref: identifier.trim() },
  );
  const activitiesResult = await Promise.allSettled([
    client.activities.list({ shortRef: loan.ref, filter: "all" }),
  ]);
  const result = activitiesResult[0];
  return {
    loan,
    activities: result.status === "fulfilled" ? result.value : [],
    activityError:
      result.status === "rejected"
        ? `Loan loaded, but activity tracking failed: ${getErrorMessage(result.reason)}`
        : null,
  };
}

export async function findLoans(query: string): Promise<SimpleLoanFindResult[]> {
  return await client.simpleLoans.find(query.trim());
}

export async function resolveProfile(walletAddress: string): Promise<string | null> {
  return await client.accounts.getProfileId(walletAddress);
}

export async function createProfile(params: {
  account: string;
  chain: typeof Chain.BTC | typeof Chain.ETH;
  walletAdapter: WalletAdapter;
}): Promise<string> {
  return await client.accounts.createProfile(params);
}

export async function fetchPortfolio(profileId: string): Promise<PortfolioData> {
  const [summary, reserves, activitiesResult] = await Promise.all([
    client.positions.getUserPositionSummary(profileId),
    client.positions.getUserReserves(profileId),
    client.activities.list({ profileId, filter: "all" }).then(
      (activities) => ({ activities, error: null }),
      (error: unknown) => ({
        activities: [],
        error: `Positions loaded, but activity tracking failed: ${getErrorMessage(error)}`,
      }),
    ),
  ]);
  return {
    summary,
    reserves,
    activities: activitiesResult.activities,
    activityError: activitiesResult.error,
  };
}

export async function createSupplyFlow(params: {
  profileId: string;
  route: AssetRoute;
  amount?: bigint;
  action: "deposit" | "repayment";
  account?: string;
  walletAdapter?: WalletAdapter;
}): Promise<SupplyFlow> {
  const { profileId, route, amount, action, account, walletAdapter } = params;
  if (amount && account && walletAdapter && route.chain !== Chain.ICP) {
    return await client.lending.supply({
      profileId,
      poolId: route.poolId,
      chain: route.chain,
      action: action === "deposit" ? SupplyAction.deposit : SupplyAction.repayment,
      amount,
      account,
      walletAdapter,
    });
  }
  return await client.lending.supply({
    profileId,
    poolId: route.poolId,
    chain: route.chain,
    action: action === "deposit" ? SupplyAction.deposit : SupplyAction.repayment,
  });
}

export async function getInflowQuote(route: AssetRoute, amount: bigint): Promise<InflowQuote> {
  if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
  const estimate = await client.lending.estimateInflowFee(route);
  return { amount, fee: estimate.totalFee, total: amount + estimate.totalFee };
}

export async function submitManualSupply(flow: SupplyFlow, txid: string): Promise<void> {
  await flow.submit({ txid: txid.trim() });
}

export async function borrowWithProfile(params: {
  profileId: string;
  route: AssetRoute;
  amount: bigint;
  receiver: string;
  signerWalletAddress: string;
  signerChain: typeof Chain.BTC | typeof Chain.ETH;
  signerWalletAdapter: WalletAdapter;
}): Promise<OutflowDetails> {
  return await client.lending.borrow({
    profileId: params.profileId,
    poolId: params.route.poolId,
    amount: params.amount,
    chain: params.route.chain,
    receiver: buildTypedDestination(params.route, params.receiver),
    signerWalletAddress: params.signerWalletAddress,
    signerChain: params.signerChain,
    signerWalletAdapter: params.signerWalletAdapter,
  });
}

export async function withdrawWithProfile(params: {
  profileId: string;
  route: AssetRoute;
  amount: bigint;
  receiver: string;
  signerWalletAddress: string;
  signerChain: typeof Chain.BTC | typeof Chain.ETH;
  signerWalletAdapter: WalletAdapter;
}): Promise<OutflowDetails> {
  return await client.lending.withdraw({
    profileId: params.profileId,
    poolId: params.route.poolId,
    amount: params.amount,
    chain: params.route.chain,
    receiver: buildTypedDestination(params.route, params.receiver),
    signerWalletAddress: params.signerWalletAddress,
    signerChain: params.signerChain,
    signerWalletAdapter: params.signerWalletAdapter,
  });
}

export async function getMaxRepay(profileId: string, poolId: string): Promise<bigint> {
  return (await client.positions.getMaxRepayAmount(profileId, poolId)).amount;
}

export async function getMaxWithdraw(profileId: string, poolId: string): Promise<bigint> {
  return (await client.positions.getFullWithdrawAmount(profileId, poolId)).amount;
}

export function getMinimumBorrow(route?: AssetRoute): bigint {
  return route ? getMinimumBorrowAmount(route.asset) : 0n;
}

export function getMinimumWithdraw(route?: AssetRoute): bigint {
  return route ? getMinimumWithdrawAmount(route.asset) : 0n;
}

export function parseDecimalToBaseUnits(value: string, decimals: bigint): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error("Enter a valid positive amount.");
  const decimalsNumber = Number(decimals);
  if (
    !Number.isInteger(decimalsNumber) ||
    decimalsNumber < 0 ||
    decimalsNumber > MAX_SAFE_DECIMALS
  ) {
    throw new Error("This market uses an unsupported decimal scale.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimalsNumber) {
    throw new Error(`Use no more than ${decimalsNumber} decimal places.`);
  }
  return (
    BigInt(whole) * 10n ** BigInt(decimalsNumber) +
    BigInt(fraction.padEnd(decimalsNumber, "0") || "0")
  );
}

export function formatBaseUnits(amount: bigint, decimals: bigint, digits = 6): string {
  const decimalsNumber = Number(decimals);
  if (
    !Number.isInteger(decimalsNumber) ||
    decimalsNumber < 0 ||
    decimalsNumber > MAX_SAFE_DECIMALS
  ) {
    return amount.toString();
  }
  const scale = 10n ** BigInt(decimalsNumber);
  const whole = amount / scale;
  const fraction = (amount % scale)
    .toString()
    .padStart(decimalsNumber, "0")
    .slice(0, digits)
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatBps(bps: bigint): string {
  return `${(Number(bps) / BPS_PER_PERCENT).toFixed(2)}%`;
}

export function formatScaledRate(rate: bigint, decimals: bigint): string {
  return `${formatBaseUnits(rate * BigInt(BPS_PER_PERCENT), decimals, 2)}%`;
}

export function formatUsd(value: bigint, decimals: bigint): string {
  return `$${Number(formatBaseUnits(value, decimals, 2)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatHealthFactor(
  summary: Pick<
    UserPositionSummary,
    "totalDebtUsd" | "healthFactor" | "currentLtvBps" | "weightedLiquidationThresholdBps"
  >,
): string {
  if (summary.totalDebtUsd === 0n) return "∞";
  if (summary.healthFactor > 0n) {
    const formatted = formatBaseUnits(summary.healthFactor, RATE_DECIMALS, 2);
    return formatted === "0" ? "<0.01" : formatted;
  }
  if (summary.currentLtvBps <= 0n || summary.weightedLiquidationThresholdBps <= 0n) return "—";

  const hundredths =
    (summary.weightedLiquidationThresholdBps * 100n + summary.currentLtvBps / 2n) /
    summary.currentLtvBps;
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`;
}

export function formatActivityStatusDetail(status: LiquidiumStatus): string {
  if (status.state === "completed") return "Finalized on chain";
  if (status.state === "failed") return "Operation failed";
  if (status.state === "expired") return "Action expired";

  if (status.confirmations !== null) {
    return `${status.confirmations}/${status.requiredConfirmations ?? "?"} confirmations`;
  }

  if (status.state === "action_required") return "Action required";
  if (status.state === "active") return "Position active";
  if (status.state === "processing") return "Processing protocol update";
  return "Waiting for chain confirmation";
}

export function formatQuoteErrors(ltv: LtvCalculation): string {
  return ltv.validationErrors.map((error) => error.message).join(" ");
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}

function isPrincipal(value: string): boolean {
  try {
    Principal.fromText(value);
    return true;
  } catch {
    return false;
  }
}

function isIcrcAddress(value: string): boolean {
  try {
    decodeIcrcAccount(value);
    return true;
  } catch {
    return false;
  }
}
