import React, { useEffect, useMemo, useState } from "react";

type HealthResponse = { status: string };
type PricesResponse = { symbol: string; prices: number[] };

const HEALTH_ENDPOINT = "http://127.0.0.1:8000/api/v1/health";
const PRICES_ENDPOINT = "http://127.0.0.1:8000/api/v1/demo/prices";

function App() {
  const [health, setHealth] = useState<string>("checking…");
  const [priceData, setPriceData] = useState<PricesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(HEALTH_ENDPOINT)
      .then((res) => res.json())
      .then((data: HealthResponse) => setHealth(data.status))
      .catch(() => setHealth("offline"));

    fetch(PRICES_ENDPOINT)
      .then((res) => res.json())
      .then((data: PricesResponse) => setPriceData(data))
      .catch((err) => setError("Unable to load demo prices"));
  }, []);

  const normalizedPrices = useMemo(() => {
    if (!priceData) {
      return [];
    }
    const prices = priceData.prices;
    const max = Math.max(...prices);
    const min = Math.min(...prices);
    const range = max - min || 1;
    return prices.map((price) => ({
      price,
      percent: ((price - min) / range) * 100,
    }));
  }, [priceData]);

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <p className="eyebrow">Paper Trading • MVP</p>
          <h1>Algo Trading Platform</h1>
        </div>

        <div className="status-pill">
          <span className="pill-label">Backend Status</span>
          <span className={`pill-value pill-value--${health}`}>
            {health || "unknown"}
          </span>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel panel--wide">
          <h2>Demo Equity Curve</h2>
          {!priceData && !error && (
            <p className="muted">Fetching demo price data…</p>
          )}
          {error && <p className="error">{error}</p>}
          {priceData && (
            <>
              <div className="panel-subtitle">
                Symbol: <strong>{priceData.symbol}</strong>
              </div>
              <div className="price-chart" role="img">
                {normalizedPrices.map(({ price, percent }, idx) => (
                  <div
                    className="price-bar"
                    key={`${price}-${idx}`}
                    style={{ height: `${percent || 5}%` }}
                    title={`$${price.toFixed(2)}`}
                  />
                ))}
              </div>
              <div className="price-list">
                {priceData.prices.map((price, idx) => (
                  <span key={idx}>${price.toFixed(2)}</span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Current Positions</h2>
          <p className="muted">
            No positions yet. Run a backtest or start a strategy.
          </p>
        </section>

        <section className="panel panel--full">
          <h2>Recent Trades</h2>
          <p className="muted">
            Trades will appear here once strategies start running.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
