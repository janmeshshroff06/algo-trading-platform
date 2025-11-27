import React, { useEffect, useRef } from "react";
import {
  CandlestickData,
  createChart,
  ISeriesApi,
  LineStyle,
  Time,
} from "lightweight-charts";

export type Candle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Marker = {
  time: Time;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text: string;
};

type Props = {
  data: Candle[];
  markers?: Marker[];
  height?: number;
};

function toTime(ts: string): Time {
  return Math.floor(new Date(ts).getTime() / 1000) as Time;
}

const CandlestickChart: React.FC<Props> = ({ data, markers, height = 300 }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#020617" },
        textColor: "#cbd5f5",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.12)" },
        horzLines: { color: "rgba(148,163,184,0.12)" },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.3)",
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.3)",
      },
    });

    const candleSeries: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    });

    const candleData: CandlestickData[] = data.map((d) => ({
      time: toTime(d.timestamp),
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    candleSeries.setData(candleData);

    if (markers && markers.length > 0) {
      candleSeries.setMarkers(markers);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, markers]);

  return <div ref={containerRef} style={{ height }} />;
};

export default CandlestickChart;
