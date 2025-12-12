import React from "react";
import { NavLink } from "react-router-dom";

const linkClasses = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-semibold transition ${
    isActive
      ? "bg-slate-800 text-slate-100"
      : "text-slate-300 hover:text-slate-100 hover:bg-slate-800/80"
  }`;

export default function NavBar() {
  return (
    <nav className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300 font-bold">
            AT
          </div>
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">Algo Trading</p>
            <p className="text-base font-semibold text-slate-100">Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NavLink to="/" className={linkClasses} end>
            Home
          </NavLink>
          <NavLink to="/backtest" className={linkClasses}>
            Backtest
          </NavLink>
          <NavLink to="/history" className={linkClasses}>
            History
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
