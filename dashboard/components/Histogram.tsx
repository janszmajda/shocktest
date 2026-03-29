"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Shock } from "@/lib/types";

interface HistogramProps {
  shocks: Shock[];
}

interface Bin {
  label: string;
  count: number;
  isReversion: boolean;
  midpoint: number;
}

function buildBins(shocks: Shock[]): Bin[] {
  const values = shocks
    .map((s) => s.reversion_6h)
    .filter((v): v is number => v !== null);

  const bins: Bin[] = [
    { label: "<-5pp", count: 0, isReversion: false, midpoint: -7 },
    { label: "-5 to -2", count: 0, isReversion: false, midpoint: -3.5 },
    { label: "-2 to 0", count: 0, isReversion: false, midpoint: -1 },
    { label: "0 to 2", count: 0, isReversion: true, midpoint: 1 },
    { label: "2 to 5", count: 0, isReversion: true, midpoint: 3.5 },
    { label: "5 to 10", count: 0, isReversion: true, midpoint: 7.5 },
    { label: ">10pp", count: 0, isReversion: true, midpoint: 12 },
  ];

  for (const v of values) {
    const pp = v * 100;
    if (pp < -5) bins[0].count++;
    else if (pp < -2) bins[1].count++;
    else if (pp < 0) bins[2].count++;
    else if (pp < 2) bins[3].count++;
    else if (pp < 5) bins[4].count++;
    else if (pp < 10) bins[5].count++;
    else bins[6].count++;
  }

  return bins;
}

function computeMeanReversion(shocks: Shock[]): number | null {
  const values = shocks
    .map((s) => s.reversion_6h)
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return (values.reduce((a, b) => a + b, 0) / values.length) * 100;
}

export default function Histogram({ shocks }: HistogramProps) {
  const bins = buildBins(shocks);
  const meanReversion = computeMeanReversion(shocks);

  const zeroBinIndex = bins.findIndex((b) => b.label === "0 to 2");
  const zeroLabel = zeroBinIndex >= 0 ? bins[zeroBinIndex].label : undefined;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        Post-Shock Reversion Distribution (6h)
      </h2>
      <div className="h-72 w-full rounded-lg border border-border bg-surface-1 p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={bins}
            margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#55555f" }}
              stroke="#55555f"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#55555f" }}
              stroke="#55555f"
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#1a1a1f",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "8px",
                color: "#e8e8ed",
                fontSize: "12px",
              }}
            />
            {zeroLabel && (
              <ReferenceLine
                x={zeroLabel}
                stroke="#55555f"
                strokeWidth={1.5}
                label={{
                  value: "0",
                  position: "top",
                  style: { fontSize: 10, fill: "#55555f" },
                }}
              />
            )}
            {meanReversion !== null && (
              <ReferenceLine
                x={
                  bins.reduce((closest, bin) =>
                    Math.abs(bin.midpoint - meanReversion) <
                    Math.abs(closest.midpoint - meanReversion)
                      ? bin
                      : closest,
                  ).label
                }
                stroke="#5b8def"
                strokeDasharray="6 3"
                strokeWidth={2}
                label={{
                  value: `Mean: ${meanReversion.toFixed(1)}pp`,
                  position: "top",
                  style: { fontSize: 10, fill: "#5b8def" },
                }}
              />
            )}
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {bins.map((bin, idx) => (
                <Cell
                  key={idx}
                  fill={bin.isReversion ? "#22c78a" : "#f05c5c"}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-xs text-text-muted">
        <span className="text-yes-text">Green</span> = reversion &middot;{" "}
        <span className="text-no-text">Red</span> = continuation &middot;{" "}
        <span className="text-accent">Dashed</span> = mean
      </p>
    </div>
  );
}
