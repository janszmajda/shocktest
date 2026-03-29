"use client";

import { useState, useMemo } from "react";
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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categories = useMemo(() => {
    return Array.from(
      new Set(shocks.map((s) => s.category).filter(Boolean)),
    ) as string[];
  }, [shocks]);

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return shocks;
    return shocks.filter((s) => s.category === categoryFilter);
  }, [shocks, categoryFilter]);

  const bins = buildBins(filtered);
  const meanReversion = computeMeanReversion(filtered);

  const zeroBinIndex = bins.findIndex((b) => b.label === "0 to 2");
  const zeroLabel = zeroBinIndex >= 0 ? bins[zeroBinIndex].label : undefined;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        Post-Shock Reversion Distribution (6h)
      </h2>
      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={bins}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              style={{ cursor: "default" }}
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
              <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {bins.map((bin, idx) => (
                  <Cell
                    key={idx}
                    fill={bin.isReversion ? "#22c78a" : "#f05c5c"}
                    fillOpacity={0.8}
                    style={{ cursor: "default" }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend — inside the box */}
        <p className="mt-2 text-center text-xs text-text-muted">
          <span className="text-yes-text">Green</span> = reversion &middot;{" "}
          <span className="text-no-text">Red</span> = continuation &middot;{" "}
          <span style={{ color: "#5b8def" }}>Dashed</span> = mean
        </p>

        {/* Category filter */}
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                categoryFilter === "all"
                  ? "bg-surface-2 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-all ${
                  categoryFilter === cat
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
