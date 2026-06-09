import {
  LiquidiumClient,
  getMinimumBorrowAmount,
  type Activity,
  type AssetPrices,
  type InstantLoan,
  type InstantLoanAsset,
  type LtvCalculation,
  type Pool,
  type SupplyTarget,
} from "@liquidium/client";

export const POLL_INTERVAL_MS = 4_000;
export const DEPOSIT_WINDOW_SECONDS = 3_600n;
export const USD_DECIMALS = 8n;

export const DEFAULT_COLLATERAL_ASSETS = ["BTC", "SOL", "USDC", "USDT"];
export const DEFAULT_BORROW_ASSETS = ["USDC", "USDT", "BTC", "SOL"];

const MAX_SAFE_DECIMALS = 30;
const DEFAULT_FRACTION_DIGITS = 6;
const BPS_PER_PERCENT = 100;
const ZERO_AMOUNT = 0n;
const INSTANT_LOAN_ASSETS = ["BTC", "SOL", "USDC", "USDT"] as const;

const liquidiumClient = new LiquidiumClient({});

type QuoteState =
  | {
      status: "ready";
      ltv: LtvCalculation;
      collateralAmount: bigint;
      borrowAmount: bigint;
    }
  | { status: "empty" | "error"; message: string };

type TrackingResult = {
  loan: InstantLoan;
  activities: Activity[];
  activityError: string | null;
};

type CreateInstantLoanParams = {
  collateralPool: Pool;
  borrowPool: Pool;
  quoteState: Extract<QuoteState, { status: "ready" }>;
  borrowDestination: string;
  refundDestination: string;
};

export async function fetchMarketData(): Promise<{ pools: Pool[]; prices: AssetPrices }> {
  const [pools, prices] = await Promise.all([
    liquidiumClient.market.listPools(),
    liquidiumClient.market.getAssetPrices(),
  ]);

  return { pools, prices };
}

export async function fetchLoanTracking(shortRef: string): Promise<TrackingResult> {
  const [loanResult, activitiesResult] = await Promise.allSettled([
    liquidiumClient.instantLoans.get({ ref: shortRef }),
    liquidiumClient.activities.list({ shortRef, filter: "all" }),
  ]);

  if (loanResult.status === "rejected") {
    throw loanResult.reason;
  }

  return {
    loan: loanResult.value,
    activities: activitiesResult.status === "fulfilled" ? activitiesResult.value : [],
    activityError:
      activitiesResult.status === "rejected"
        ? `Loan loaded, but activity tracking failed: ${getErrorMessage(activitiesResult.reason)}`
        : null,
  };
}

export async function createInstantLoan({
  collateralPool,
  borrowPool,
  quoteState,
  borrowDestination,
  refundDestination,
}: CreateInstantLoanParams): Promise<InstantLoan> {
  const collateralAsset = toInstantLoanAsset(collateralPool.asset);
  const borrowAsset = toInstantLoanAsset(borrowPool.asset);

  if (!collateralAsset || !borrowAsset) {
    throw new Error("Selected pools are not supported by instant loans.");
  }

  if (quoteState.ltv.validationErrors.length > 0) {
    throw new Error(formatQuoteErrors(quoteState.ltv));
  }

  return liquidiumClient.instantLoans.create({
    collateralPoolId: collateralPool.id,
    borrowPoolId: borrowPool.id,
    collateralAsset,
    borrowAsset,
    collateralAmount: quoteState.collateralAmount,
    borrowAmount: quoteState.borrowAmount,
    ltvMaxBps: quoteState.ltv.maxAllowedLtvBps,
    depositWindowSeconds: DEPOSIT_WINDOW_SECONDS,
    borrowDestination: {
      type: "External",
      address: borrowDestination.trim(),
    },
    refundDestination: {
      type: "External",
      address: refundDestination.trim(),
    },
  });
}

export function buildQuoteState({
  pools,
  prices,
  collateralPool,
  borrowPool,
  collateralInput,
  borrowInput,
}: {
  pools: Pool[];
  prices: AssetPrices;
  collateralPool: Pool | undefined;
  borrowPool: Pool | undefined;
  collateralInput: string;
  borrowInput: string;
}): QuoteState {
  if (!collateralPool || !borrowPool) {
    return { status: "empty", message: "Choose collateral and borrow markets to preview LTV." };
  }

  try {
    const collateralAmount = parseDecimalToBaseUnits(collateralInput, collateralPool.decimals);
    const borrowAmount = parseDecimalToBaseUnits(borrowInput, borrowPool.decimals);

    if (collateralAmount <= ZERO_AMOUNT || borrowAmount <= ZERO_AMOUNT) {
      return { status: "error", message: "Amounts must be greater than zero." };
    }

    const ltv = liquidiumClient.quote.calculateLtv(
      {
        collateralPoolId: collateralPool.id,
        borrowPoolId: borrowPool.id,
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

export function formatBaseUnits(
  amount: bigint,
  decimals: bigint,
  maxFractionDigits = DEFAULT_FRACTION_DIGITS,
): string {
  const decimalsNumber = Number(decimals);

  if (
    !Number.isInteger(decimalsNumber) ||
    decimalsNumber < 0 ||
    decimalsNumber > MAX_SAFE_DECIMALS
  ) {
    return amount.toString();
  }

  const scale = 10n ** BigInt(decimalsNumber);
  const wholeAmount = amount / scale;
  const fractionalAmount = amount % scale;

  if (fractionalAmount === ZERO_AMOUNT || maxFractionDigits === 0) {
    return wholeAmount.toString();
  }

  const fraction = fractionalAmount
    .toString()
    .padStart(decimalsNumber, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  return fraction ? `${wholeAmount.toString()}.${fraction}` : wholeAmount.toString();
}

export function formatScaledRate(rate: bigint, decimals: bigint): string {
  return `${formatBaseUnits(rate * BigInt(BPS_PER_PERCENT), decimals, 2)}%`;
}

export function formatBps(bps: bigint): string {
  return `${(Number(bps) / BPS_PER_PERCENT).toFixed(2)}%`;
}

export function formatQuoteErrors(ltv: LtvCalculation): string {
  if (ltv.validationErrors.length === 0) {
    return "No quote errors.";
  }

  return ltv.validationErrors.map((error) => error.message).join(" ");
}

export function formatMinimumBorrowAmount(pool: Pool | undefined): string {
  if (!pool) {
    return "--";
  }

  const minimumBorrowAmount = getMinimumBorrowAmount(pool.asset);

  if (minimumBorrowAmount === ZERO_AMOUNT) {
    return "No SDK minimum";
  }

  return `${formatBaseUnits(minimumBorrowAmount, pool.decimals)} ${pool.asset}`;
}

export function formatSupplyTarget(target: SupplyTarget): string {
  if (target.type === "nativeAddress") {
    return target.address;
  }

  return target.account;
}

export function getPoolById(pools: Pool[], poolId: string): Pool | undefined {
  return pools.find((pool) => pool.id === poolId);
}

export function chooseDefaultPool(pools: Pool[], preferredAssets: string[]): Pool | undefined {
  const eligiblePools = pools.filter((pool) => isInstantLoanAsset(pool.asset) && !pool.frozen);

  for (const asset of preferredAssets) {
    const pool = eligiblePools.find((candidatePool) => candidatePool.asset === asset);

    if (pool) {
      return pool;
    }
  }

  return eligiblePools[0];
}

export function isInstantLoanAsset(asset: string): asset is InstantLoanAsset {
  return INSTANT_LOAN_ASSETS.includes(asset as InstantLoanAsset);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error.";
}

function parseDecimalToBaseUnits(value: string, decimals: bigint): bigint {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error("Enter an amount.");
  }

  if (!/^\d+(\.\d+)?$/.test(normalizedValue)) {
    throw new Error("Use a positive decimal number.");
  }

  const decimalsNumber = Number(decimals);

  if (
    !Number.isInteger(decimalsNumber) ||
    decimalsNumber < 0 ||
    decimalsNumber > MAX_SAFE_DECIMALS
  ) {
    throw new Error("Selected market uses an unsupported decimal scale.");
  }

  const [wholePart, fractionalPart = ""] = normalizedValue.split(".");

  if (fractionalPart.length > decimalsNumber) {
    throw new Error(`Too many decimal places for this market. Maximum is ${decimalsNumber}.`);
  }

  const scale = 10n ** BigInt(decimalsNumber);
  const wholeAmount = BigInt(wholePart) * scale;
  const paddedFraction = fractionalPart.padEnd(decimalsNumber, "0");
  const fractionalAmount = paddedFraction ? BigInt(paddedFraction) : ZERO_AMOUNT;

  return wholeAmount + fractionalAmount;
}

function toInstantLoanAsset(asset: string): InstantLoanAsset | null {
  if (!isInstantLoanAsset(asset)) {
    return null;
  }

  return asset;
}
