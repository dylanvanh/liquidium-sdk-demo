import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

const HEALTH_METRICS = ["Supplied", "Borrowed", "Available", "Current LTV"];

export function AdvancedLoading() {
  return (
    <section
      className="advanced-layout advanced-loading"
      aria-labelledby="advanced-loading-title"
      aria-busy="true"
    >
      <header className="advanced-heading">
        <div>
          <p className="eyebrow">Profile lending</p>
          <h1 id="advanced-loading-title">Manage liquidity across every supported route.</h1>
        </div>
        <LoadingBadge>Preparing wallets</LoadingBadge>
      </header>

      <div className="advanced-tabs advanced-loading-tabs" aria-hidden="true">
        <span>supply</span>
        <span>borrow</span>
        <span>portfolio</span>
      </div>

      <AdvancedHealthLoading />
      <AdvancedComposerLoading />
    </section>
  );
}

export function AdvancedProfileLoading() {
  return (
    <section className="profile-state advanced-profile-loading" aria-busy="true">
      <div>
        <p className="eyebrow">Profile sync</p>
        <h2>Finding your Liquidium profile</h2>
        <p>Checking the connected wallet for an existing profile and position state.</p>
      </div>
      <LoadingBadge>Checking wallet</LoadingBadge>
    </section>
  );
}

export function AdvancedComposerLoading() {
  return (
    <section className="advanced-composer advanced-composer-loading" aria-busy="true">
      <div className="section-title">
        <div>
          <p className="eyebrow">Supply</p>
          <h2>Supply an asset</h2>
        </div>
        <span>Loading routes</span>
      </div>
      <div className="advanced-loading-amount" aria-hidden="true">
        <span>Amount</span>
        <i className="loading-placeholder" />
        <i className="loading-placeholder compact" />
      </div>
      <div className="advanced-loading-field" aria-hidden="true">
        <span>Transfer destination</span>
        <i className="loading-placeholder" />
      </div>
      <div className="advanced-loading-action" aria-hidden="true" />
    </section>
  );
}

export function AdvancedPortfolioLoading() {
  return (
    <section className="portfolio-view advanced-portfolio-loading" aria-busy="true">
      <div className="section-title">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h2>Your positions</h2>
        </div>
        <span>Syncing reserves</span>
      </div>
      <div className="reserve-list" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="advanced-loading-reserve" key={index}>
            <i className="loading-placeholder orb" />
            <span>
              <i className="loading-placeholder medium" />
              <i className="loading-placeholder short" />
            </span>
            <span>
              <small>Supplied</small>
              <i className="loading-placeholder medium" />
            </span>
            <span>
              <small>Borrowed</small>
              <i className="loading-placeholder medium" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AdvancedHealthLoading() {
  return (
    <section className="health-card advanced-health-loading">
      <div className="health-title">
        <span>Portfolio health factor</span>
        <strong>Syncing</strong>
      </div>
      <div className="health-track" />
      <div className="health-metrics">
        {HEALTH_METRICS.map((label) => (
          <div key={label}>
            <span>{label}</span>
            <i className="loading-placeholder medium" aria-hidden="true" />
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingBadge({ children }: { children: ReactNode }) {
  return (
    <span className="loading-status-badge" role="status">
      <RefreshCw aria-hidden="true" className="is-spinning" size={14} />
      {children}
    </span>
  );
}
