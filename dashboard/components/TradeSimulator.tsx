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

interface TradeSimulatorProps {
  shockDelta: number;
  shockCategory: string | null;
  backtest: BacktestStats;
  distribution: DistributionData;
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
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={`mt-1 text-xl font-semibold ${positive ? "text-green-600" : "text-red-600"}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function TradeSimulator({
  shockDelta,
  shockCategory,
  backtest,
  distribution,
}: TradeSimulatorProps) {
  const [positionSize, setPositionSize] = useState(100);
  const [horizon, setHorizon] = useState<"1h" | "6h" | "24h">("6h");

  const catStats = shockCategory
    ? backtest.by_category[shockCategory]
    : null;
  const winRate = catStats?.win_rate_6h ?? backtest.win_rate_6h ?? 0;
  const avgPnl = catStats?.avg_pnl_6h ?? backtest.avg_pnl_per_dollar_6h;

  const expectedPnl = positionSize * avgPnl;
  const bestCase = positionSize * distribution.percentiles.p90;
  const worstCase = positionSize * distribution.percentiles.p10;

  const histogramData = useMemo(() => {
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
    <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Fade This Shock?
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Based on historical data for{" "}
          <span className="font-medium">{shockCategory || "all"}</span> market
          shocks (|delta| = {(Math.abs(shockDelta) * 100).toFixed(1)}pp)
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">
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
            className="mt-1 w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Horizon
          </label>
          <div className="mt-1 flex gap-1">
            {(["1h", "6h", "24h"] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  horizon === h
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>

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
        <h4 className="mb-2 text-sm font-medium text-gray-500">
          Historical Payoff Distribution
        </h4>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={histogramData}
              margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="bin"
                tick={{ fontSize: 10 }}
                stroke="#9ca3af"
                label={{
                  value: "Reversion (%)",
                  position: "bottom",
                  offset: 0,
                  style: { fontSize: 11, fill: "#9ca3af" },
                }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
                allowDecimals={false}
                label={{
                  value: "Count",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11, fill: "#9ca3af" },
                }}
              />
              <Tooltip
                formatter={(value, _name, props) => [
                  `${value} shocks (P&L: $${(props.payload as { pnl: string }).pnl})`,
                  "Frequency",
                ]}
              />
              <ReferenceLine
                x="0.0"
                stroke="#6b7280"
                strokeDasharray="3 3"
                label={{
                  value: "Break Even",
                  position: "top",
                  style: { fontSize: 10, fill: "#6b7280" },
                }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {histogramData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.isPositive ? "#22c55e" : "#ef4444"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        In-sample backtest only. Ignores transaction costs, slippage, and
        liquidity. Small sample size — edge may not persist. Not investment
        advice.
      </p>
    </div>
  );
}
