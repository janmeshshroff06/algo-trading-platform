import React from "react";
import { Link } from "react-router-dom";

const Home = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-8 shadow-xl">
          <h1 className="text-3xl md:text-4xl font-semibold mb-3">
            Welcome to <span className="text-emerald-400">AlgoTrade</span>
          </h1>

          <p className="text-sm md:text-base text-slate-300 mb-6 max-w-2xl">
            AlgoTrade lets you backtest trading strategies on real historical market data. Choose a stock,
            set your strategy, and instantly see how it would have performed.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/backtest"
              className="flex-1 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-400 transition"
            >
              Run a Backtest
            </Link>
            <Link
              to="/history"
              className="flex-1 inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium border border-slate-700 hover:border-slate-500 transition"
            >
              View History
            </Link>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold">How to Use AlgoTrade</h2>

          <p className="text-sm text-slate-300 max-w-3xl">
            Follow these simple steps to test your trading ideas without risking real money.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold mb-1">1. Choose a Stock</h3>
              <p className="text-xs text-slate-300">
                Go to <span className="font-medium">Run a Backtest</span> and enter a ticker (e.g., AAPL, TSLA, AMZN).
                Select the time period (3 months, 1 year, etc.) and interval (1d, 1h, etc.). The app automatically
                pulls historical price data.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold mb-1">2. Set Your Strategy</h3>
              <p className="text-xs text-slate-300">
                Choose a strategy (SMA, EMA, RSI, MACD, Buy & Hold). Enter parameters like short/long windows, starting
                capital, and optional trading fee.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold mb-1">3. Run the Backtest</h3>
              <p className="text-xs text-slate-300">
                Click <span className="font-medium">Backtest</span>. AlgoTrade simulates buy/sell signals, calculates
                trades, and tracks your portfolio over time. You&apos;ll see metrics like total return, number of trades,
                and equity curve.
              </p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <h3 className="text-sm font-semibold mb-1">4. Review Your History</h3>
              <p className="text-xs text-slate-300">
                Every run is saved automatically. On the <span className="font-medium">History</span> page, you can
                review past backtests, compare strategies, and re-run variations with different settings.
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-400 max-w-3xl mt-2">
            AlgoTrade is meant to help you learn, experiment, and build confidence in your trading ideas before using
            real money.
          </p>
        </section>
      </div>
    </div>
  );
};

export default Home;
