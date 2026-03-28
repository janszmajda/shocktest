"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface PayoffCurveProps {
  entryPrice: number;
  positionSize: number;
  direction: "buy_no" | "buy_yes";
  currentPrice: number;
  meanReversionTarget: number | null;
}

export default function PayoffCurve({
  entryPrice,
  positionSize,
  direction,
  currentPrice,
  meanReversionTarget,
}: PayoffCurveProps) {
  const data = useMemo(() => {
    const points = [];
    for (let prob = 0; prob <= 100; prob += 1) {
      const p = prob / 100;
      let pnl: number;

      if (direction === "buy_no") {
        const costPerShare = 1 - entryPrice;
        const shares = positionSize / costPerShare;
        const valuePerShare = 1 - p;
        pnl = shares * valuePerShare - positionSize;
      } else {
        const costPerShare = entryPrice;
        const shares = positionSize / costPerShare;
        const valuePerShare = p;
        pnl = shares * valuePerShare - positionSize;
      }

      points.push({
        probability: prob,
        pnl: Number(pnl.toFixed(2)),
      });
    }
    return points;
  }, [entryPrice, positionSize, direction]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h4 className="text-lg font-semibold text-gray-900">
        Payoff Curve — P&L by Resolution Outcome
      </h4>
      <p className="mb-4 text-xs text-gray-500">
        If you {direction === "buy_no" ? "buy NO" : "buy YES"} at{" "}
        {(entryPrice * 100).toFixed(0)}% with ${positionSize}
      </p>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="probability"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11 }}
              stroke="#9ca3af"
              label={{
                value: "Resolution Probability (%)",
                position: "bottom",
                offset: 0,
                style: { fontSize: 11, fill: "#9ca3af" },
              }}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fontSize: 11 }}
              stroke="#9ca3af"
              label={{
                value: "P&L ($)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#9ca3af" },
              }}
            />
            <Tooltip
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "P&L"]}
              labelFormatter={(label) => `${label}%`}
            />
            <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" />
            <ReferenceLine
              x={Math.round(currentPrice * 100)}
              stroke="#2563eb"
              strokeDasharray="5 5"
              label={{
                value: "Current",
                position: "top",
                style: { fontSize: 10, fill: "#2563eb" },
              }}
            />
            {meanReversionTarget !== null && (
              <ReferenceLine
                x={Math.round(meanReversionTarget * 100)}
                stroke="#22c55e"
                strokeDasharray="5 5"
                label={{
                  value: "Reversion Target",
                  position: "top",
                  style: { fontSize: 10, fill: "#22c55e" },
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="pnl"
              fill="#22c55e"
              fillOpacity={0.08}
              stroke="none"
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#2563eb"
              dot={false}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
