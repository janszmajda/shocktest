"use client";

import { useMemo } from "react";
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
  const shockRegion = useMemo(() => {
    if (shockT1 === undefined || shockT2 === undefined || series.length === 0) {
      return null;
    }

    // Always start with snapped values as the baseline
    const snappedT1 = snapToNearest(series, shockT1);
    const snappedT2 = snapToNearest(series, shockT2);
    if (snappedT1 === null || snappedT2 === null) return null;

    // If we have p_before and p_after, try to find the actual price extremes
    if (pBefore !== undefined && pAfter !== undefined) {
      const windowPadding = Math.abs(shockT2 - shockT1) * 1.5;
      const searchStart = shockT1 - windowPadding;
      const searchEnd = shockT2 + windowPadding;

      const windowPoints = series.filter(
        (pt) => pt.t >= searchStart && pt.t <= searchEnd,
      );

      if (windowPoints.length >= 2) {
        const isUpShock = pAfter > pBefore;
        let startPt = windowPoints[0];
        let endPt = windowPoints[windowPoints.length - 1];

        if (isUpShock) {
          // Find local min before peak, then local max
          for (const pt of windowPoints) {
            if (pt.p <= startPt.p && pt.t <= shockT2 + 300) startPt = pt;
          }
          for (const pt of windowPoints) {
            if (pt.p >= endPt.p && pt.t >= startPt.t) endPt = pt;
          }
        } else {
          // Find local max before trough, then local min
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

    // Fallback: use snapped t1/t2, ensure they're different
    if (snappedT1 === snappedT2) {
      // If they snap to the same point, widen by finding nearest neighbors
      const idx = series.findIndex((pt) => pt.t === snappedT1);
      const startIdx = Math.max(0, idx - 2);
      const endIdx = Math.min(series.length - 1, idx + 2);
      return { t1: series[startIdx].t, t2: series[endIdx].t };
    }

    return {
      t1: Math.min(snappedT1, snappedT2),
      t2: Math.max(snappedT1, snappedT2),
    };
  }, [series, shockT1, shockT2, pBefore, pAfter]);

  if (series.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-text-muted">
        No price data available
      </div>
    );
  }

  const data = series.map((point) => ({
    t: point.t,
    probability: point.p * 100,
  }));

  return (
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
  );
}
