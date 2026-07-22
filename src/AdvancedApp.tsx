import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BitcoinWalletConnectors } from "@dynamic-labs/bitcoin";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import {
  DynamicContextProvider,
  DynamicWidget,
  useDynamicContext,
} from "@dynamic-labs/sdk-react-core";
import {
  Chain,
  type Activity,
  type OutflowDetails,
  type SupplyFlow,
  type UserReserve,
} from "@liquidium/client";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { AssetIcon } from "@/components/asset-icon";
import {
  AdvancedComposerLoading,
  AdvancedPortfolioLoading,
  AdvancedProfileLoading,
} from "@/components/advanced-loading";
import { InlineNotice } from "./App";
import { getConnectedWallet } from "./dynamic-wallet";
import {
  POLL_INTERVAL_MS,
  createProfile,
  createSupplyFlow,
  fetchMarketData,
  fetchPortfolio,
  formatActivityStatusDetail,
  formatBaseUnits,
  formatBps,
  formatScaledRate,
  formatHealthFactor,
  formatUsd,
  getErrorMessage,
  getInflowQuote,
  getMaxRepay,
  getMaxWithdraw,
  parseDecimalToBaseUnits,
  resolveProfile,
  routeKey,
  submitManualSupply,
  borrowWithProfile,
  withdrawWithProfile,
  type AssetRoute,
  type EthSupplyMechanism,
  type InflowQuote,
  type MarketData,
  type PortfolioData,
} from "./liquidium";
import { formatTransactionId, getTransactionExplorerLink } from "./transaction-explorer";

type AdvancedTab = "supply" | "borrow" | "portfolio" | "repay" | "withdraw";
const environmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID?.trim();

export default function AdvancedApp() {
  if (!environmentId) {
    return (
      <section className="config-state">
        <p className="eyebrow">Wallet configuration</p>
        <h1>Advanced lending needs a Dynamic environment.</h1>
        <p>
          Add <code>VITE_DYNAMIC_ENVIRONMENT_ID</code> to your local <code>.env</code>, then restart
          the app. Simple loans remain wallet-free.
        </p>
      </section>
    );
  }
  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        initialAuthenticationMode: "connect-only",
        walletConnectors: [EthereumWalletConnectors, BitcoinWalletConnectors],
      }}
    >
      <AdvancedWorkspace />
    </DynamicContextProvider>
  );
}

function AdvancedWorkspace() {
  const { primaryWallet } = useDynamicContext();
  const wallet = useMemo(() => getConnectedWallet(primaryWallet), [primaryWallet]);
  const [tab, setTab] = useState<AdvancedTab>("supply");
  const [market, setMarket] = useState<MarketData | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedReserve, setSelectedReserve] = useState<UserReserve | null>(null);

  useEffect(() => {
    fetchMarketData()
      .then(setMarket)
      .catch((cause) =>
        toast.error(getErrorMessage(cause), { id: "advanced-market-error" }),
      );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPortfolio(null);
    setProfileId(null);
    if (!wallet) return;
    setProfileLoading(true);
    resolveProfile(wallet.address)
      .then((id) => {
        if (!cancelled) setProfileId(id);
      })
      .catch(
        (cause) =>
          !cancelled &&
          toast.error(getErrorMessage(cause), { id: "profile-resolution-error" }),
      )
      .finally(() => !cancelled && setProfileLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wallet?.address]);

  const refreshPortfolio = useCallback(async () => {
    if (!profileId) return;
    try {
      setPortfolio(await fetchPortfolio(profileId));
    } catch (cause) {
      toast.error(getErrorMessage(cause), { id: "portfolio-refresh-error" });
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return;
    void refreshPortfolio();
    const id = window.setInterval(() => void refreshPortfolio(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [profileId, refreshPortfolio]);

  useEffect(() => {
    if (portfolio?.activityError)
      toast.error(portfolio.activityError, { id: "portfolio-activity-error" });
  }, [portfolio?.activityError]);

  async function handleCreateProfile() {
    if (!wallet) return;
    setProfileLoading(true);
    try {
      const id = await createProfile({
        account: wallet.address,
        chain: wallet.chain,
        walletAdapter: wallet.adapter,
      });
      setProfileId(id);
    } catch (cause) {
      const existing = await resolveProfile(wallet.address).catch(() => null);
      if (existing) setProfileId(existing);
      else toast.error(getErrorMessage(cause));
    } finally {
      setProfileLoading(false);
    }
  }

  function openReserveAction(next: "repay" | "withdraw", reserve: UserReserve) {
    setSelectedReserve(reserve);
    setTab(next);
  }

  return (
    <section className="advanced-layout" aria-labelledby="advanced-title">
      <div className="advanced-heading">
        <div>
          <p className="eyebrow">Profile lending</p>
          <h1 id="advanced-title">Manage liquidity across every supported route.</h1>
        </div>
        {wallet ? <DynamicWidget /> : null}
      </div>

      <nav className="advanced-tabs" aria-label="Advanced lending action">
        {(["supply", "borrow", "portfolio"] as const).map((item) => (
          <Button
            type="button"
            variant={
              tab === item || (item === "portfolio" && (tab === "repay" || tab === "withdraw"))
                ? "secondary"
                : "ghost"
            }
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </Button>
        ))}
      </nav>

      <HealthCard
        portfolio={portfolio}
        profileId={profileId}
        loading={Boolean(profileId && !portfolio)}
      />
      {!wallet ? (
        <ConnectState />
      ) : profileLoading ? (
        <AdvancedProfileLoading />
      ) : !profileId ? (
        <section className="profile-state">
          <div>
            <p className="eyebrow">One-time setup</p>
            <h2>Create your Liquidium profile</h2>
            <p>
              Your {wallet.chain} wallet signs one authorization message. The profile then tracks
              supplied assets, debt, and activity.
            </p>
          </div>
          <Button
            className="primary-action"
            size="lg"
            type="button"
            onClick={() => void handleCreateProfile()}
          >
            Create profile
          </Button>
        </section>
      ) : !market ? (
        tab === "portfolio" ? (
          <AdvancedPortfolioLoading />
        ) : (
          <AdvancedComposerLoading />
        )
      ) : (
        <div className="advanced-content">
          {tab === "supply" ? (
            <TransactionComposer
              mode="supply"
              profileId={profileId}
              routes={market.routes}
              wallet={wallet}
              onComplete={refreshPortfolio}
            />
          ) : null}
          {tab === "borrow" ? (
            <TransactionComposer
              mode="borrow"
              profileId={profileId}
              routes={market.routes}
              wallet={wallet}
              onComplete={refreshPortfolio}
            />
          ) : null}
          {tab === "portfolio" ? (
            <PortfolioView portfolio={portfolio} onAction={openReserveAction} />
          ) : null}
          {tab === "repay" && selectedReserve ? (
            <TransactionComposer
              mode="repay"
              profileId={profileId}
              routes={market.routes}
              wallet={wallet}
              reserve={selectedReserve}
              onBack={() => setTab("portfolio")}
              onComplete={refreshPortfolio}
            />
          ) : null}
          {tab === "withdraw" && selectedReserve ? (
            <TransactionComposer
              mode="withdraw"
              profileId={profileId}
              routes={market.routes}
              wallet={wallet}
              reserve={selectedReserve}
              onBack={() => setTab("portfolio")}
              onComplete={refreshPortfolio}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function TransactionComposer(props: {
  mode: "supply" | "borrow" | "repay" | "withdraw";
  profileId: string;
  routes: AssetRoute[];
  wallet: NonNullable<ReturnType<typeof getConnectedWallet>>;
  reserve?: UserReserve;
  onBack?: () => void;
  onComplete: () => Promise<void>;
}) {
  const reserveRoutes = props.reserve
    ? props.routes.filter((route) => route.poolId === props.reserve?.pool.id)
    : props.routes;
  const defaultRoute =
    reserveRoutes.find((route) => route.chain === props.wallet.chain) ?? reserveRoutes[0];
  const [selectedKey, setSelectedKey] = useState(defaultRoute ? routeKey(defaultRoute) : "");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [supplyFlow, setSupplyFlow] = useState<SupplyFlow | null>(null);
  const [inflowQuote, setInflowQuote] = useState<InflowQuote | null>(null);
  const [outflow, setOutflow] = useState<OutflowDetails | null>(null);
  const [txid, setTxid] = useState("");
  const [ethSupplyMechanism, setEthSupplyMechanism] =
    useState<EthSupplyMechanism>("depositAddress");
  const route = reserveRoutes.find((item) => routeKey(item) === selectedKey) ?? defaultRoute;
  const automatic = route?.chain === props.wallet.chain;
  const canChooseEthSupplyMechanism =
    route?.chain === Chain.ETH && (props.mode === "supply" || props.mode === "repay");
  const title = {
    supply: "Supply an asset",
    borrow: "Borrow against your portfolio",
    repay: "Repay debt",
    withdraw: "Withdraw supply",
  }[props.mode];
  const amountError = useMemo(() => {
    if (!route || !amount.trim()) return null;
    try {
      const parsed = parseDecimalToBaseUnits(amount, route.decimals);
      if (parsed <= 0n) return "Enter an amount greater than zero.";
      return null;
    } catch (cause) {
      return getErrorMessage(cause);
    }
  }, [amount, props.mode, route]);
  async function useMax() {
    if (!props.reserve || !route) return;
    setBusy(true);
    try {
      const value =
        props.mode === "repay"
          ? await getMaxRepay(props.profileId, route.poolId)
          : await getMaxWithdraw(props.profileId, route.poolId);
      setAmount(formatBaseUnits(value, route.decimals, Number(route.decimals)));
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!route) return;
    setBusy(true);
    setSupplyFlow(null);
    setInflowQuote(null);
    setOutflow(null);
    try {
      const parsed = parseDecimalToBaseUnits(amount, route.decimals);
      if (props.mode === "borrow") {
        setOutflow(
          await borrowWithProfile({
            profileId: props.profileId,
            route,
            amount: parsed,
            receiver: destination,
            signerWalletAddress: props.wallet.address,
            signerChain: props.wallet.chain,
            signerWalletAdapter: props.wallet.adapter,
          }),
        );
        await props.onComplete();
      } else if (props.mode === "withdraw") {
        setOutflow(
          await withdrawWithProfile({
            profileId: props.profileId,
            route,
            amount: parsed,
            receiver: destination,
            signerWalletAddress: props.wallet.address,
            signerChain: props.wallet.chain,
            signerWalletAdapter: props.wallet.adapter,
          }),
        );
        await props.onComplete();
      } else {
        const quote = await getInflowQuote(route, parsed);
        setInflowQuote(quote);
        const flow = await createSupplyFlow({
          profileId: props.profileId,
          route,
          amount: automatic ? quote.total : undefined,
          action: props.mode === "supply" ? "deposit" : "repayment",
          account: automatic ? props.wallet.address : undefined,
          walletAdapter: automatic ? props.wallet.adapter : undefined,
          ethMechanism: canChooseEthSupplyMechanism ? ethSupplyMechanism : undefined,
        });
        setSupplyFlow(flow);
        if (flow.txid) await props.onComplete();
      }
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitTxid() {
    if (!supplyFlow || !txid.trim()) return;
    setBusy(true);
    try {
      await submitManualSupply(supplyFlow, txid);
      await props.onComplete();
    } catch (cause) {
      toast.error(getErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="advanced-composer">
      {props.onBack ? (
        <Button className="back-action" variant="link" type="button" onClick={props.onBack}>
          ← Back to portfolio
        </Button>
      ) : null}
      <div className="composer-head">
        <div>
          <p className="eyebrow">{props.mode}</p>
          <h2>{title}</h2>
        </div>
        <span className="wallet-route">Signing with {props.wallet.chain}</span>
      </div>
      <form onSubmit={submit}>
        <div className="route-select">
          <span>Asset and route</span>
          <Select
            items={reserveRoutes.map((item) => ({
              value: routeKey(item),
              label: `${item.displaySymbol} · ${item.chain}`,
            }))}
            value={selectedKey}
            onValueChange={(value) => {
              if (!value) return;
              setSelectedKey(value);
              setSupplyFlow(null);
              setInflowQuote(null);
            }}
          >
            <SelectTrigger aria-label="Asset and route" className="asset-route-trigger">
              {route ? (
                <span className="asset-route-value">
                  <AssetIcon asset={route.asset} chain={route.chain} />
                  <span>
                    <strong>{route.displaySymbol}</strong>
                    <small>{route.chain} route</small>
                  </span>
                </span>
              ) : (
                <span>Select an asset</span>
              )}
            </SelectTrigger>
            <SelectContent align="start">
              <SelectGroup>
                {reserveRoutes.map((item) => (
                  <SelectItem
                    aria-label={`${item.displaySymbol} on ${item.chain}`}
                    value={routeKey(item)}
                    key={routeKey(item)}
                  >
                    <AssetIcon asset={item.asset} chain={item.chain} />
                    <span className="asset-route-option">
                      <strong>{item.displaySymbol}</strong>
                      <small>{item.chain} route</small>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="advanced-amount">
          <label>
            <span>Amount</span>
            <Input
              aria-label={`${props.mode} amount`}
              aria-invalid={Boolean(amountError)}
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <strong>{route?.displaySymbol}</strong>
          {props.reserve ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => void useMax()}>
              Max
            </Button>
          ) : null}
        </div>
        {amountError ? (
          <span className="field-error" role="alert">
            {amountError}
          </span>
        ) : null}
        {canChooseEthSupplyMechanism ? (
          <fieldset className="supply-mechanism">
            <legend>Supply method</legend>
            <label>
              <input
                type="radio"
                name="eth-supply-mechanism"
                value="depositAddress"
                checked={ethSupplyMechanism === "depositAddress"}
                onChange={() => setEthSupplyMechanism("depositAddress")}
              />
              <span>
                <strong>Deposit address</strong>
                <small>Transfer tokens to a generated Liquidium address.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="eth-supply-mechanism"
                value="contractInteraction"
                checked={ethSupplyMechanism === "contractInteraction"}
                onChange={() => setEthSupplyMechanism("contractInteraction")}
              />
              <span>
                <strong>Contract interaction</strong>
                <small>Approve and deposit through the Liquidium contract.</small>
              </span>
            </label>
          </fieldset>
        ) : null}
        {props.mode === "borrow" || props.mode === "withdraw" ? (
          <label className="route-select">
            <span>Receive on {route?.chain}</span>
            <Input
              aria-label={`${props.mode} destination`}
              value={destination}
              placeholder={
                route?.chain === Chain.ICP ? "IC principal or ICRC account" : "Destination address"
              }
              onChange={(event) => setDestination(event.target.value)}
            />
          </label>
        ) : null}
        {!automatic && (props.mode === "supply" || props.mode === "repay") ? (
          <InlineNotice>
            Manual route: the SDK will produce the exact target. Send from your wallet, then enter
            the transaction reference below.
          </InlineNotice>
        ) : null}
        <Button
          className="primary-action"
          size="lg"
          type="submit"
          disabled={
            busy ||
            !amount ||
            !route ||
            Boolean(amountError) ||
            ((props.mode === "borrow" || props.mode === "withdraw") && !destination.trim())
          }
        >
          {busy
            ? "Preparing…"
            : `${props.mode[0].toUpperCase()}${props.mode.slice(1)} ${route?.displaySymbol ?? "asset"}`}
        </Button>
      </form>
      {supplyFlow && inflowQuote && route ? (
        <FlowReceipt
          flow={supplyFlow}
          quote={inflowQuote}
          route={route}
          txid={txid}
          onTxid={setTxid}
          onSubmit={() => void submitTxid()}
          busy={busy}
        />
      ) : null}
      {outflow ? (
        <InlineNotice tone="success">
          <strong>Outflow {outflow.id}</strong>
          <br />
          {formatBaseUnits(outflow.amount, route?.decimals ?? 0n)} {route?.displaySymbol} ·{" "}
          {outflow.txid ?? "Transaction assignment pending"}
        </InlineNotice>
      ) : null}
    </section>
  );
}

function FlowReceipt({
  flow,
  quote,
  route,
  txid,
  onTxid,
  onSubmit,
  busy,
}: {
  flow: SupplyFlow;
  quote: InflowQuote;
  route: AssetRoute;
  txid: string;
  onTxid: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const symbol = route.displaySymbol;
  if (flow.type === "contractInteraction") {
    return (
      <section className="flow-receipt contract-receipt">
        <div>
          <p className="eyebrow">Contract interaction</p>
          <h3>Transaction broadcast</h3>
          <p className="receipt-description">
            Your wallet submitted the {flow.status.operation} directly through the Liquidium
            contract. No deposit-address transfer is required.
          </p>
        </div>
        <dl className="transfer-breakdown">
          <div>
            <dt>Protocol amount</dt>
            <dd>
              {formatBaseUnits(quote.amount, route.decimals, Number(route.decimals))} {symbol}
            </dd>
          </div>
          <div>
            <dt>Wallet debit</dt>
            <dd>
              {formatBaseUnits(quote.total, route.decimals, Number(route.decimals))} {symbol}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{flow.status.state.replaceAll("_", " ")}</dd>
          </div>
        </dl>
        {flow.txid ? (
          <div className="transaction-reference">
            <span>Transaction hash</span>
            <code>{flow.txid}</code>
          </div>
        ) : (
          <InlineNotice>The wallet completed without returning a transaction hash.</InlineNotice>
        )}
      </section>
    );
  }
  return (
    <section className="flow-receipt">
      <div>
        <p className="eyebrow">Transfer target</p>
        <h3>
          Send exactly {formatBaseUnits(quote.total, route.decimals, Number(route.decimals))}{" "}
          {symbol}
        </h3>
      </div>
      <dl className="transfer-breakdown">
        <div>
          <dt>Protocol amount</dt>
          <dd>
            {formatBaseUnits(quote.amount, route.decimals, Number(route.decimals))} {symbol}
          </dd>
        </div>
        <div>
          <dt>Inflow fee</dt>
          <dd>
            {formatBaseUnits(quote.fee, route.decimals, Number(route.decimals))} {symbol}
          </dd>
        </div>
        <div>
          <dt>Wallet debit</dt>
          <dd>
            {formatBaseUnits(quote.total, route.decimals, Number(route.decimals))} {symbol}
          </dd>
        </div>
      </dl>
      <span className="target-label">
        {route.chain === Chain.ICP ? "ICRC account" : `${route.chain} address`}
      </span>
      <Button
        className="target-address"
        variant="secondary"
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(flow.target.address).then(() => setCopied(true))
        }
      >
        <code>{flow.target.address}</code>
        <span>{copied ? "Copied" : "Copy"}</span>
      </Button>
      {flow.target.icpAccountIdentifier ? (
        <small className="legacy-target">
          ICP account identifier: <code>{flow.target.icpAccountIdentifier}</code>
        </small>
      ) : null}
      {flow.txid ? (
        <InlineNotice tone="success">Broadcast submitted: {flow.txid}</InlineNotice>
      ) : (
        <div className="txid-entry">
          <Input
            aria-label="Transaction reference"
            placeholder={route.chain === Chain.ICP ? "ICRC block index" : "Transaction hash or ID"}
            value={txid}
            onChange={(event) => onTxid(event.target.value)}
          />
          <Button type="button" size="lg" disabled={busy || !txid.trim()} onClick={onSubmit}>
            Track transfer
          </Button>
        </div>
      )}
    </section>
  );
}

function PortfolioView({
  portfolio,
  onAction,
}: {
  portfolio: PortfolioData | null;
  onAction: (action: "repay" | "withdraw", reserve: UserReserve) => void;
}) {
  if (!portfolio) return <AdvancedPortfolioLoading />;
  const active = portfolio.reserves.filter(
    (item) => item.position.deposited > 0n || item.position.borrowed > 0n,
  );
  return (
    <section className="portfolio-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2>Your positions</h2>
        </div>
        <span>{active.length} active reserves</span>
      </div>
      {active.length === 0 ? (
        <div className="empty-state">
          <span>∿</span>
          <h3>No positions yet</h3>
          <p>Supply an asset to establish borrowing power and start your advanced portfolio.</p>
        </div>
      ) : (
        <div className="reserve-list">
          {active.map((reserve) => (
            <article className="reserve-row" key={reserve.pool.id}>
              <AssetIcon
                asset={reserve.pool.asset}
                chain={reserve.pool.chain}
                className="asset-orb"
              />
              <div>
                <strong>{reserve.pool.asset}</strong>
                <span>
                  Supply APY {formatScaledRate(reserve.pool.lendingRate, reserve.pool.rateDecimals)}
                </span>
              </div>
              <div>
                <span>Supplied</span>
                <strong>
                  {formatBaseUnits(reserve.position.deposited, reserve.position.depositedDecimals)}{" "}
                  {reserve.pool.asset}
                </strong>
              </div>
              <div>
                <span>Borrowed</span>
                <strong>
                  {formatBaseUnits(reserve.position.borrowed, reserve.position.borrowedDecimals)}{" "}
                  {reserve.pool.asset}
                </strong>
              </div>
              <div className="row-actions">
                {reserve.position.borrowed > 0n ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAction("repay", reserve)}
                  >
                    Repay
                  </Button>
                ) : null}
                {reserve.position.deposited > 0n ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onAction("withdraw", reserve)}
                  >
                    Withdraw
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      <ActivityList activities={portfolio.activities} />
    </section>
  );
}

function ActivityList({ activities }: { activities: Activity[] }) {
  const recent = [...activities].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 5);
  return (
    <section className="activity-list" aria-label="Recent activity">
      <div className="section-title">
        <div>
          <p className="eyebrow">Activity</p>
          <h3>Recent operations</h3>
        </div>
        <span>{activities.length} total</span>
      </div>
      {recent.length === 0 ? (
        <p className="activity-empty">Submitted operations will appear here as they advance.</p>
      ) : (
        recent.map((activity) => {
          const transactionLinks = (activity.txids ?? []).flatMap((transactionId) => {
            const explorer = getTransactionExplorerLink(activity.chain, transactionId);
            return explorer ? [{ ...explorer, transactionId }] : [];
          });

          return (
            <article className="activity-row" key={activity.id}>
              <div>
                <strong>{activity.status.operation}</strong>
                <span>
                  {activity.asset ?? "Asset"} · {activity.chain ?? "—"}
                </span>
              </div>
              <div className="activity-status">
                <strong>{activity.status.state.replaceAll("_", " ")}</strong>
                <span>{formatActivityStatusDetail(activity.status)}</span>
                {transactionLinks.length > 0 ? (
                  <div className="activity-transactions" aria-label="Transactions">
                    {transactionLinks.map(({ href, label, transactionId }, index) => (
                      <a
                        className="activity-transaction-link"
                        href={href}
                        key={`${transactionId}-${index}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={transactionId}
                        aria-label={`View transaction ${transactionId} on ${label}`}
                      >
                        <span>
                          {label} · {formatTransactionId(transactionId)}
                        </span>
                        <ExternalLink aria-hidden="true" size={14} strokeWidth={2} />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}

function HealthCard({
  portfolio,
  profileId,
  loading,
}: {
  portfolio: PortfolioData | null;
  profileId: string | null;
  loading: boolean;
}) {
  const summary = portfolio?.summary;
  const threshold = Number(summary?.weightedLiquidationThresholdBps ?? 0n);
  const riskUsed =
    threshold > 0 ? Math.min(100, (Number(summary?.currentLtvBps ?? 0n) / threshold) * 100) : 0;
  const safety = 100 - riskUsed;
  const healthFactor = summary ? formatHealthFactor(summary) : "—";
  return (
    <section className="health-card">
      <div className="health-title">
        <span>Portfolio health factor</span>
        <strong>{loading ? "Syncing…" : profileId ? healthFactor : "—"}</strong>
      </div>
      <div className="health-track">
        <span style={{ width: `${profileId ? safety : 0}%` }} />
      </div>
      <div className="health-metrics">
        <div>
          <span>Supplied</span>
          <strong>
            {summary ? formatUsd(summary.totalCollateralUsd, summary.usdDecimals) : "$0.00"}
          </strong>
        </div>
        <div>
          <span>Borrowed</span>
          <strong>
            {summary ? formatUsd(summary.totalDebtUsd, summary.usdDecimals) : "$0.00"}
          </strong>
        </div>
        <div>
          <span>Available</span>
          <strong>
            {summary ? formatUsd(summary.availableBorrowsUsd, summary.usdDecimals) : "$0.00"}
          </strong>
        </div>
        <div>
          <span>Current LTV</span>
          <strong>{summary ? formatBps(summary.currentLtvBps) : "0.00%"}</strong>
        </div>
      </div>
    </section>
  );
}

function ConnectState() {
  return (
    <section className="profile-state">
      <div>
        <p className="eyebrow">Connect a wallet</p>
        <h2>Advanced lending starts with a profile owner.</h2>
        <p>
          Use an Ethereum or Bitcoin wallet through Dynamic. ICP transfers remain manual and never
          require an ICP wallet connection here.
        </p>
      </div>
      <DynamicWidget />
    </section>
  );
}
