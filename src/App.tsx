import { startTransition, useEffect, useState, type FormEvent } from "react";
import type { Activity, AssetPrices, InstantLoan, Pool, SupplyTarget } from "@liquidium/client";
import {
  DEFAULT_BORROW_ASSETS,
  DEFAULT_COLLATERAL_ASSETS,
  DEPOSIT_WINDOW_SECONDS,
  POLL_INTERVAL_MS,
  USD_DECIMALS,
  buildQuoteState,
  chooseDefaultPool,
  createInstantLoan,
  fetchLoanTracking,
  fetchMarketData,
  formatBaseUnits,
  formatBps,
  formatQuoteErrors,
  formatScaledRate,
  formatSupplyTarget,
  getErrorMessage,
  getPoolById,
  isInstantLoanAsset,
} from "./liquidium";

type MarketStatus = "loading" | "ready" | "error";
type Tone = "idle" | "waiting" | "working" | "success" | "error";
type LoanStage = "deposit" | "borrow" | "repayment";
type ActivityKindName = Activity["kind"];

export function App() {
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("loading");
  const [marketError, setMarketError] = useState<string | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [prices, setPrices] = useState<AssetPrices>({});
  const [collateralPoolId, setCollateralPoolId] = useState("");
  const [borrowPoolId, setBorrowPoolId] = useState("");
  const [collateralInput, setCollateralInput] = useState("0.001");
  const [borrowInput, setBorrowInput] = useState("25");
  const [borrowDestination, setBorrowDestination] = useState("");
  const [refundDestination, setRefundDestination] = useState("");
  const [activeLoan, setActiveLoan] = useState<InstantLoan | null>(null);
  const [trackingRef, setTrackingRef] = useState("");
  const [restoreRef, setRestoreRef] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [lastPolledAt, setLastPolledAt] = useState<Date | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRefreshingMarket, setIsRefreshingMarket] = useState(false);

  const selectablePools = pools.filter((pool) => isInstantLoanAsset(pool.asset));
  const collateralPool = getPoolById(selectablePools, collateralPoolId);
  const borrowPool = getPoolById(selectablePools, borrowPoolId);
  const quoteState = buildQuoteState({
    pools,
    prices,
    collateralPool,
    borrowPool,
    collateralInput,
    borrowInput,
  });
  const latestActivities = sortActivitiesNewestFirst(activities);
  const stageItems = buildStageItems(activeLoan, activities);
  const canCreateLoan =
    quoteState.status === "ready" &&
    quoteState.ltv.validationErrors.length === 0 &&
    borrowDestination.trim().length > 0 &&
    refundDestination.trim().length > 0 &&
    !isCreating;

  useEffect(() => {
    let isCancelled = false;

    async function loadInitialMarketData() {
      try {
        const marketData = await fetchMarketData();

        if (isCancelled) {
          return;
        }

        const nextCollateralPool = chooseDefaultPool(marketData.pools, DEFAULT_COLLATERAL_ASSETS);
        const nextBorrowPool = chooseDefaultPool(marketData.pools, DEFAULT_BORROW_ASSETS);

        startTransition(() => {
          setPools(marketData.pools);
          setPrices(marketData.prices);
          setCollateralPoolId(nextCollateralPool?.id ?? "");
          setBorrowPoolId(nextBorrowPool?.id ?? "");
          setMarketStatus("ready");
          setMarketError(null);
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setMarketStatus("error");
        setMarketError(getErrorMessage(error));
      }
    }

    void loadInitialMarketData();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const normalizedRef = trackingRef.trim();

    if (!normalizedRef) {
      return;
    }

    let isCancelled = false;

    async function pollTrackingState() {
      try {
        const result = await fetchLoanTracking(normalizedRef);

        if (isCancelled) {
          return;
        }

        startTransition(() => {
          setActiveLoan(result.loan);
          setActivities(result.activities);
          setTrackingError(result.activityError);
          setLastPolledAt(new Date());
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setTrackingError(getErrorMessage(error));
        setLastPolledAt(new Date());
      }
    }

    void pollTrackingState();
    const intervalId = window.setInterval(pollTrackingState, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [trackingRef]);

  async function handleRefreshMarket() {
    setIsRefreshingMarket(true);
    setMarketError(null);

    try {
      const marketData = await fetchMarketData();
      setPools(marketData.pools);
      setPrices(marketData.prices);
      setMarketStatus("ready");

      if (!getPoolById(marketData.pools, collateralPoolId)) {
        setCollateralPoolId(
          chooseDefaultPool(marketData.pools, DEFAULT_COLLATERAL_ASSETS)?.id ?? "",
        );
      }

      if (!getPoolById(marketData.pools, borrowPoolId)) {
        setBorrowPoolId(chooseDefaultPool(marketData.pools, DEFAULT_BORROW_ASSETS)?.id ?? "");
      }
    } catch (error) {
      setMarketStatus("error");
      setMarketError(getErrorMessage(error));
    } finally {
      setIsRefreshingMarket(false);
    }
  }

  async function handleCreateLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (quoteState.status !== "ready") {
      setTrackingError(quoteState.message);
      return;
    }

    if (!collateralPool || !borrowPool) {
      setTrackingError("Select a collateral and borrow market before creating a loan.");
      return;
    }

    if (quoteState.ltv.validationErrors.length > 0) {
      setTrackingError(formatQuoteErrors(quoteState.ltv));
      return;
    }

    setIsCreating(true);
    setTrackingError(null);

    try {
      const loan = await createInstantLoan({
        collateralPool,
        borrowPool,
        quoteState,
        borrowDestination,
        refundDestination,
      });

      setActiveLoan(loan);
      setTrackingRef(loan.ref);
      setRestoreRef(loan.ref);
      setActivities([]);
      setLastPolledAt(new Date());
    } catch (error) {
      setTrackingError(getErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRestoreLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedRef = restoreRef.trim();

    if (!normalizedRef) {
      setTrackingError("Enter a loan reference to restore.");
      return;
    }

    setIsRestoring(true);
    setTrackingError(null);

    try {
      const result = await fetchLoanTracking(normalizedRef);
      setActiveLoan(result.loan);
      setTrackingRef(result.loan.ref);
      setRestoreRef(result.loan.ref);
      setActivities(result.activities);
      setTrackingError(result.activityError);
      setLastPolledAt(new Date());
    } catch (error) {
      setTrackingError(getErrorMessage(error));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#eef1e8] text-[#17201a]">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-[#d7dccf] bg-[#f9fbf5]/90 p-4 shadow-[0_20px_80px_rgba(46,62,49,0.12)] backdrop-blur md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#6d7669]">
                Liquidium SDK POC
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#111810] md:text-5xl">
                Instant loans, no profile setup.
              </h1>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <StatusChip
                label="Market"
                tone={
                  marketStatus === "ready"
                    ? "success"
                    : marketStatus === "error"
                      ? "error"
                      : "working"
                }
                value={formatMarketStatus(marketStatus)}
              />
              <StatusChip
                label="Loan"
                tone={getLoanTone(activeLoan)}
                value={activeLoan?.status ?? "not started"}
              />
              <StatusChip
                label="Poll"
                tone={trackingRef ? "working" : "idle"}
                value={lastPolledAt ? formatTime(lastPolledAt) : "idle"}
              />
              <StatusChip
                label="Activity"
                tone={activities.length > 0 ? "success" : "idle"}
                value={`${activities.length} events`}
              />
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-[1.5rem] border border-[#d7dccf] bg-[#f9fbf5] p-3 md:grid-cols-3">
          {stageItems.map((stage) => (
            <div key={stage.label} className="rounded-[1.1rem] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#1b241c]">{stage.label}</p>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${getToneClass(stage.tone)}`}
                >
                  {stage.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-[#6b7468]">{stage.description}</p>
            </div>
          ))}
        </section>

        {trackingError ? (
          <div className="rounded-[1.25rem] border border-[#efb8a8] bg-[#fff4ef] px-4 py-3 text-sm font-medium text-[#973f28]">
            {trackingError}
          </div>
        ) : null}

        {marketError ? (
          <div className="rounded-[1.25rem] border border-[#efb8a8] bg-[#fff4ef] px-4 py-3 text-sm font-medium text-[#973f28]">
            {marketError}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="rounded-[2rem] border border-[#d7dccf] bg-[#f9fbf5] p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#778071]">
                  Markets
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Select a pair</h2>
              </div>
              <button
                className="rounded-full border border-[#ccd3c3] bg-white px-4 py-2 text-sm font-semibold text-[#263126] transition hover:border-[#9da98f] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRefreshingMarket}
                type="button"
                onClick={handleRefreshMarket}
              >
                {isRefreshingMarket ? "Refreshing" : "Refresh"}
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <PoolSelectCard
                label="Collateral"
                poolId={collateralPoolId}
                pools={selectablePools}
                price={collateralPool ? prices[collateralPool.asset] : undefined}
                onChange={setCollateralPoolId}
              />
              <PoolSelectCard
                label="Borrow"
                poolId={borrowPoolId}
                pools={selectablePools}
                price={borrowPool ? prices[borrowPool.asset] : undefined}
                onChange={setBorrowPoolId}
              />
            </div>

            <div className="mt-5 rounded-[1.5rem] bg-[#111810] p-5 text-[#f8fbf4]">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm text-[#b8c4b2]">Health preview</p>
                  <p className="mt-1 text-4xl font-semibold tracking-[-0.05em]">
                    {quoteState.status === "ready" ? formatBps(quoteState.ltv.ltvBps) : "--"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Metric
                    label="Max LTV"
                    value={
                      quoteState.status === "ready"
                        ? formatBps(quoteState.ltv.maxAllowedLtvBps)
                        : "--"
                    }
                  />
                  <Metric
                    label="Borrow value"
                    value={
                      quoteState.status === "ready"
                        ? `$${formatBaseUnits(quoteState.ltv.borrowUsd, USD_DECIMALS, 2)}`
                        : "--"
                    }
                  />
                  <Metric
                    label="Collateral value"
                    value={
                      quoteState.status === "ready"
                        ? `$${formatBaseUnits(quoteState.ltv.collateralUsd, USD_DECIMALS, 2)}`
                        : "--"
                    }
                  />
                  <Metric label="Deposit window" value={`${DEPOSIT_WINDOW_SECONDS / 60n} min`} />
                </div>
              </div>

              <div className="mt-4 rounded-[1rem] bg-white/10 px-4 py-3 text-sm text-[#dfe7da]">
                {quoteState.status === "ready"
                  ? quoteState.ltv.validationErrors.length > 0
                    ? formatQuoteErrors(quoteState.ltv)
                    : "Quote passes SDK-side LTV validation and is ready to create."
                  : quoteState.message}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-[#d7dccf] bg-[#f9fbf5] p-4 shadow-sm md:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#778071]">
              Borrow
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Create instant loan</h2>

            <form className="mt-5 flex flex-col gap-4" onSubmit={handleCreateLoan}>
              <AmountInput
                label="Collateral amount"
                value={collateralInput}
                asset={collateralPool?.asset ?? "asset"}
                onChange={setCollateralInput}
              />
              <AmountInput
                label="Borrow amount"
                value={borrowInput}
                asset={borrowPool?.asset ?? "asset"}
                onChange={setBorrowInput}
              />
              <TextInput
                label="Borrow destination"
                placeholder="0x... or receiving address"
                value={borrowDestination}
                onChange={setBorrowDestination}
              />
              <TextInput
                label="Refund destination"
                placeholder="bc1... or collateral refund address"
                value={refundDestination}
                onChange={setRefundDestination}
              />

              <button
                className="mt-2 rounded-2xl bg-[#b7ff4a] px-5 py-4 text-base font-bold text-[#111810] transition hover:bg-[#a8f03c] disabled:cursor-not-allowed disabled:bg-[#d7dccf] disabled:text-[#7f8878]"
                disabled={!canCreateLoan}
                type="submit"
              >
                {isCreating ? "Creating loan" : "Create instant loan"}
              </button>
            </form>

            <form
              className="mt-6 rounded-[1.25rem] border border-[#dfe5d8] bg-white p-4"
              onSubmit={handleRestoreLoan}
            >
              <label className="text-sm font-semibold text-[#263126]" htmlFor="restore-ref">
                Restore by loan ref
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="restore-ref"
                  className="min-w-0 flex-1 rounded-xl border border-[#d9dfd1] bg-[#fbfcf8] px-3 py-3 text-sm outline-none transition focus:border-[#8aa06f]"
                  placeholder="8Y9AQQ"
                  value={restoreRef}
                  onChange={(event) => setRestoreRef(event.target.value)}
                />
                <button
                  className="rounded-xl bg-[#111810] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#253125] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isRestoring}
                  type="submit"
                >
                  {isRestoring ? "Loading" : "Load"}
                </button>
              </div>
            </form>
          </section>
        </div>

        <section className="grid gap-6 lg:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
          <LoanDetails loan={activeLoan} />
          <ActivityList activities={latestActivities} />
        </section>
      </section>
    </main>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${getToneClass(tone)}`}>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] opacity-70">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function PoolSelectCard({
  label,
  poolId,
  pools,
  price,
  onChange,
}: {
  label: string;
  poolId: string;
  pools: Pool[];
  price?: number;
  onChange: (poolId: string) => void;
}) {
  const selectedPool = getPoolById(pools, poolId);

  return (
    <div className="rounded-[1.5rem] border border-[#dfe5d8] bg-white p-4">
      <label className="text-sm font-semibold text-[#263126]" htmlFor={`${label}-pool`}>
        {label} market
      </label>
      <select
        id={`${label}-pool`}
        className="mt-2 w-full rounded-xl border border-[#d9dfd1] bg-[#fbfcf8] px-3 py-3 text-sm font-semibold outline-none transition focus:border-[#8aa06f]"
        value={poolId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select market</option>
        {pools.map((pool) => (
          <option key={pool.id} value={pool.id} disabled={pool.frozen}>
            {pool.asset} on {pool.chain} {pool.frozen ? "(frozen)" : ""}
          </option>
        ))}
      </select>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Metric label="Price" value={price === undefined ? "--" : `$${price.toLocaleString()}`} />
        <Metric
          label="Liquidity"
          value={
            selectedPool
              ? formatBaseUnits(selectedPool.availableLiquidity, selectedPool.decimals)
              : "--"
          }
        />
        <Metric
          label="Borrow APR"
          value={
            selectedPool
              ? formatScaledRate(selectedPool.borrowingRate, selectedPool.rateDecimals)
              : "--"
          }
        />
        <Metric
          label="Utilization"
          value={
            selectedPool
              ? formatScaledRate(selectedPool.utilizationRate, selectedPool.rateDecimals)
              : "--"
          }
        />
      </div>
    </div>
  );
}

function AmountInput({
  label,
  value,
  asset,
  onChange,
}: {
  label: string;
  value: string;
  asset: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-[1.25rem] border border-[#dfe5d8] bg-white p-4">
      <span className="text-sm font-semibold text-[#263126]">{label}</span>
      <div className="mt-2 flex items-center gap-3">
        <input
          className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-[-0.04em] outline-none"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="rounded-full bg-[#eef1e8] px-3 py-1 text-sm font-bold text-[#263126]">
          {asset}
        </span>
      </div>
    </label>
  );
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[#263126]">{label}</span>
      <input
        className="mt-2 w-full rounded-xl border border-[#d9dfd1] bg-white px-3 py-3 text-sm outline-none transition focus:border-[#8aa06f]"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7b8574]">{label}</p>
      <p className="mt-1 font-semibold text-current">{value}</p>
    </div>
  );
}

function LoanDetails({ loan }: { loan: InstantLoan | null }) {
  if (!loan) {
    return (
      <section className="rounded-[2rem] border border-[#d7dccf] bg-[#f9fbf5] p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#778071]">
          Loan details
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">No active loan</h2>
        <p className="mt-3 text-sm text-[#6b7468]">
          Create a loan or load an existing reference to show deposit and repayment targets.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-[#d7dccf] bg-[#f9fbf5] p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#778071]">
        Loan details
      </p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#6b7468]">Reference</p>
          <h2 className="text-3xl font-semibold tracking-[-0.04em]">{loan.ref}</h2>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getLoanToneClass(loan)}`}>
          {loan.status}
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        <TargetCard
          label="Collateral deposit target"
          target={loan.depositTarget}
          amount={`${formatBaseUnits(loan.collateral.amount, loan.position.collateralDecimals)} ${loan.collateral.asset}`}
        />
        <TargetCard
          label="Repayment target"
          target={loan.repayment.target}
          amount={`${formatBaseUnits(loan.repayment.amount, loan.repayment.decimals)} ${loan.repayment.asset}`}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 rounded-[1.25rem] bg-white p-4 text-sm">
        <Metric label="Loan ID" value={loan.loanId.toString()} />
        <Metric label="Profile" value={shortenMiddle(loan.profileId)} />
        <Metric
          label="Borrowed"
          value={`${formatBaseUnits(loan.borrow.amount, loan.position.borrowedDecimals)} ${loan.borrow.asset}`}
        />
        <Metric
          label="Debt"
          value={`${formatBaseUnits(loan.position.totalDebtAmount, loan.position.borrowedDecimals)} ${loan.borrow.asset}`}
        />
      </div>
    </section>
  );
}

function TargetCard({
  label,
  target,
  amount,
}: {
  label: string;
  target: SupplyTarget;
  amount: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[#dfe5d8] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#263126]">{label}</p>
        <span className="rounded-full bg-[#eef1e8] px-3 py-1 text-xs font-bold text-[#263126]">
          {amount}
        </span>
      </div>
      <p className="mt-2 break-all rounded-xl bg-[#f4f6f0] p-3 font-mono text-xs text-[#394235]">
        {formatSupplyTarget(target)}
      </p>
    </div>
  );
}

function ActivityList({ activities }: { activities: Activity[] }) {
  return (
    <section className="rounded-[2rem] border border-[#d7dccf] bg-[#f9fbf5] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#778071]">
            Activity
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
            Deposits, borrows, repayments
          </h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#394235]">
          polling every {POLL_INTERVAL_MS / 1_000}s
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="mt-5 rounded-[1.25rem] bg-white p-4 text-sm text-[#6b7468]">
          Activity will appear here after Liquidium sees collateral deposits, borrow outflows, or
          repayments for the loan reference.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {activities.map((activity) => (
            <div key={activity.id} className="rounded-[1.25rem] bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-bold capitalize text-[#263126]">
                    {activity.kind} {activity.direction}
                  </p>
                  <p className="mt-1 text-xs text-[#6b7468]">
                    {activity.asset ?? "asset"} on {activity.chain ?? "chain"} ·{" "}
                    {formatTime(new Date(activity.timestampMs))}
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${getActivityToneClass(activity)}`}
                >
                  {activity.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-[#566052] md:grid-cols-3">
                <p>Amount: {activity.amount.toString()}</p>
                <p>Confirmations: {formatConfirmations(activity)}</p>
                <p className="truncate">Tx: {activity.txid ?? activity.txids?.[0] ?? "pending"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatConfirmations(activity: Activity): string {
  if (activity.confirmations === null || activity.requiredConfirmations === null) {
    return "pending";
  }

  return `${activity.confirmations}/${activity.requiredConfirmations}`;
}

function formatMarketStatus(status: MarketStatus): string {
  if (status === "loading") {
    return "loading";
  }

  if (status === "error") {
    return "error";
  }

  return "live";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function buildStageItems(loan: InstantLoan | null, activities: Activity[]) {
  return [
    buildStageItem("deposit", loan, activities),
    buildStageItem("borrow", loan, activities),
    buildStageItem("repayment", loan, activities),
  ];
}

function buildStageItem(stage: LoanStage, loan: InstantLoan | null, activities: Activity[]) {
  const activityKind = getActivityKindForStage(stage);
  const activity = findLatestActivity(activities, activityKind);

  if (activity) {
    return {
      label: getStageLabel(stage),
      status: activity.status,
      tone: getActivityTone(activity),
      description: getActivityDescription(activity),
    };
  }

  if (!loan) {
    return {
      label: getStageLabel(stage),
      status: "idle",
      tone: "idle" as Tone,
      description: "Waiting for a loan reference.",
    };
  }

  return getLoanDerivedStage(stage, loan);
}

function getActivityKindForStage(stage: LoanStage): ActivityKindName {
  if (stage === "deposit") {
    return "deposit";
  }

  if (stage === "borrow") {
    return "borrow";
  }

  return "repayment";
}

function getStageLabel(stage: LoanStage): string {
  if (stage === "deposit") {
    return "Deposit";
  }

  if (stage === "borrow") {
    return "Borrow";
  }

  return "Repayment";
}

function getLoanDerivedStage(stage: LoanStage, loan: InstantLoan) {
  if (stage === "deposit") {
    if (loan.status === "awaiting_deposit") {
      return {
        label: "Deposit",
        status: "requested",
        tone: "waiting" as Tone,
        description: "Send collateral to the generated deposit target.",
      };
    }

    return {
      label: "Deposit",
      status: loan.status === "closed" ? "confirmed" : "detected",
      tone: "success" as Tone,
      description: "Collateral has been detected for this loan.",
    };
  }

  if (stage === "borrow") {
    if (loan.status === "awaiting_deposit") {
      return {
        label: "Borrow",
        status: "waiting",
        tone: "idle" as Tone,
        description: "Borrow outflow starts after collateral is confirmed.",
      };
    }

    return {
      label: "Borrow",
      status: loan.status === "active" || loan.status === "closed" ? "sent" : "processing",
      tone:
        loan.status === "active" || loan.status === "closed"
          ? ("success" as Tone)
          : ("working" as Tone),
      description: "Liquidium is processing the requested borrow outflow.",
    };
  }

  if (loan.status === "closed") {
    return {
      label: "Repayment",
      status: "confirmed",
      tone: "success" as Tone,
      description: "Repayment is complete and the loan is closed.",
    };
  }

  if (loan.status === "settling") {
    return {
      label: "Repayment",
      status: "processing",
      tone: "working" as Tone,
      description: "Repayment has been detected and the loan is settling.",
    };
  }

  return {
    label: "Repayment",
    status: "ready",
    tone: "waiting" as Tone,
    description: "Use the repayment target when ready to close the loan.",
  };
}

function getActivityDescription(activity: Activity): string {
  const confirmationText = formatConfirmations(activity);

  if (activity.txid) {
    return `${activity.kind} ${activity.status}. Confirmations: ${confirmationText}.`;
  }

  return `${activity.kind} ${activity.status}. Waiting for transaction details.`;
}

function findLatestActivity(activities: Activity[], kind: ActivityKindName): Activity | undefined {
  let latestActivity: Activity | undefined;

  for (const activity of activities) {
    if (activity.kind !== kind) {
      continue;
    }

    if (!latestActivity || activity.timestampMs > latestActivity.timestampMs) {
      latestActivity = activity;
    }
  }

  return latestActivity;
}

function sortActivitiesNewestFirst(activities: Activity[]): Activity[] {
  return activities
    .slice()
    .sort((leftActivity, rightActivity) => rightActivity.timestampMs - leftActivity.timestampMs);
}

function getLoanTone(loan: InstantLoan | null): Tone {
  if (!loan) {
    return "idle";
  }

  if (loan.status === "closed") {
    return "success";
  }

  if (loan.status === "awaiting_deposit") {
    return "waiting";
  }

  return "working";
}

function getActivityTone(activity: Activity): Tone {
  if (activity.status === "failed") {
    return "error";
  }

  if (activity.status === "confirmed" || activity.status === "sent") {
    return "success";
  }

  if (activity.status === "requested") {
    return "waiting";
  }

  return "working";
}

function getActivityToneClass(activity: Activity): string {
  return getToneClass(getActivityTone(activity));
}

function getLoanToneClass(loan: InstantLoan): string {
  return getToneClass(getLoanTone(loan));
}

function getToneClass(tone: Tone): string {
  if (tone === "success") {
    return "bg-[#dbffc0] text-[#1d4d18]";
  }

  if (tone === "working") {
    return "bg-[#d8edff] text-[#164365]";
  }

  if (tone === "waiting") {
    return "bg-[#fff3bd] text-[#685000]";
  }

  if (tone === "error") {
    return "bg-[#ffe0d8] text-[#8f2f1c]";
  }

  return "bg-white text-[#566052]";
}

function shortenMiddle(value: string): string {
  const prefixLength = 8;
  const suffixLength = 6;
  const minimumLength = prefixLength + suffixLength + 3;

  if (value.length <= minimumLength) {
    return value;
  }

  return `${value.slice(0, prefixLength)}...${value.slice(-suffixLength)}`;
}
