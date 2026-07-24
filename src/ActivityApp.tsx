import type { ProtocolActivityEntry } from "@liquidium/client";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AssetIcon } from "@/components/asset-icon";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  fetchProtocolActivity,
  formatProtocolActivityAmount,
  formatRelativeTime,
  getActivityExplorerChain,
  getPoolByActivity,
  getProtocolActivityOperationMeta,
  PROTOCOL_ACTIVITY_FILTERS,
  PROTOCOL_ACTIVITY_POLL_INTERVAL_MS,
  type ProtocolActivityFilter,
} from "./activity";
import { fetchMarketData, getErrorMessage, type MarketData } from "./liquidium";
import { formatTransactionId, getTransactionExplorerLink } from "./transaction-explorer";

export default function ActivityApp() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [entries, setEntries] = useState<ProtocolActivityEntry[] | null>(null);
  const [filter, setFilter] = useState<ProtocolActivityFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMarketData()
      .then((data) => {
        if (!cancelled) setMarket(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProtocolActivity(filter)
      .then((items) => {
        if (cancelled) return;
        setEntries(items);
        setError(null);
        setUpdatedAt(new Date());
      })
      .catch((cause) => {
        if (cancelled) return;
        const message = getErrorMessage(cause);
        setError(message);
        toast.error(message, { id: "protocol-activity-error" });
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter, requestVersion]);

  useEffect(() => {
    const id = window.setInterval(
      () => setRequestVersion((value) => value + 1),
      PROTOCOL_ACTIVITY_POLL_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, []);

  const pools = market?.pools ?? [];
  const showInitialLoading = loading && entries === null;

  return (
    <section className="protocol-activity-view" aria-labelledby="activity-title">
      <header className="insights-heading">
        <div>
          <p className="eyebrow">Protocol activity</p>
          <h1 id="activity-title">Recent protocol lending events.</h1>
          <p>
            Live supply, borrow, repay, withdraw, and liquidation events across all Liquidium
            markets, straight from the SDK history module.
          </p>
        </div>
        <div className="insights-refresh">
          <NativeSelect
            aria-label="Filter activity"
            value={filter}
            onChange={(event) => setFilter(event.target.value as ProtocolActivityFilter)}
          >
            {PROTOCOL_ACTIVITY_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
          <Button
            variant="outline"
            type="button"
            disabled={loading}
            onClick={() => setRequestVersion((value) => value + 1)}
          >
            <RefreshCw aria-hidden="true" className={loading ? "is-spinning" : undefined} />
            {loading ? "Refreshing" : "Refresh"}
          </Button>
        </div>
      </header>

      {showInitialLoading ? (
        <ActivityListLoading />
      ) : error && entries === null ? (
        <div className="insights-empty">
          <span>∿</span>
          <h2>Activity could not be loaded</h2>
          <p>{error}</p>
          <Button type="button" onClick={() => setRequestVersion((value) => value + 1)}>
            Try again
          </Button>
        </div>
      ) : entries && entries.length > 0 ? (
        <div className="protocol-activity-panel">
          <div className="insight-panel-heading">
            <div>
              <p className="eyebrow">Live feed</p>
              <h2>Latest events</h2>
            </div>
            <span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : null}</span>
          </div>
          <div className="protocol-activity-list">
            {entries.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} pools={pools} />
            ))}
          </div>
        </div>
      ) : (
        <div className="insights-empty">
          <span>∿</span>
          <h2>No activity yet</h2>
          <p>Supply, borrow, repay, withdraw, and liquidation events will appear here.</p>
        </div>
      )}
    </section>
  );
}

function ActivityRow({
  entry,
  pools,
}: {
  entry: ProtocolActivityEntry;
  pools: MarketData["pools"];
}) {
  const meta = getProtocolActivityOperationMeta(entry.operation);
  const pool = getPoolByActivity(pools, entry);
  const chain = getActivityExplorerChain(pools, entry);
  const txid = entry.txids?.[0];
  const link = txid ? getTransactionExplorerLink(chain, txid) : null;

  return (
    <article className="protocol-activity-row">
      <span className={`protocol-activity-orb ${meta.tone}`} aria-hidden="true">
        {meta.direction === "in" ? <ArrowDownLeft /> : null}
        {meta.direction === "out" ? <ArrowUpRight /> : null}
        {meta.direction === "alert" ? <ShieldAlert /> : null}
      </span>
      <div className="protocol-activity-body">
        <p>
          {meta.label} {formatProtocolActivityAmount(entry.amount, entry.decimals)} {entry.asset}
        </p>
        <div className="protocol-activity-meta">
          <span>{formatRelativeTime(entry.timestamp)}</span>
          {link && txid ? (
            <>
              <span aria-hidden="true">·</span>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {formatTransactionId(txid)}
                <ExternalLink aria-hidden="true" />
              </a>
            </>
          ) : null}
        </div>
      </div>
      {pool ? <AssetIcon asset={pool.asset} chain={pool.chain} /> : null}
    </article>
  );
}

function ActivityListLoading() {
  return (
    <div className="protocol-activity-list" role="status" aria-label="Loading activity">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="protocol-activity-row" key={`activity-loading-${index}`}>
          <i className="loading-placeholder orb" aria-hidden="true" />
          <div className="protocol-activity-body">
            <i className="loading-placeholder medium" aria-hidden="true" />
            <i className="loading-placeholder short" aria-hidden="true" />
          </div>
        </div>
      ))}
    </div>
  );
}
