import React, { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CandlestickChart, { Candle } from "./components/CandlestickChart";
import NavBar from "./components/NavBar";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

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
  equity_after_trade?: number;
};

type BacktestMetrics = {
  sharpe: number;
  max_drawdown: number;
  win_rate: number;
  total_return?: number;
  num_trades?: number;
};

type BacktestResponse = {
  symbol: string;
  short_window: number;
  long_window: number;
  period?: string;
  interval?: string;
  initial_capital?: number;
  fee_rate?: number;
  strategy_type?: string;
  strategy_params?: Record<string, any>;
  ohlc?: Candle[];
  equity_curve: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
  id?: number;
  created_at?: string;
};

type HistoryItem = {
  id: number;
  created_at: string;
  symbol: string;
  strategy_type?: string;
  strategy_params?: Record<string, any>;
  short_window: number;
  long_window: number;
  period: string;
  interval: string;
  initial_capital: number;
  fee_rate: number;
  metrics: BacktestMetrics;
};

type BacktestConfig = {
  symbol: string;
  strategyType: string;
  shortWindow: number;
  longWindow: number;
  period: string;
  initialCapital: number;
  feeRate: number;
  strategyParams?: Record<string, any>;
};

type StrategyProfile = {
  id: number;
  name: string;
  created_at: string;
  symbol?: string | null;
  strategy_type?: string;
  strategy_params?: Record<string, any>;
  short_window: number;
  long_window: number;
  period: string;
  interval: string;
  initial_capital: number;
  fee_rate: number;
};

type LinePoint = { time: number; value: number };
type EquityCurvePoint = { timestamp: string; equity: number };

const BACKEND_BASE_URL = "http://127.0.0.1:8000/api/v1";

function BacktestPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [prices, setPrices] = useState<PricePoint[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"OK" | "DOWN" | "">("");

  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  const [strategyType, setStrategyType] = useState("sma");
  const [shortWindow, setShortWindow] = useState(10);
  const [longWindow, setLongWindow] = useState(20);
  const [period, setPeriod] = useState("3mo");
  const [initialCapital, setInitialCapital] = useState(10_000);
  const [feeRate, setFeeRate] = useState(0.0005);
  const [emaFast, setEmaFast] = useState(10);
  const [emaSlow, setEmaSlow] = useState(20);
  const [rsiWindow, setRsiWindow] = useState(14);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [rsiOversold, setRsiOversold] = useState(30);
  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedBacktestId, setSelectedBacktestId] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<StrategyProfile[]>([]);
  const [newProfileName, setNewProfileName] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  const [showShortLine, setShowShortLine] = useState(true);
  const [showLongLine, setShowLongLine] = useState(true);
  const [showTradeMarkers, setShowTradeMarkers] = useState(true);

  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeedMs, setReplaySpeedMs] = useState(150);
  const replayTimerRef = useRef<number | null>(null);

  const toUnixSeconds = (timestamp: string) => Math.floor(new Date(timestamp).getTime() / 1000);

  const buildSMA = (candles: Candle[], window: number): LinePoint[] => {
    if (!candles.length || window <= 0) return [];
    const points: LinePoint[] = [];
    let rollingSum = 0;

    for (let i = 0; i < candles.length; i += 1) {
      rollingSum += candles[i].close;
      if (i >= window) {
        rollingSum -= candles[i - window].close;
      }
      if (i >= window - 1) {
        points.push({ time: candles[i].time, value: rollingSum / window });
      }
    }
    return points;
  };

  const buildEMA = (candles: Candle[], window: number): LinePoint[] => {
    if (!candles.length || window <= 0) return [];
    const k = 2 / (window + 1);
    let ema: number | null = null;
    const points: LinePoint[] = [];

    candles.forEach((candle) => {
      ema = ema === null ? candle.close : candle.close * k + ema * (1 - k);
      points.push({ time: candle.time, value: ema });
    });

    return points;
  };

  const fetchHistory = async (sym?: string) => {
    try {
      const params = new URLSearchParams({
        limit: "20",
      });
      if (sym) {
        params.set("symbol", sym.toUpperCase());
      }
      const response = await fetch(`${BACKEND_BASE_URL}/backtests?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`History fetch failed (${response.status})`);
      }
      const body = (await response.json()) as HistoryItem[];
      setHistory(body);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProfiles = async () => {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/strategies`);
      if (!response.ok) throw new Error(`Profiles fetch failed (${response.status})`);
      const body = (await response.json()) as StrategyProfile[];
      setProfiles(body);
    } catch (err) {
      console.error(err);
    }
  };

  const saveProfile = async () => {
    if (!newProfileName.trim()) return;
    const payload = {
      name: newProfileName.trim(),
      symbol,
      strategy_type: strategyType,
      strategy_params: {
        ema_fast: emaFast,
        ema_slow: emaSlow,
        rsi_window: rsiWindow,
        rsi_overbought: rsiOverbought,
        rsi_oversold: rsiOversold,
        macd_fast: macdFast,
        macd_slow: macdSlow,
        macd_signal: macdSignal,
      },
      short_window: shortWindow,
      long_window: longWindow,
      period,
      interval: "1d",
      initial_capital: initialCapital,
      fee_rate: feeRate,
    };
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/strategies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      setNewProfileName("");
      fetchProfiles();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const fetchBackendStatus = async () => {
      try {
        const response = await fetch(`${BACKEND_BASE_URL}/health`);
        if (!response.ok) throw new Error("health check failed");
        const body = await response.json();
        setBackendStatus(body.status === "ok" ? "OK" : "DOWN");
      } catch {
        setBackendStatus("DOWN");
      }
    };

    fetchBackendStatus();
    fetchPrices(symbol);
    fetchHistory(symbol);
    fetchProfiles();
  }, []);

  const fetchPrices = async (ticker: string) => {
    setLoadingPrices(true);
    setPriceError(null);

    try {
      const response = await fetch(
        `${BACKEND_BASE_URL}/prices/${encodeURIComponent(ticker)}?period=1mo&interval=1d`
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with ${response.status}`);
      }

      const body = (await response.json()) as PricesResponse;
      setPrices(body.data);
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : "Failed to load prices");
      setPrices([]);
    } finally {
      setLoadingPrices(false);
    }
  };

  const handleSymbolSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) {
      return;
    }
    setSymbol(trimmed);
    fetchPrices(trimmed);
  };

  const runBacktest = async (config?: BacktestConfig) => {
    const cfg: BacktestConfig =
      config ??
      {
        symbol: symbol.trim().toUpperCase(),
        strategyType,
        shortWindow: shortWindow,
        longWindow: longWindow,
        period,
        initialCapital,
        feeRate,
        strategyParams: {
          ema_fast: emaFast,
          ema_slow: emaSlow,
          rsi_window: rsiWindow,
          rsi_overbought: rsiOverbought,
          rsi_oversold: rsiOversold,
          macd_fast: macdFast,
          macd_slow: macdSlow,
          macd_signal: macdSignal,
        },
      };

    if (!cfg.symbol) return;

    setSymbol(cfg.symbol);
    setBacktestLoading(true);
    setBacktestError(null);

    try {
      const params = new URLSearchParams({
        symbol: cfg.symbol,
        strategy_type: cfg.strategyType ?? "sma",
        short_window: String(cfg.shortWindow),
        long_window: String(cfg.longWindow),
        period: cfg.period,
        interval: "1d",
        initial_capital: String(cfg.initialCapital),
        fee_rate: String(cfg.feeRate),
      });
      const sp = cfg.strategyParams ?? {};
      if (sp.ema_fast) params.set("ema_fast", String(sp.ema_fast));
      if (sp.ema_slow) params.set("ema_slow", String(sp.ema_slow));
      if (sp.rsi_window) params.set("rsi_window", String(sp.rsi_window));
      if (sp.rsi_overbought) params.set("rsi_overbought", String(sp.rsi_overbought));
      if (sp.rsi_oversold) params.set("rsi_oversold", String(sp.rsi_oversold));
      if (sp.macd_fast) params.set("macd_fast", String(sp.macd_fast));
      if (sp.macd_slow) params.set("macd_slow", String(sp.macd_slow));
      if (sp.macd_signal) params.set("macd_signal", String(sp.macd_signal));

      const response = await fetch(`${BACKEND_BASE_URL}/backtest/sma?${params.toString()}`);
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with ${response.status}`);
      }

      const body = (await response.json()) as BacktestResponse;
      setBacktestResult(body);

      setSelectedBacktestId(body.id ?? null);
      fetchHistory(cfg.symbol);
    } catch (err) {
      setBacktestError(err instanceof Error ? err.message : "Failed to run backtest");
      setBacktestResult(null);
      setSelectedBacktestId(null);
    } finally {
      setBacktestLoading(false);
    }
  };

  const liveCandles = useMemo<Candle[]>(() => {
    return prices.map((p) => ({
      time: toUnixSeconds(p.timestamp),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
    }));
  }, [prices]);

  const backtestCandles = useMemo<Candle[]>(() => backtestResult?.ohlc ?? [], [backtestResult]);
  const strategyParams = (backtestResult?.strategy_params as Record<string, any> | undefined) ?? {};
  const emaFastWindow = typeof strategyParams.ema_fast === "number" ? strategyParams.ema_fast : undefined;
  const emaSlowWindow = typeof strategyParams.ema_slow === "number" ? strategyParams.ema_slow : undefined;

  const smaShortLine = useMemo<LinePoint[]>(() => {
    if (!backtestResult || backtestCandles.length === 0) return [];
    return buildSMA(backtestCandles, backtestResult.short_window);
  }, [backtestCandles, backtestResult]);

  const smaLongLine = useMemo<LinePoint[]>(() => {
    if (!backtestResult || backtestCandles.length === 0) return [];
    return buildSMA(backtestCandles, backtestResult.long_window);
  }, [backtestCandles, backtestResult]);

  const emaFastLine = useMemo<LinePoint[]>(() => {
    if (!backtestResult || backtestCandles.length === 0 || !emaFastWindow) return [];
    return buildEMA(backtestCandles, emaFastWindow);
  }, [backtestCandles, backtestResult, emaFastWindow]);

  const emaSlowLine = useMemo<LinePoint[]>(() => {
    if (!backtestResult || backtestCandles.length === 0 || !emaSlowWindow) return [];
    return buildEMA(backtestCandles, emaSlowWindow);
  }, [backtestCandles, backtestResult, emaSlowWindow]);

  const tradeMarkers = useMemo(() => {
    if (!backtestResult) return [];
    return backtestResult.trades.map((trade) => ({
      time: toUnixSeconds(trade.timestamp),
      side: trade.side,
      price: trade.price,
    }));
  }, [backtestResult]);

  const stopReplay = () => {
    if (replayTimerRef.current) {
      window.clearInterval(replayTimerRef.current);
      replayTimerRef.current = null;
    }
    setIsReplaying(false);
  };

  const startReplay = () => {
    if (!backtestCandles.length) return;
    stopReplay();
    setIsReplaying(true);
    setReplayIndex(1);
  };

  useEffect(() => {
    if (!isReplaying) {
      if (replayTimerRef.current) {
        window.clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
      return;
    }

    replayTimerRef.current = window.setInterval(() => {
      setReplayIndex((prev) => {
        const next = prev + 1;
        if (next >= backtestCandles.length) {
          stopReplay();
          return backtestCandles.length;
        }
        return next;
      });
    }, replaySpeedMs);

    return () => {
      if (replayTimerRef.current) {
        window.clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [isReplaying, replaySpeedMs, backtestCandles.length]);

  // If backtest result changes, stop replay and reset index
  useEffect(() => {
    stopReplay();
    setReplayIndex(backtestCandles.length);
  }, [backtestCandles]);

  const replayedCandles = useMemo(() => {
    if (!isReplaying) return backtestCandles;
    const count = Math.min(Math.max(replayIndex, 0), backtestCandles.length);
    return backtestCandles.slice(0, count);
  }, [backtestCandles, isReplaying, replayIndex]);

  const lastReplayTime = replayedCandles[replayedCandles.length - 1]?.time;

  const replayedSmaShort = useMemo(() => {
    if (!isReplaying) return smaShortLine;
    const count = Math.min(replayIndex, smaShortLine.length);
    return smaShortLine.slice(0, count);
  }, [isReplaying, replayIndex, smaShortLine]);

  const replayedSmaLong = useMemo(() => {
    if (!isReplaying) return smaLongLine;
    const count = Math.min(replayIndex, smaLongLine.length);
    return smaLongLine.slice(0, count);
  }, [isReplaying, replayIndex, smaLongLine]);

  const replayedEmaFast = useMemo(() => {
    if (!isReplaying) return emaFastLine;
    const count = Math.min(replayIndex, emaFastLine.length);
    return emaFastLine.slice(0, count);
  }, [isReplaying, replayIndex, emaFastLine]);

  const replayedEmaSlow = useMemo(() => {
    if (!isReplaying) return emaSlowLine;
    const count = Math.min(replayIndex, emaSlowLine.length);
    return emaSlowLine.slice(0, count);
  }, [isReplaying, replayIndex, emaSlowLine]);

  const replayedMarkers = useMemo(() => {
    if (!isReplaying || lastReplayTime === undefined) return tradeMarkers;
    return tradeMarkers.filter((m) => m.time <= lastReplayTime);
  }, [isReplaying, lastReplayTime, tradeMarkers]);

  const equityPoints = useMemo(() => {
    return (
      backtestResult?.equity_curve.map((pt) => ({
        time: toUnixSeconds(pt.timestamp),
        equity: pt.equity,
      })) ?? []
    );
  }, [backtestResult]);

  const equityAsOf = (time: number) => {
    if (!equityPoints.length) return 0;
    let latest = equityPoints[0].equity;
    for (const pt of equityPoints) {
      if (pt.time <= time) {
        latest = pt.equity;
      } else {
        break;
      }
    }
    return latest;
  };

  const replayedEquityCurve: EquityCurvePoint[] = useMemo(() => {
    if (!isReplaying || !backtestResult) return backtestResult?.equity_curve ?? [];
    if (!replayedCandles.length) return [];
    return replayedCandles.map((c) => ({
      timestamp: new Date(c.time * 1000).toISOString(),
      equity: equityAsOf(c.time),
    }));
  }, [isReplaying, backtestResult, replayedCandles, equityPoints]);

  const equityChartData = isReplaying ? replayedEquityCurve : backtestResult?.equity_curve ?? [];

  const toggledSmaShort = showShortLine ? replayedSmaShort : [];
  const toggledSmaLong = showLongLine ? replayedSmaLong : [];
  const toggledEmaFast = showShortLine ? replayedEmaFast : [];
  const toggledEmaSlow = showLongLine ? replayedEmaSlow : [];
  const toggledMarkers = showTradeMarkers ? replayedMarkers : [];

  const finalEquity =
    backtestResult?.equity_curve[backtestResult.equity_curve.length - 1]?.equity ?? initialCapital;

  const lastClose = prices.length > 0 ? prices[prices.length - 1].close.toFixed(2) : null;

  const loadProfile = (profile: StrategyProfile) => {
    setSelectedProfileId(profile.id);
    setSymbol(profile.symbol ?? symbol);
    setShortWindow(profile.short_window);
    setLongWindow(profile.long_window);
    setPeriod(profile.period);
    setInitialCapital(profile.initial_capital);
    setFeeRate(profile.fee_rate);
    if (profile.strategy_type) {
      setStrategyType(profile.strategy_type);
    }
    const params = profile.strategy_params || {};
    if (params.ema_fast) setEmaFast(params.ema_fast);
    if (params.ema_slow) setEmaSlow(params.ema_slow);
    if (params.rsi_window) setRsiWindow(params.rsi_window);
    if (params.rsi_overbought) setRsiOverbought(params.rsi_overbought);
    if (params.rsi_oversold) setRsiOversold(params.rsi_oversold);
    if (params.macd_fast) setMacdFast(params.macd_fast);
    if (params.macd_slow) setMacdSlow(params.macd_slow);
    if (params.macd_signal) setMacdSignal(params.macd_signal);
  };

  const deleteProfile = async (id: number) => {
    if (!confirm("Delete this profile?")) return;
    await fetch(`${BACKEND_BASE_URL}/strategies/${id}`, { method: "DELETE" });
    fetchProfiles();
  };

  const renameProfile = async (id: number, currentName: string) => {
    const newName = prompt("Enter new profile name:", currentName);
    if (!newName || !newName.trim()) return;
    const res = await fetch(`${BACKEND_BASE_URL}/strategies/${id}/rename`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) {
      alert("Rename failed (duplicate or invalid name).");
      return;
    }
    fetchProfiles();
  };

  const duplicateProfile = async (id: number) => {
    await fetch(`${BACKEND_BASE_URL}/strategies/${id}/duplicate`, { method: "POST" });
    fetchProfiles();
  };

  const moveProfile = async (id: number, direction: "up" | "down") => {
    await fetch(`${BACKEND_BASE_URL}/strategies/${id}/move`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    fetchProfiles();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.2em] text-slate-500 uppercase">Paper Trading • MVP</p>
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
            <span className="ml-1">{backendStatus === "" ? "..." : backendStatus}</span>
          </span>
        </div>
      </header>

      <main className="flex-1 p-6 grid gap-6 md:grid-cols-3">
        <section className="md:col-span-2 border border-slate-800 rounded-2xl p-5 bg-slate-950/60">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Live Prices</h2>
              <p className="text-xs text-slate-400 mt-1">
                Symbol: {symbol.toUpperCase()}
                {lastClose && <> • Last close: ${lastClose}</>}
              </p>
            </div>

            <form onSubmit={handleSymbolSubmit} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="Ticker e.g. AAPL"
              />
              <div className="input-group">
                <label className="input-label">Strategy</label>
                <select value={strategyType} onChange={(e) => setStrategyType(e.target.value)} className="input-select">
                  <option value="sma">SMA Crossover</option>
                  <option value="ema">EMA Crossover</option>
                  <option value="rsi">RSI</option>
                  <option value="macd">MACD</option>
                  <option value="buyhold">Buy & Hold</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Short SMA</label>
                <input
                  type="number"
                  min={1}
                  value={shortWindow}
                  onChange={(e) => setShortWindow(Number(e.target.value))}
                  className="input-number"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Long SMA</label>
                <input
                  type="number"
                  min={2}
                  value={longWindow}
                  onChange={(e) => setLongWindow(Number(e.target.value))}
                  className="input-number"
                />
              </div>
              {strategyType === "ema" && (
                <>
                  <div className="input-group">
                    <label className="input-label">EMA Fast</label>
                    <input
                      type="number"
                      min={1}
                      value={emaFast}
                      onChange={(e) => setEmaFast(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">EMA Slow</label>
                    <input
                      type="number"
                      min={2}
                      value={emaSlow}
                      onChange={(e) => setEmaSlow(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                </>
              )}
              {strategyType === "rsi" && (
                <>
                  <div className="input-group">
                    <label className="input-label">RSI Window</label>
                    <input
                      type="number"
                      min={1}
                      value={rsiWindow}
                      onChange={(e) => setRsiWindow(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Overbought</label>
                    <input
                      type="number"
                      min={0}
                      value={rsiOverbought}
                      onChange={(e) => setRsiOverbought(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Oversold</label>
                    <input
                      type="number"
                      min={0}
                      value={rsiOversold}
                      onChange={(e) => setRsiOversold(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                </>
              )}
              {strategyType === "macd" && (
                <>
                  <div className="input-group">
                    <label className="input-label">MACD Fast</label>
                    <input
                      type="number"
                      min={1}
                      value={macdFast}
                      onChange={(e) => setMacdFast(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">MACD Slow</label>
                    <input
                      type="number"
                      min={2}
                      value={macdSlow}
                      onChange={(e) => setMacdSlow(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Signal</label>
                    <input
                      type="number"
                      min={1}
                      value={macdSignal}
                      onChange={(e) => setMacdSignal(Number(e.target.value))}
                      className="input-number"
                    />
                  </div>
                </>
              )}
              <div className="input-group">
                <label className="input-label">Period</label>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="input-select">
                  <option value="3mo">3mo</option>
                  <option value="6mo">6mo</option>
                  <option value="1y">1y</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label">Capital</label>
                <input
                  type="number"
                  min={1000}
                  step={500}
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  className="input-number"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Fee Rate</label>
                <input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={feeRate}
                  onChange={(e) => setFeeRate(Number(e.target.value))}
                  className="input-number"
                />
              </div>
              <div className="button-group">
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-slate-950 transition"
                  disabled={loadingPrices}
                >
                  {loadingPrices ? "Loading..." : "Load"}
                </button>
                <button
                  type="button"
                  onClick={() => runBacktest()}
                  className="px-3 py-1 rounded-lg border border-sky-400 text-xs font-semibold text-sky-300 hover:bg-sky-500/10 transition"
                  disabled={backtestLoading}
                >
                  {backtestLoading ? "Backtesting..." : "Run Backtest"}
                </button>
              </div>
            </form>
          </div>

          {priceError && <div className="text-xs text-rose-400 mb-3">Error: {priceError}</div>}

          <div className="chart-container">
            {prices.length === 0 && !loadingPrices ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No data yet. Try loading a symbol.
              </div>
            ) : (
              <CandlestickChart candles={liveCandles} height={280} />
            )}
          </div>
        </section>

        <section className="border border-slate-800 rounded-2xl p-5 bg-slate-950/60">
          <h2 className="text-lg font-semibold mb-2">Strategy Profiles</h2>
          <div className="profiles-list">
            <div className="button-group" style={{ marginBottom: "0.75rem" }}>
              <input
                className="input-number flex-1"
                placeholder="Save current settings as..."
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
              />
              <button
                type="button"
                className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-slate-950 transition"
                onClick={saveProfile}
              >
                Save Profile
              </button>
            </div>

            {profiles.length === 0 ? (
              <p className="text-sm text-slate-400">No profiles yet. Save one above.</p>
            ) : (
              <div className="profile-list">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className={`profile-row ${selectedProfileId === p.id ? "active-row" : ""}`}
                  >
                    <div className="profile-meta">
                      <div className="profile-name">{p.name}</div>
                      <div className="profile-sub">
                        {(p.strategy_type ?? "sma").toUpperCase()} • {p.short_window}/{p.long_window} • {p.period} • $
                        {p.initial_capital.toLocaleString()}
                      </div>
                    </div>
                    <div className="profile-actions">
                      <button onClick={() => loadProfile(p)}>Load</button>
                      <button
                        onClick={() => {
                          loadProfile(p);
                          const cfg: BacktestConfig = {
                            symbol: p.symbol ?? symbol,
                            strategyType: p.strategy_type ?? "sma",
                            shortWindow: p.short_window,
                            longWindow: p.long_window,
                            period: p.period,
                            initialCapital: p.initial_capital,
                            feeRate: p.fee_rate,
                            strategyParams: p.strategy_params ?? {},
                          };
                          const sp = cfg.strategyParams ?? {};
                          setStrategyType(cfg.strategyType);
                          if (sp.ema_fast) setEmaFast(sp.ema_fast);
                          if (sp.ema_slow) setEmaSlow(sp.ema_slow);
                          if (sp.rsi_window) setRsiWindow(sp.rsi_window);
                          if (sp.rsi_overbought) setRsiOverbought(sp.rsi_overbought);
                          if (sp.rsi_oversold) setRsiOversold(sp.rsi_oversold);
                          if (sp.macd_fast) setMacdFast(sp.macd_fast);
                          if (sp.macd_slow) setMacdSlow(sp.macd_slow);
                          if (sp.macd_signal) setMacdSignal(sp.macd_signal);
                          runBacktest(cfg);
                        }}
                      >
                        Run
                      </button>
                      <button onClick={() => renameProfile(p.id, p.name)}>Rename</button>
                      <button onClick={() => duplicateProfile(p.id)}>Duplicate</button>
                      <button onClick={() => moveProfile(p.id, "up")}>↑</button>
                      <button onClick={() => moveProfile(p.id, "down")}>↓</button>
                      <button className="danger" onClick={() => deleteProfile(p.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="border border-slate-800 rounded-2xl p-5 bg-slate-950/60 md:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">
                Strategy Backtest: {(strategyType ?? "sma").toUpperCase()} {shortWindow}/{longWindow}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Period: {period}, Capital: ${initialCapital.toLocaleString()}
              </p>
            </div>
          </div>

          {backtestError && <div className="text-xs text-rose-400 mb-3">Error: {backtestError}</div>}

          {!backtestResult && !backtestLoading && (
            <p className="text-sm text-slate-400">Run the backtest to view equity curve, metrics, and trade history.</p>
          )}

          {backtestResult && (
            <div className="backtest-grid">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="metric-card">
                  <p className="metric-label">Strategy</p>
                  <p className="metric-value text-base">
                    {(backtestResult.strategy_type ?? "sma").toUpperCase()} {backtestResult.short_window}/
                    {backtestResult.long_window}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Symbol: {backtestResult.symbol} • Period: {backtestResult.period} • Interval:{" "}
                    {backtestResult.interval}
                  </p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Capital & Fees</p>
                  <p className="text-lg font-semibold">
                    Start ${backtestResult.initial_capital?.toLocaleString() ?? initialCapital.toLocaleString()}
                  </p>
                  <p className="text-sm text-slate-300">
                    Final ${finalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Fee rate: {(backtestResult.fee_rate ?? feeRate) * 100}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Params</p>
                  <p className="text-sm text-slate-200">
                    Short {backtestResult.short_window}, Long {backtestResult.long_window}
                  </p>
                  {backtestResult.strategy_type === "ema" && (
                    <p className="text-xs text-slate-400">
                      EMA fast {strategyParams.ema_fast} • EMA slow {strategyParams.ema_slow}
                    </p>
                  )}
                  {backtestResult.strategy_type === "rsi" && (
                    <p className="text-xs text-slate-400">
                      RSI {strategyParams.rsi_window} • OB {strategyParams.rsi_overbought} • OS{" "}
                      {strategyParams.rsi_oversold}
                    </p>
                  )}
                  {backtestResult.strategy_type === "macd" && (
                    <p className="text-xs text-slate-400">
                      MACD {strategyParams.macd_fast}/{strategyParams.macd_slow} • Signal {strategyParams.macd_signal}
                    </p>
                  )}
                </div>
              </div>

              <div className="metrics-grid">
                <div className="metric-card">
                  <p className="metric-label">Sharpe Ratio</p>
                  <p className="metric-value">{backtestResult.metrics.sharpe.toFixed(2)}</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Max Drawdown</p>
                  <p className="metric-value">{(backtestResult.metrics.max_drawdown * 100).toFixed(1)}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Win Rate</p>
                  <p className="metric-value">{(backtestResult.metrics.win_rate * 100).toFixed(1)}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Total Return</p>
                  <p className="metric-value">{((backtestResult.metrics.total_return ?? 0) * 100).toFixed(1)}%</p>
                </div>
                <div className="metric-card">
                  <p className="metric-label">Trades</p>
                  <p className="metric-value">
                    {backtestResult.metrics.num_trades ?? backtestResult.trades.length}
                  </p>
                </div>
              </div>

              <div className="equity-panel">
                <h3 className="panel-subtitle">Price & Signals</h3>
                <div className="flex items-center gap-4 mb-2 flex-wrap text-xs text-slate-300">
                  {!isReplaying ? (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-sky-500 transition"
                      onClick={startReplay}
                      disabled={backtestCandles.length === 0}
                    >
                      ▶ Replay
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="px-3 py-1 rounded-lg border border-slate-700 text-xs text-slate-200 hover:border-rose-500 transition"
                      onClick={stopReplay}
                    >
                      ⏹ Stop
                    </button>
                  )}
                  <label className="text-xs text-slate-400">Speed</label>
                  <select
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                    value={replaySpeedMs}
                    onChange={(e) => setReplaySpeedMs(Number(e.target.value))}
                    disabled={isReplaying}
                  >
                    <option value={50}>Fast</option>
                    <option value={150}>Normal</option>
                    <option value={400}>Slow</option>
                  </select>
                  {isReplaying && (
                    <span className="text-xs text-slate-400">
                      {replayIndex}/{backtestCandles.length}
                    </span>
                  )}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showShortLine}
                      onChange={(e) => setShowShortLine(e.target.checked)}
                    />
                    <span>Show Short</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showLongLine}
                      onChange={(e) => setShowLongLine(e.target.checked)}
                    />
                    <span>Show Long</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showTradeMarkers}
                      onChange={(e) => setShowTradeMarkers(e.target.checked)}
                    />
                    <span>Buy/Sell Markers</span>
                  </label>
                </div>
                {backtestCandles.length === 0 ? (
                  <p className="text-sm text-slate-400">No candle data returned for this run.</p>
                ) : (
                  <CandlestickChart
                    candles={replayedCandles}
                    smaShort={toggledSmaShort}
                    smaLong={toggledSmaLong}
                    emaFast={toggledEmaFast}
                    emaSlow={toggledEmaSlow}
                    markers={toggledMarkers}
                    height={360}
                  />
                )}
              </div>

              <div className="equity-panel">
                <h3 className="panel-subtitle">Equity Curve</h3>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityChartData}>
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
                      <Area type="monotone" dataKey="equity" stroke="#34d399" fillOpacity={1} fill="url(#colorEquity)" />
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
                          <th>Equity After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResult.trades.map((trade) => (
                          <tr key={`${trade.timestamp}-${trade.side}`}>
                            <td>{trade.timestamp.slice(0, 10)}</td>
                            <td className={trade.side === "BUY" ? "trade-buy" : "trade-sell"}>{trade.side}</td>
                            <td>${trade.price.toFixed(2)}</td>
                            <td>{trade.shares}</td>
                            <td>{trade.equity_after_trade ? `$${trade.equity_after_trade.toFixed(2)}` : "—"}</td>
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

        <section className="border border-slate-800 rounded-2xl p-5 bg-slate-950/60 md:col-span-3">
          <h2 className="text-lg font-semibold mb-2">Backtest History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">Run a backtest to capture a history of your parameter sets and outcomes.</p>
          ) : (
            <div className="table-wrapper">
              <table className="trades-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Symbol</th>
                    <th>Strategy</th>
                    <th>Short / Long</th>
                    <th>Period</th>
                    <th>Sharpe</th>
                    <th>Total Return</th>
                    <th>Replay</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => {
                    const isActive = run.id === selectedBacktestId;
                    return (
                      <tr key={run.id} className={isActive ? "active-row" : ""}>
                        <td>{new Date(run.created_at).toLocaleString()}</td>
                        <td>{run.symbol}</td>
                        <td>{run.strategy_type ?? "sma"}</td>
                        <td>
                          {run.short_window}/{run.long_window}
                        </td>
                        <td>{run.period}</td>
                        <td>{run.metrics.sharpe.toFixed(2)}</td>
                        <td>{(((run.metrics.total_return ?? 0) as number) * 100).toFixed(1)}%</td>
                        <td>
                          <button
                            type="button"
                            className="replay-btn"
                            onClick={() => {
                              const cfg: BacktestConfig = {
                                symbol: run.symbol,
                                strategyType: run.strategy_type ?? "sma",
                                shortWindow: run.short_window,
                                longWindow: run.long_window,
                                period: run.period,
                                initialCapital: run.initial_capital,
                                feeRate: run.fee_rate,
                                strategyParams: run.strategy_params ?? {},
                              };
                              setStrategyType(cfg.strategyType);
                              const sp = cfg.strategyParams ?? {};
                              if (sp.ema_fast) setEmaFast(sp.ema_fast);
                              if (sp.ema_slow) setEmaSlow(sp.ema_slow);
                              if (sp.rsi_window) setRsiWindow(sp.rsi_window);
                              if (sp.rsi_overbought) setRsiOverbought(sp.rsi_overbought);
                              if (sp.rsi_oversold) setRsiOversold(sp.rsi_oversold);
                              if (sp.macd_fast) setMacdFast(sp.macd_fast);
                              if (sp.macd_slow) setMacdSlow(sp.macd_slow);
                              if (sp.macd_signal) setMacdSignal(sp.macd_signal);
                              setSymbol(cfg.symbol);
                              setShortWindow(cfg.shortWindow);
                              setLongWindow(cfg.longWindow);
                              setPeriod(cfg.period);
                              setInitialCapital(cfg.initialCapital);
                              setFeeRate(cfg.feeRate);
                              setSelectedBacktestId(run.id);
                              runBacktest(cfg);
                            }}
                          >
                            Replay
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function HistoryPage() {
  return <BacktestPage />;
}

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <NavBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </div>
    </Router>
  );
}
