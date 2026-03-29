"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { PricePoint } from "@/lib/types";

interface PriceChartProps {
  series: PricePoint[];
  shockT1?: number;
  shockT2?: number;
  pBefore?: number;
  pAfter?: number;
}

type ChartRange = "1h" | "2h" | "3h" | "5h" | "12h" | "1d" | "3d" | "7d" | "all";

const CHART_RANGES: { key: ChartRange; label: string; seconds: number }[] = [
  { key: "1h", label: "1H", seconds: 3600 },
  { key: "2h", label: "2H", seconds: 7200 },
  { key: "3h", label: "3H", seconds: 10800 },
  { key: "5h", label: "5H", seconds: 18000 },
  { key: "12h", label: "12H", seconds: 43200 },
  { key: "1d", label: "1D", seconds: 86400 },
  { key: "3d", label: "3D", seconds: 259200 },
  { key: "7d", label: "7D", seconds: 604800 },
  { key: "all", label: "All", seconds: Infinity },
];

function formatTime(t: number): string {
  return new Date(t * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(t: number): string {
  return new Date(t * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function snapToNearest(series: PricePoint[], target: number): number | null {
  if (series.length === 0) return null;
  let closest = series[0];
  for (const pt of series) {
    if (Math.abs(pt.t - target) < Math.abs(closest.t - target)) {
      closest = pt;
    }
  }
  return closest.t;
}

export default function PriceChart({
  series,
  shockT1,
  shockT2,
  pBefore,
  pAfter,
}: PriceChartProps) {
  const [range, setRange] = useState<ChartRange>("all");

  const filteredSeries = useMemo(() => {
    const rangeSeconds = CHART_RANGES.find((r) => r.key === range)?.seconds ?? Infinity;
    if (series.length < 2 || rangeSeconds === Infinity) return series;
    const lastT = series[series.length - 1].t;
    const cutoff = lastT - rangeSeconds;
    const filtered = series.filter((pt) => pt.t >= cutoff);
    return filtered.length >= 2 ? filtered : series;
  }, [series, range]);

  const shockRegion = useMemo(() => {
    if (shockT1 === undefined || shockT2 === undefined || filteredSeries.length === 0) {
      return null;
    }

    const snappedT1 = snapToNearest(filteredSeries, shockT1);
    const snappedT2 = snapToNearest(filteredSeries, shockT2);
    if (snappedT1 === null || snappedT2 === null) return null;

    if (pBefore !== undefined && pAfter !== undefined) {
      const windowPadding = Math.abs(shockT2 - shockT1) * 1.5;
      const searchStart = shockT1 - windowPadding;
      const searchEnd = shockT2 + windowPadding;

      const windowPoints = filteredSeries.filter(
        (pt) => pt.t >= searchStart && pt.t <= searchEnd,
      );

      if (windowPoints.length >= 2) {
        const isUpShock = pAfter > pBefore;
        let startPt = windowPoints[0];
        let endPt = windowPoints[windowPoints.length - 1];

        if (isUpShock) {
          for (const pt of windowPoints) {
            if (pt.p <= startPt.p && pt.t <= shockT2 + 300) startPt = pt;
          }
          for (const pt of windowPoints) {
            if (pt.p >= endPt.p && pt.t >= startPt.t) endPt = pt;
          }
        } else {
          for (const pt of windowPoints) {
            if (pt.p >= startPt.p && pt.t <= shockT2 + 300) startPt = pt;
          }
          for (const pt of windowPoints) {
            if (pt.p <= endPt.p && pt.t >= startPt.t) endPt = pt;
          }
        }

        if (startPt.t < endPt.t) {
          return { t1: startPt.t, t2: endPt.t };
        }
      }
    }

    if (snappedT1 === snappedT2) {
      const idx = filteredSeries.findIndex((pt) => pt.t === snappedT1);
      const startIdx = Math.max(0, idx - 2);
      const endIdx = Math.min(filteredSeries.length - 1, idx + 2);
      return { t1: filteredSeries[startIdx].t, t2: filteredSeries[endIdx].t };
    }

    return {
      t1: Math.min(snappedT1, snappedT2),
      t2: Math.max(snappedT1, snappedT2),
    };
  }, [filteredSeries, shockT1, shockT2, pBefore, pAfter]);

  if (series.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-text-muted">
        No price data available
      </div>
    );
  }

  const data = filteredSeries.map((point) => ({
    t: point.t,
    probability: point.p * 100,
  }));

  return (
    <div>
      {/* Time range selector */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] text-text-muted">Range</span>
        <div className="flex gap-0.5 rounded-lg border border-border bg-surface-1 p-0.5">
          {CHART_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                range === r.key
                  ? "bg-surface-2 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
            />
            <XAxis
              dataKey="t"
              tickFormatter={formatTime}
              tick={{ fontSize: 11, fill: "#8b8b9a" }}
              stroke="#55555f"
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "#8b8b9a" }}
              stroke="#55555f"
            />
            <Tooltip
              contentStyle={{
                background: "#1a1a1f",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "8px",
                color: "#e8e8ed",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(label as number)}
              formatter={(value) => [
                `${Number(value).toFixed(1)}%`,
                "Probability",
              ]}
            />
            {shockRegion && (
              <ReferenceArea
                x1={shockRegion.t1}
                x2={shockRegion.t2}
                fill="#f05c5c"
                fillOpacity={0.15}
                stroke="#f05c5c"
                strokeOpacity={0.3}
                label="Shock"
              />
            )}
            <Line
              type="monotone"
              dataKey="probability"
              stroke="#22c78a"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
