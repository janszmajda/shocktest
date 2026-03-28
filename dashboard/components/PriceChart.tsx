"use client";

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
  shockT1?: number; // unix seconds
  shockT2?: number; // unix seconds
}

function formatTime(t: number): string {
  return new Date(t * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(t: number): string {
  return new Date(t * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PriceChart({
  series,
  shockT1,
  shockT2,
}: PriceChartProps) {
  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-400">
        No price data available
      </div>
    );
  }

  const data = series.map((point) => ({
    t: point.t,
    p: point.p,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="t"
            tickFormatter={formatTime}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
          />
          <Tooltip
            labelFormatter={(label) => formatDate(label as number)}
            formatter={(value) => [
              `${(Number(value) * 100).toFixed(1)}%`,
              "Probability",
            ]}
          />
          {shockT1 !== undefined && shockT2 !== undefined && (
            <ReferenceArea
              x1={shockT1}
              x2={shockT2}
              fill="#ef4444"
              fillOpacity={0.15}
              stroke="#ef4444"
              strokeOpacity={0.3}
            />
          )}
          <Line
            type="monotone"
            dataKey="p"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
