import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PricePoint = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type PricesResponse = {
  symbol: string;
  interval: string;
  period: string;
  data: PricePoint[];
};

type EquityPoint = {
  timestamp: string;
  equity: number;
};

type Trade = {
  timestamp: string;
  side: "BUY" | "SELL";
  price: number;
  shares: number;
};

type BacktestMetrics = {
  sharpe: number;
  max_drawdown: number;
  win_rate: number;
};

type BacktestResponse = {
  symbol: string;
  short_window: number;
  long_window: number;
  equity_curve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
};

const BACKEND_BASE_URL = "http://127.0.0.1:8000/api/v1";

function App() {
  const [symbol, setSymbol] = useState("AAPL");
  const [data, setData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"OK" | "DOWN" | "">("");
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBackendStatus = async () => {
      try {
        const response = await fetch(`${BACKEND_BASE_URL}/health`);
        if (!response.ok) {
          throw new Error("health check failed");
        }
        const body = await response.json();
        setBackendStatus(body.status === "ok" ? "OK" : "DOWN");
      } catch {
        setBackendStatus("DOWN");
      }
    };
    fetchBackendStatus();
  }, []);

  const fetchPrices = async (ticker: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/prices/${encodeURIComponent(
          ticker
        )}?period=1mo&interval=1d`
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with ${response.status}`);
      }

      const body = (await response.json()) as PricesResponse;
      setData(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prices");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices(symbol);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    setSymbol(trimmed);
    fetchPrices(trimmed);
  };

  const lastClose =
    data.length > 0 ? data[data.length - 1].close.toFixed(2) : null;

  const runBacktest = async () => {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    setSymbol(trimmed);
    setBacktestLoading(true);
    setBacktestError(null);

    try {
      const params = new URLSearchParams({
        symbol: trimmed,
        short_window: "10",
        long_window: "20",
        period: "3mo",
        interval: "1d",
        initial_capital: "10000",
      });

      const response = await fetch(`${BACKEND_BASE_URL}/backtest/sma?${params.toString()}`);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with ${response.status}`);
      }

      const body = (await response.json()) as BacktestResponse;
      setBacktestResult(body);
    } catch (err) {
      setBacktestError(err instanceof Error ? err.message : "Failed to run backtest");
      setBacktestResult(null);
    } finally {
      setBacktestLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.2em] text-slate-500 uppercase">
            Paper Trading • MVP
          </p>
          <h1 className="text-2xl font-bold mt-1">Algo Trading Platform</h1>
        </div>

        <div className="flex items-center gap-4">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              backendStatus === "OK"
                ? "border-emerald-500 text-emerald-300"
                : backendStatus === "DOWN"
                ? "border-rose-500 text-rose-300"
                : "border-slate-600 text-slate-400"
            }`}
          >
            BACKEND STATUS{" "}
            <span className="ml-1">
              {backendStatus === "" ? "..." : backendStatus}
            </span>
          </span>
        </div>
      </header>

      <main className="flex-1 p-6 grid gap-6 md:grid-cols-3">
        <section className="md:col-span-2 border border-slate-800 rounded-2xl p-5 bg-slate-950/60">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Demo Equity Curve</h2>
              <p className="text-xs text-slate-400 mt-1">
                Symbol: {symbol.toUpperCase()}
                {lastClose && <> • Last close: ${lastClose}</>}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 text-sm"
            >
              <input
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="Ticker e.g. AAPL"
              />
              <div className="button-group">
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-slate-950 transition"
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load"}
                </button>
                <button
                  type="button"
                  onClick={runBacktest}
                  className="px-3 py-1 rounded-lg border border-sky-400 text-xs font-semibold text-sky-300 hover:bg-sky-500/10 transition"
                  disabled={backtestLoading}
                >
                  {backtestLoading ? "Backtesting..." : "Run Backtest"}
                </button>
              </div>
            </form>
          </div>

          {error && (
            <div className="text-xs text-rose-400 mb-3">Error: {error}</div>
          )}

          <div className="chart-container">
            {data.length === 0 && !loading ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No data yet. Try loading a symbol.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1f2937"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => value.slice(5, 10)}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#020617",
                      border: "1px solid #1f2937",
                      borderRadius: "0.75rem",
                      fontSize: "0.75rem",
                    }}
                    labelFormatter={(label) => `Date: ${label.slice(0, 10)}`}
                    formatter={(value: any) => [`$${value.toFixed(2)}`, "Close"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="close"
                    stroke="#38bdf8"
                    fillOpacity={1}
                    fill="url(#colorClose)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="border border-slate-800 rounded-2xl p-5 bg-slate-950/60">
          <h2 className="text-lg font-semibold mb-2">Current Positions</h2>
          <p className="text-sm text-slate-400">
            No positions yet. Run a backtest or start a strategy.
          </p>
        </section>

        <section className="border border-slate-800 rounded-2xl p-5 bg-slate-950/60 md:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">
                Strategy Backtest: SMA10 / SMA20
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Uses Yahoo Finance data (period: 3mo, interval: 1d)
              </p>
            </div>
          </div>

          {backtestError && (
            <div className="text-xs text-rose-400 mb-3">Error: {backtestError}</div>
          )}

          {!backtestResult && !backtestLoading && (
            <p className="text-sm text-slate-400">
              Run the backtest to view equity curve, metrics, and trade history.
            </p>
          )}

          {backtestResult && (
            <div className="backtest-grid">
              <div className="metrics-grid">
                <div className="metric-card">
                  <p className="metric-label">Sharpe Ratio</p>
                  <p className="metric-value">
                    {backtestResult.metrics.sharpe.toFixed(2)}
                  </p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Max Drawdown</p>
                  <p className="metric-value">
                    {(backtestResult.metrics.max_drawdown * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Win Rate</p>
                  <p className="metric-value">
                    {(backtestResult.metrics.win_rate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="equity-panel">
                <h3 className="panel-subtitle">Equity Curve</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={backtestResult.equity_curve}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34d399" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value) => value.slice(5, 10)}
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                      />
                      <YAxis
                        tickFormatter={(value) => `$${value.toFixed(0)}`}
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        width={70}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#020617",
                          border: "1px solid #1f2937",
                          borderRadius: "0.75rem",
                          fontSize: "0.75rem",
                        }}
                        labelFormatter={(label) => `Date: ${label.slice(0, 10)}`}
                        formatter={(value: any) => [`$${value.toFixed(2)}`, "Equity"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        stroke="#34d399"
                        fillOpacity={1}
                        fill="url(#colorEquity)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <h3 className="panel-subtitle">Trade History</h3>
                {backtestResult.trades.length === 0 ? (
                  <p className="text-sm text-slate-400">No completed trades yet.</p>
                ) : (
                  <div className="table-wrapper">
                    <table className="trades-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Side</th>
                          <th>Price</th>
                          <th>Shares</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.trades.map((trade) => (
                          <tr key={`${trade.timestamp}-${trade.side}`}>
                            <td>{trade.timestamp.slice(0, 10)}</td>
                            <td className={trade.side === "BUY" ? "trade-buy" : "trade-sell"}>
                              {trade.side}
                            </td>
                            <td>${trade.price.toFixed(2)}</td>
                            <td>{trade.shares}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
