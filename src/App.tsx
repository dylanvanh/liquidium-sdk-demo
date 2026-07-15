import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Chain,
  type Activity,
  type SimpleLoan,
  type SimpleLoanFindResult,
  type SupplyTarget,
} from "@liquidium/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { AssetIcon } from "@/components/asset-icon";
import { AdvancedLoading } from "@/components/advanced-loading";
import { InsightsLoading } from "@/components/insights-loading";
import { Code2, PackageOpen, RefreshCw } from "lucide-react";
import {
  DEPOSIT_WINDOW_SECONDS,
  InstantLoanRecoveryError,
  POLL_INTERVAL_MS,
  USD_DECIMALS,
  buildQuoteState,
  createInstantLoan,
  fetchLoanTracking,
  fetchMarketData,
  findLoans,
  formatBaseUnits,
  formatBps,
  formatQuoteErrors,
  formatUsd,
  getErrorMessage,
  getRoute,
  routeKey,
  selectChainTarget,
  validateDestination,
  type AssetRoute,
  type MarketData,
} from "./liquidium";

const AdvancedApp = lazy(() => import("./AdvancedApp"));
const InsightsApp = lazy(() => import("./InsightsApp"));
type AppMode = "simple" | "advanced" | "insights";
const APP_MODE_PATHS: Record<AppMode, string> = {
  simple: "/",
  advanced: "/advanced",
  insights: "/insights",
};

export function App() {
  const [mode, setMode] = useState<AppMode>(() => getAppModeFromPathname(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setMode(getAppModeFromPathname(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigateToMode(nextMode: AppMode) {
    const nextPath = APP_MODE_PATHS[nextMode];
    if (window.location.pathname !== nextPath) window.history.pushState(null, "", nextPath);
    setMode(nextMode);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Liquidium SDK demo home">
          <span className="brand-mark">L</span>
          <span>liquidium-sdk-demo</span>
        </a>
        <nav className="mode-nav" aria-label="Product mode">
          {(["simple", "advanced", "insights"] as const).map((item) => (
            <Button
              className="mode-button"
              variant={mode === item ? "secondary" : "ghost"}
              aria-current={mode === item ? "page" : undefined}
              key={item}
              type="button"
              onClick={() => navigateToMode(item)}
            >
              {item === "simple" ? "Simple loan" : item === "advanced" ? "Advanced" : "Insights"}
            </Button>
          ))}
        </nav>
        <Badge className="network-badge" variant="outline">
          <i /> Mainnet
        </Badge>
      </header>

      <main id="workspace" className="workspace">
        {mode === "simple" ? (
          <SimpleLoan />
        ) : mode === "advanced" ? (
          <Suspense fallback={<AdvancedLoading />}>
            <AdvancedApp />
          </Suspense>
        ) : (
          <Suspense fallback={<InsightsLoading />}>
            <InsightsApp />
          </Suspense>
        )}
      </main>
      <footer className="footer">
        <nav className="footer-links" aria-label="Source code">
          <a
            href="https://github.com/dylanvanh/liquidium-sdk-demo"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Code2 aria-hidden="true" size={16} />
            Demo on GitHub
          </a>
          <a
            href="https://github.com/Liquidium-Inc/liquidium-sdk"
            target="_blank"
            rel="noopener noreferrer"
          >
            <PackageOpen aria-hidden="true" size={16} />
            Liquidium SDK on GitHub
          </a>
        </nav>
        <span>Transactions execute on mainnet. Review wallet prompts carefully.</span>
      </footer>
    </div>
  );
}

function getAppModeFromPathname(pathname: string): AppMode {
  const normalizedPathname = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPathname === APP_MODE_PATHS.advanced) return "advanced";
  if (normalizedPathname === APP_MODE_PATHS.insights) return "insights";
  return "simple";
}

function SimpleLoan() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [collateralKey, setCollateralKey] = useState("BTC:BTC");
  const [borrowKey, setBorrowKey] = useState("ETH:USDC");
  const [collateralInput, setCollateralInput] = useState("0.001");
  const [borrowInput, setBorrowInput] = useState("25");
  const [borrowDestination, setBorrowDestination] = useState("");
  const [refundDestination, setRefundDestination] = useState("");
  const [loan, setLoan] = useState<SimpleLoan | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedCollateralChain, setSelectedCollateralChain] = useState<
    typeof Chain.BTC | typeof Chain.ETH | typeof Chain.ICP
  >(Chain.BTC);
  const [message, setMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createdLoanRecovery, setCreatedLoanRecovery] = useState<InstantLoanRecoveryError | null>(
    null,
  );
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMarketData()
      .then((data) => {
        if (cancelled) return;
        setMarket(data);
        if (!getRoute(data.routes, collateralKey)) setCollateralKey(routeKey(data.routes[0]));
        if (!getRoute(data.routes, borrowKey))
          setBorrowKey(routeKey(data.routes[1] ?? data.routes[0]));
      })
      .catch((error) => !cancelled && setMarketError(getErrorMessage(error)));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loan) return;
    const refresh = () => {
      void fetchLoanTracking(loan.ref)
        .then((tracking) => {
          setLoan(tracking.loan);
          setActivities(tracking.activities);
          if (tracking.activityError) setMessage(tracking.activityError);
        })
        .catch((error) => setMessage(getErrorMessage(error)));
    };
    const id = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [loan?.ref]);

  const collateralRoute = market ? getRoute(market.routes, collateralKey) : undefined;
  const borrowRoute = market ? getRoute(market.routes, borrowKey) : undefined;
  const quote = useMemo(
    () =>
      buildQuoteState({
        pools: market?.pools ?? [],
        prices: market?.prices ?? {},
        collateralRoute,
        borrowRoute,
        collateralInput,
        borrowInput,
      }),
    [market, collateralRoute, borrowRoute, collateralInput, borrowInput],
  );
  const borrowDestinationError =
    borrowRoute && borrowDestination.trim()
      ? validateDestination(borrowRoute, borrowDestination)
      : null;
  const refundDestinationError =
    collateralRoute && refundDestination.trim()
      ? validateDestination(collateralRoute, refundDestination)
      : null;

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!collateralRoute || !borrowRoute || quote.status !== "ready") return;
    if (quote.ltv.validationErrors.length) {
      setMessage(formatQuoteErrors(quote.ltv));
      return;
    }
    setIsCreating(true);
    setMessage(null);
    setSelectedCollateralChain(collateralRoute.chain);
    try {
      const created = await createInstantLoan({
        collateralRoute,
        borrowRoute,
        quote,
        borrowDestination,
        refundDestination,
      });
      setLoan(created);
      setActivities([]);
      setCreatedLoanRecovery(null);
    } catch (error) {
      if (error instanceof InstantLoanRecoveryError) {
        setCreatedLoanRecovery(error);
        setMessage(null);
      } else {
        setMessage(getErrorMessage(error));
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function loadCreatedLoan() {
    if (!createdLoanRecovery) return;
    setIsCreating(true);
    setMessage(null);
    try {
      const tracking = await fetchLoanTracking(createdLoanRecovery.loanId);
      setLoan(tracking.loan);
      setActivities(tracking.activities);
      const firstChain = Object.keys(tracking.loan.initialDeposit.targets)[0] as
        | typeof Chain.BTC
        | typeof Chain.ETH
        | typeof Chain.ICP
        | undefined;
      if (firstChain) setSelectedCollateralChain(firstChain);
      setCreatedLoanRecovery(null);
      if (tracking.activityError) setMessage(tracking.activityError);
    } catch (error) {
      setMessage(
        `Loan ${createdLoanRecovery.ref} is already created. Loading failed: ${getErrorMessage(error)}`,
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="simple-layout" aria-labelledby="simple-title">
      <div className="intro-copy">
        <p className="eyebrow">Accountless borrowing</p>
        <h1 id="simple-title">Borrow across chains without setting up a profile.</h1>
        <p>
          Choose the route, set the amount, and Liquidium creates a deposit target you can fund from
          your own wallet.
        </p>
        <Button
          className="text-action"
          variant="link"
          type="button"
          onClick={() => setManageOpen((value) => !value)}
        >
          {manageOpen ? "Close loan manager" : "Find an existing loan"} <span>↗</span>
        </Button>
      </div>

      <div className="composer-column">
        {manageOpen ? (
          <LoanManager
            onLoaded={(tracking) => {
              setLoan(tracking.loan);
              setActivities(tracking.activities);
              const firstChain = Object.keys(tracking.loan.initialDeposit.targets)[0] as
                | typeof Chain.BTC
                | typeof Chain.ETH
                | typeof Chain.ICP
                | undefined;
              if (firstChain) setSelectedCollateralChain(firstChain);
              setManageOpen(false);
            }}
          />
        ) : null}
        <form className="composer" onSubmit={handleCreate}>
          <div className="composer-head">
            <div>
              <p className="eyebrow">New loan</p>
              <h2>Set your terms</h2>
            </div>
            <Badge className="time-chip" variant="secondary">
              {DEPOSIT_WINDOW_SECONDS / 60n} min deposit window
            </Badge>
          </div>

          <AmountPanel
            label="You deposit"
            value={collateralInput}
            routeKeyValue={collateralKey}
            routes={market?.routes ?? []}
            loading={!market && !marketError}
            onValue={setCollateralInput}
            onRoute={setCollateralKey}
          />
          <div className="swap-divider">
            <span>↓</span>
          </div>
          <AmountPanel
            label="You borrow"
            value={borrowInput}
            routeKeyValue={borrowKey}
            routes={market?.routes ?? []}
            loading={!market && !marketError}
            onValue={setBorrowInput}
            onRoute={setBorrowKey}
          />

          <div className="destination-grid">
            <Field
              label={`${borrowRoute?.displaySymbol ?? "Borrow"} destination`}
              value={borrowDestination}
              onChange={setBorrowDestination}
              placeholder={
                borrowRoute?.chain === Chain.ICP
                  ? "IC principal or ICRC account"
                  : "Receiving address"
              }
              error={borrowDestinationError}
            />
            <Field
              label="Collateral refund address"
              value={refundDestination}
              onChange={setRefundDestination}
              placeholder={
                collateralRoute?.chain === Chain.ICP
                  ? "IC principal or ICRC account"
                  : "Refund address"
              }
              error={refundDestinationError}
            />
          </div>

          <QuoteStrip quote={quote} loading={!market && !marketError} />
          {message || marketError ? (
            <InlineNotice tone="error">{message ?? marketError}</InlineNotice>
          ) : null}
          {createdLoanRecovery ? (
            <div className="recovery-notice" role="status">
              <div>
                <strong>Loan {createdLoanRecovery.ref} was created.</strong>
                <span>Do not submit another loan. Load the existing loan to continue.</span>
              </div>
              <Button type="button" disabled={isCreating} onClick={() => void loadCreatedLoan()}>
                {isCreating ? "Loading…" : "Load created loan"}
              </Button>
            </div>
          ) : null}
          <Button
            className="primary-action"
            size="lg"
            type="submit"
            disabled={
              isCreating ||
              Boolean(createdLoanRecovery) ||
              quote.status !== "ready" ||
              quote.ltv.validationErrors.length > 0 ||
              !borrowDestination.trim() ||
              !refundDestination.trim() ||
              Boolean(borrowDestinationError || refundDestinationError)
            }
          >
            {isCreating
              ? "Creating loan…"
              : createdLoanRecovery
                ? "Loan already created"
                : market
                  ? "Create simple loan"
                  : "Waiting for live routes"}
          </Button>
        </form>

        {loan ? (
          <LoanReceipt
            loan={loan}
            activities={activities}
            selectedChain={selectedCollateralChain}
            onChain={setSelectedCollateralChain}
          />
        ) : null}
      </div>
    </section>
  );
}

function AmountPanel(props: {
  label: string;
  value: string;
  routeKeyValue: string;
  routes: AssetRoute[];
  loading: boolean;
  onValue: (value: string) => void;
  onRoute: (value: string) => void;
}) {
  const [showIcp, setShowIcp] = useState(props.routeKeyValue.startsWith("ICP:"));
  const visibleRoutes = props.routes.filter((route) =>
    showIcp ? route.chain === Chain.ICP : route.chain !== Chain.ICP,
  );
  const selectedRoute = props.routes.find((route) => routeKey(route) === props.routeKeyValue);
  return (
    <div className="amount-panel">
      <div className="amount-label-row">
        <span>{props.label}</span>
        <span>Route</span>
      </div>
      <div className="amount-row">
        <Input
          aria-label={`${props.label} amount`}
          inputMode="decimal"
          value={props.value}
          onChange={(event) => props.onValue(event.target.value)}
        />
        <div className="asset-native-select">
          {selectedRoute ? (
            <AssetIcon asset={selectedRoute.asset} chain={selectedRoute.chain} />
          ) : null}
          <NativeSelect
            aria-label={`${props.label} asset`}
            value={props.routeKeyValue}
            disabled={props.loading}
            onChange={(event) => props.onRoute(event.target.value)}
          >
            {!visibleRoutes.some((route) => routeKey(route) === props.routeKeyValue) ? (
              <option value={props.routeKeyValue}>
                {selectedRoute?.displaySymbol ?? (props.loading ? "Loading routes…" : "Asset")}
              </option>
            ) : null}
            {visibleRoutes.map((route) => (
              <option key={routeKey(route)} value={routeKey(route)}>
                {route.displaySymbol}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <label className="icp-toggle">
        <Switch
          checked={showIcp}
          disabled={props.loading}
          onCheckedChange={(checked) => {
            setShowIcp(checked);
            const next = props.routes.find((route) =>
              checked ? route.chain === Chain.ICP : route.chain !== Chain.ICP,
            );
            if (next) props.onRoute(routeKey(next));
          }}
        />
        ICP assets
      </label>
    </div>
  );
}

function QuoteStrip({
  quote,
  loading,
}: {
  quote: ReturnType<typeof buildQuoteState>;
  loading: boolean;
}) {
  if (loading)
    return (
      <div className="quote-strip quote-strip-loading" role="status">
        {(["Loan-to-value", "Max LTV", "Borrow value"] as const).map((label) => (
          <div key={label}>
            <span>{label}</span>
            <i className="loading-placeholder medium" aria-hidden="true" />
          </div>
        ))}
        <p>
          <RefreshCw aria-hidden="true" className="is-spinning" />
          Fetching live pool rates
        </p>
      </div>
    );
  if (quote.status !== "ready")
    return (
      <div className="quote-strip muted">
        <span>Quote</span>
        <strong>{quote.message}</strong>
      </div>
    );
  const invalid = quote.ltv.validationErrors.length > 0;
  return (
    <div className={invalid ? "quote-strip invalid" : "quote-strip"}>
      <div>
        <span>Loan-to-value</span>
        <strong>{formatBps(quote.ltv.ltvBps)}</strong>
      </div>
      <div>
        <span>Max LTV</span>
        <strong>{formatBps(quote.ltv.maxAllowedLtvBps)}</strong>
      </div>
      <div>
        <span>Borrow value</span>
        <strong>{formatUsd(quote.ltv.borrowUsd, USD_DECIMALS)}</strong>
      </div>
      <p>{invalid ? formatQuoteErrors(quote.ltv) : "Ready to create"}</p>
    </div>
  );
}

function LoanManager({
  onLoaded,
}: {
  onLoaded: (tracking: Awaited<ReturnType<typeof fetchLoanTracking>>) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SimpleLoanFindResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (/^\d+$/.test(query.trim())) {
        onLoaded(await fetchLoanTracking(BigInt(query.trim())));
      } else if (/^[A-Za-z0-9]{6}$/.test(query.trim())) {
        onLoaded(await fetchLoanTracking(query));
      } else {
        setResults(await findLoans(query));
      }
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="loan-manager">
      <p className="eyebrow">Manage loans</p>
      <h2>Find by code, address, or transaction</h2>
      <form onSubmit={search}>
        <Input
          aria-label="Loan lookup"
          placeholder="ABC123, address, or transaction ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? "Searching…" : "Find loan"}
        </Button>
      </form>
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {results.map((result) => (
        <Button
          className="search-result"
          variant="secondary"
          type="button"
          key={result.ref}
          onClick={() =>
            void fetchLoanTracking(result.loanId)
              .then(onLoaded)
              .catch((cause) => setError(getErrorMessage(cause)))
          }
        >
          <strong>{result.ref}</strong>
          <span>
            {result.collateral.asset} collateral · {result.borrow.asset} borrowed
          </span>
        </Button>
      ))}
    </aside>
  );
}

function LoanReceipt({
  loan,
  activities,
  selectedChain,
  onChain,
}: {
  loan: SimpleLoan;
  activities: Activity[];
  selectedChain: typeof Chain.BTC | typeof Chain.ETH | typeof Chain.ICP;
  onChain: (chain: typeof Chain.BTC | typeof Chain.ETH | typeof Chain.ICP) => void;
}) {
  const depositEntries = Object.entries(loan.initialDeposit.targets).filter(
    (
      entry,
    ): entry is [
      typeof Chain.BTC | typeof Chain.ETH | typeof Chain.ICP,
      NonNullable<(typeof loan.initialDeposit.targets)[keyof typeof loan.initialDeposit.targets]>,
    ] => Boolean(entry[1]),
  );
  const deposit = selectChainTarget(loan.initialDeposit.targets, selectedChain);
  const repayment = selectChainTarget(loan.repayment.targets, loan.borrow.chain, false);
  return (
    <section className="receipt" aria-live="polite">
      <div className="receipt-head">
        <div>
          <p className="eyebrow">Loan {loan.ref}</p>
          <h2>{loan.status.state.replaceAll("_", " ")}</h2>
        </div>
        <span className="status-dot">{activities.length} activities</span>
      </div>
      <div className="route-tabs">
        {depositEntries.map(([chain]) => (
          <Button
            type="button"
            size="sm"
            variant={chain === selectedChain ? "secondary" : "ghost"}
            key={chain}
            onClick={() => onChain(chain)}
          >
            {chain} deposit
          </Button>
        ))}
      </div>
      {deposit ? (
        <TargetBlock
          label="Send collateral"
          amount={`${formatBaseUnits(deposit.amount, loan.initialDeposit.decimals)} ${loan.initialDeposit.asset}`}
          fee={`${formatBaseUnits(deposit.inflowFeeAmount, loan.initialDeposit.decimals)} fee`}
          target={deposit.target}
        />
      ) : (
        <InlineNotice tone="error">No deposit target is available for this route.</InlineNotice>
      )}
      {repayment ? (
        <TargetBlock
          label="Repayment quote"
          amount={`${formatBaseUnits(repayment.amount, loan.repayment.decimals)} ${loan.repayment.asset}`}
          fee={`${formatBaseUnits(repayment.inflowFeeAmount, loan.repayment.decimals)} fee`}
          target={repayment.target}
        />
      ) : null}
    </section>
  );
}

function TargetBlock({
  label,
  amount,
  fee,
  target,
}: {
  label: string;
  amount: string;
  fee: string;
  target: SupplyTarget;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="target-block">
      <div>
        <span>{label}</span>
        <strong>{amount}</strong>
        <small>{fee}</small>
      </div>
      <div className="target-details">
        <small>{target.chain === Chain.ICP ? "ICRC account" : `${target.chain} address`}</small>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            void navigator.clipboard.writeText(target.address).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          <code>{target.address}</code>
          <span>{copied ? "Copied" : "Copy"}</span>
        </Button>
        {target.icpAccountIdentifier ? (
          <small>
            ICP account identifier: <code>{target.icpAccountIdentifier}</code>
          </small>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string | null;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

export function InlineNotice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "error" | "success";
}) {
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
