import React, { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  LineData,
  SeriesMarker,
  SeriesMarkerPosition,
  UTCTimestamp,
} from "lightweight-charts";

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Marker = {
  time: number; // unix seconds
  side: "BUY" | "SELL";
  price?: number;
};

type Props = {
  candles: Candle[];
  smaShort?: { time: number; value: number }[];
  smaLong?: { time: number; value: number }[];
  emaFast?: { time: number; value: number }[];
  emaSlow?: { time: number; value: number }[];
  markers?: Marker[];
  height?: number;
};

function toUTC(t: number): UTCTimestamp {
  return t as UTCTimestamp;
}

export default function CandlestickChart({
  candles,
  smaShort,
  smaLong,
  emaFast,
  emaSlow,
  markers,
  height = 420,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const seriesRef = useRef<{
    candle?: ISeriesApi<"Candlestick">;
    smaShort?: ISeriesApi<"Line">;
    smaLong?: ISeriesApi<"Line">;
    emaFast?: ISeriesApi<"Line">;
    emaSlow?: ISeriesApi<"Line">;
  }>({});

  const candleSeriesData: CandlestickData[] = useMemo(() => {
    return (candles ?? []).map((c) => ({
      time: toUTC(c.time),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  }, [candles]);

  const toLine = (arr?: { time: number; value: number }[]): LineData[] =>
    (arr ?? []).map((p) => ({ time: toUTC(p.time), value: p.value }));

  // Markers need to be placed on the candlestick series
  const candleMarkers = useMemo<SeriesMarker<UTCTimestamp>[]>(() => {
    return (markers ?? []).map((m) => {
      const position: SeriesMarkerPosition = m.side === "BUY" ? "belowBar" : "aboveBar";
      return {
        time: toUTC(m.time),
        position,
        shape: m.side === "BUY" ? "arrowUp" : "arrowDown",
        color: m.side === "BUY" ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)",
        text: m.side,
      };
    });
  }, [markers]);

  useEffect(() => {
    if (!containerRef.current) return;

    // (Re)create chart
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.08)" },
        horzLines: { color: "rgba(148,163,184,0.08)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)" },
    });

    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "rgba(34,197,94,0.9)",
      downColor: "rgba(239,68,68,0.9)",
      borderVisible: false,
      wickUpColor: "rgba(34,197,94,0.9)",
      wickDownColor: "rgba(239,68,68,0.9)",
    });

    const smaShortSeries = chart.addLineSeries({
      lineWidth: 2,
      color: "rgba(56,189,248,0.9)", // sky-ish
    });

    const smaLongSeries = chart.addLineSeries({
      lineWidth: 2,
      color: "rgba(167,139,250,0.9)", // violet-ish
    });

    const emaFastSeries = chart.addLineSeries({
      lineWidth: 2,
      color: "rgba(251,191,36,0.9)", // amber-ish
    });

    const emaSlowSeries = chart.addLineSeries({
      lineWidth: 2,
      color: "rgba(244,114,182,0.9)", // pink-ish
    });

    seriesRef.current = {
      candle: candleSeries,
      smaShort: smaShortSeries,
      smaLong: smaLongSeries,
      emaFast: emaFastSeries,
      emaSlow: emaSlowSeries,
    };

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, [height]);

  // Update series data when inputs change
  useEffect(() => {
    const candleSeries = seriesRef.current.candle;
    if (!candleSeries) return;

    candleSeries.setData(candleSeriesData);

    // lines (optional)
    seriesRef.current.smaShort?.setData(toLine(smaShort));
    seriesRef.current.smaLong?.setData(toLine(smaLong));
    seriesRef.current.emaFast?.setData(toLine(emaFast));
    seriesRef.current.emaSlow?.setData(toLine(emaSlow));

    // markers
    candleSeries.setMarkers(candleMarkers);

    // fit
    chartRef.current?.timeScale().fitContent();
  }, [candleSeriesData, smaShort, smaLong, emaFast, emaSlow, candleMarkers]);

  // Resize with container
  useEffect(() => {
    const el = containerRef.current;
    const chart = chartRef.current;
    if (!el || !chart) return;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    // initial
    chart.applyOptions({ width: el.clientWidth });

    return () => ro.disconnect();
  }, []);

  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
