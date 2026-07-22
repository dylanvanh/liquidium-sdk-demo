import { RefreshCw } from "lucide-react";

const METRIC_LABELS = ["Total supplied", "Total borrowed", "Total available"];

export function InsightsLoading() {
  return (
    <section
      className="insights-view insights-loading"
      aria-labelledby="insights-loading-title"
      aria-busy="true"
    >
      <header className="insights-heading">
        <div>
          <p className="eyebrow">Protocol pulse</p>
          <h1 id="insights-loading-title">Markets at a glance.</h1>
          <p>
            Live pool liquidity, borrowing, and rates from the Liquidium SDK. No historical values
            are inferred.
          </p>
        </div>
        <div className="insights-refresh insights-loading-status" role="status">
          <span>Connecting to the SDK</span>
          <span className="insights-loading-badge">
            <RefreshCw aria-hidden="true" className="is-spinning" size={14} />
            Fetching mainnet
          </span>
        </div>
      </header>

      <div className="insight-metrics" aria-label="Loading protocol totals">
        {METRIC_LABELS.map((label) => (
          <article key={label}>
            <span className="insights-loading-value" aria-hidden="true" />
            <span>{label}</span>
            <small>Fetching live total</small>
          </article>
        ))}
      </div>

      <div className="insight-charts">
        <article className="insight-panel capital-panel">
          <div className="insight-panel-heading">
            <div>
              <p className="eyebrow">Capital by market</p>
              <h2>Supplied vs borrowed</h2>
            </div>
            <span>Loading snapshot</span>
          </div>
          <div className="capital-chart insights-loading-chart" aria-hidden="true">
            <div className="insights-loading-grid">
              {Array.from({ length: 5 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
            <div className="insights-loading-bars">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index}>
                  <span />
                  <span />
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="insight-panel share-panel">
          <div className="insight-panel-heading">
            <div>
              <p className="eyebrow">Market composition</p>
              <h2>Share of deposits</h2>
            </div>
          </div>
          <div className="share-chart insights-loading-share" aria-hidden="true">
            <div className="insights-loading-donut">
              <span />
              <small>Loading mix</small>
            </div>
            <div className="insights-loading-legend">
              <span />
              <span />
              <span />
            </div>
          </div>
        </article>
      </div>

      <section className="market-table-section" aria-labelledby="loading-markets-title">
        <div className="insight-panel-heading">
          <div>
            <p className="eyebrow">All assets</p>
            <h2 id="loading-markets-title">Market details</h2>
          </div>
          <span>Loading pools</span>
        </div>
        <div className="insights-loading-table" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <span />
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
