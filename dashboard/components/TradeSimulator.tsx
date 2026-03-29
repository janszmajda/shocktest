"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BacktestStats, DistributionData } from "@/lib/types";

type Horizon = "1h" | "6h" | "24h";

interface TradeSimulatorProps {
  shockDelta: number;
  shockCategory: string | null;
  backtest: BacktestStats;
  distributions: {
    "1h": DistributionData | null;
    "6h": DistributionData | null;
    "24h": DistributionData | null;
  };
  sampleSize?: number;
  filterLevel?: "tight" | "category" | "all";
}

function MetricCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${positive ? "text-yes-text" : "text-no-text"}`}
      >
        {value}
      </p>
    </div>
  );
}

const FILTER_LABELS: Record<string, string> = {
  tight: "similar shocks (same category, magnitude, direction)",
  category: "same-category shocks",
  all: "all historical shocks",
};

export default function TradeSimulator({
  shockDelta,
  shockCategory,
  backtest,
  distributions,
  sampleSize,
  filterLevel,
}: TradeSimulatorProps) {
  const [positionSize, setPositionSize] = useState(100);
  const horizon: Horizon = "1h";

  const distribution = distributions[horizon];

  // Pick horizon-specific win rate from backtest
  const winRateKey = `win_rate_${horizon}` as keyof BacktestStats;
  const overallWinRate = (backtest[winRateKey] as number | null) ?? backtest.win_rate_6h ?? 0;

  const catStats = shockCategory
    ? backtest.by_category[shockCategory]
    : null;
  const winRate = catStats?.win_rate_6h ?? overallWinRate;
  const avgPnl = distribution?.mean ?? catStats?.avg_pnl_6h ?? backtest.avg_pnl_per_dollar_6h;

  const expectedPnl = positionSize * avgPnl;
  const bestCase = distribution ? positionSize * distribution.percentiles.p90 : 0;
  const worstCase = distribution ? positionSize * distribution.percentiles.p10 : 0;

  const histogramData = useMemo(() => {
    if (!distribution) return [];
    return distribution.bin_counts.map((count, i) => {
      const binCenter =
        (distribution.bin_edges[i] + distribution.bin_edges[i + 1]) / 2;
      return {
        bin: `${(binCenter * 100).toFixed(1)}`,
        count,
        pnl: (binCenter * positionSize).toFixed(2),
        isPositive: binCenter > 0,
      };
    });
  }, [distribution, positionSize]);

  return (
    <div className="space-y-6 rounded-lg border border-border bg-surface-1 p-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">
          Fade This Shock?
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          Based on{" "}
          <span className="font-medium">
            {sampleSize ?? backtest.total_trades} {filterLevel ? FILTER_LABELS[filterLevel] : "historical shocks"}
          </span>
          {" "}(|delta| = {(Math.abs(shockDelta) * 100).toFixed(1)}pp
          {shockCategory ? `, ${shockCategory}` : ""})
        </p>
        {filterLevel && filterLevel !== "tight" && (
          <p className="mt-1 text-xs text-accent">
            {filterLevel === "category"
              ? "Not enough similar shocks — widened to all same-category shocks"
              : "Not enough similar shocks — using all historical data"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="block text-sm font-medium text-text-secondary">
            Position Size ($)
          </label>
          <input
            type="number"
            value={positionSize}
            onChange={(e) =>
              setPositionSize(Math.max(1, Math.min(10000, Number(e.target.value))))
            }
            min={1}
            max={10000}
            className="mt-1 w-32 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          />
        </div>

      </div>

      {!distribution ? (
        <div className="rounded-lg border border-border bg-accent-dim p-4 text-center text-sm text-accent">
          No distribution data available for {horizon} horizon yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <MetricCard
              label="Expected P&L"
              value={`$${expectedPnl.toFixed(2)}`}
              positive={expectedPnl > 0}
            />
            <MetricCard
              label="Win Rate"
              value={`${(winRate * 100).toFixed(0)}%`}
              positive={winRate > 0.5}
            />
            <MetricCard
              label="Best Case (p90)"
              value={`$${bestCase.toFixed(2)}`}
              positive={true}
            />
            <MetricCard
              label="Worst Case (p10)"
              value={`$${worstCase.toFixed(2)}`}
              positive={worstCase > 0}
            />
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-text-muted">
              Historical Payoff Distribution ({horizon})
            </h4>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={histogramData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--st-grid)" />
                  <XAxis
                    dataKey="bin"
                    tick={{ fontSize: 10, fill: "var(--st-muted)" }}
                    stroke="var(--st-muted)"
                    label={{
                      value: "Reversion (%)",
                      position: "bottom",
                      offset: 0,
                      style: { fontSize: 11, fill: "var(--st-muted)" },
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--st-muted)" }}
                    stroke="var(--st-muted)"
                    allowDecimals={false}
                    label={{
                      value: "Count",
                      angle: -90,
                      position: "insideLeft",
                      style: { fontSize: 11, fill: "var(--st-muted)" },
                    }}
                  />
                  <Tooltip
                    contentStyle={{ background: "var(--st-s2)", border: "1px solid var(--st-border)", borderRadius: "8px", color: "var(--st-txt)", fontSize: "12px" }}
                    formatter={(value, _name, props) => [
                      `${value} shocks (P&L: $${(props.payload as { pnl: string }).pnl})`,
                      "Frequency",
                    ]}
                  />
                  <ReferenceLine
                    x="0.0"
                    stroke="var(--st-muted)"
                    strokeDasharray="3 3"
                    label={{
                      value: "Break Even",
                      position: "top",
                      style: { fontSize: 10, fill: "var(--st-muted)" },
                    }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {histogramData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.isPositive ? "var(--st-yes)" : "var(--st-no)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
