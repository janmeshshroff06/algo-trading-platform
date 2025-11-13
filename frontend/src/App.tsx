import React from "react";

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Algo Trading Platform</h1>
        <span className="text-sm text-slate-400">Paper Trading • MVP</span>
      </header>

      <main className="flex-1 p-6 grid gap-6 md:grid-cols-3">
        <section className="md:col-span-2 border border-slate-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-2">Equity Curve</h2>
          <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
            Chart placeholder
          </div>
        </section>

        <section className="border border-slate-800 rounded-xl p-4">
          <h2 className="text-lg font-semibold mb-2">Current Positions</h2>
          <div className="text-sm text-slate-400">
            No positions yet. Run a backtest or start a strategy.
          </div>
        </section>

        <section className="border border-slate-800 rounded-xl p-4 md:col-span-3">
          <h2 className="text-lg font-semibold mb-2">Recent Trades</h2>
          <div className="text-sm text-slate-400">
            Trades will appear here once strategies start running.
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
