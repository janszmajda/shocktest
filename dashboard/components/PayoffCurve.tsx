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
    <div className="rounded-lg border border-border bg-surface-1 p-6">
      <h4 className="text-lg font-semibold text-text-primary">
        Payoff Curve — P&L by Resolution Outcome
      </h4>
      <p className="mb-4 text-xs text-text-muted">
        If you {direction === "buy_no" ? "buy NO" : "buy YES"} at{" "}
        {(entryPrice * 100).toFixed(0)}% with ${positionSize}
      </p>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="probability"
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 10, fill: "#55555f" }}
              stroke="#55555f"
              label={{
                value: "Resolution Probability (%)",
                position: "bottom",
                offset: 0,
                style: { fontSize: 11, fill: "#55555f" },
              }}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fontSize: 10, fill: "#55555f" }}
              stroke="#55555f"
              label={{
                value: "P&L ($)",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#55555f" },
              }}
            />
            <Tooltip
              contentStyle={{ background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", color: "#e8e8ed", fontSize: "12px" }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "P&L"]}
              labelFormatter={(label) => `${label}%`}
            />
            <ReferenceLine y={0} stroke="#55555f" strokeDasharray="3 3" />
            <ReferenceLine
              x={Math.round(currentPrice * 100)}
              stroke="#F26522"
              strokeDasharray="5 5"
              label={{
                value: "Current",
                position: "top",
                style: { fontSize: 10, fill: "#F26522" },
              }}
            />
            {meanReversionTarget !== null && (
              <ReferenceLine
                x={Math.round(meanReversionTarget * 100)}
                stroke="#22c78a"
                strokeDasharray="5 5"
                label={{
                  value: "Reversion Target",
                  position: "top",
                  style: { fontSize: 10, fill: "#22c78a" },
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="pnl"
              fill="#22c78a"
              fillOpacity={0.08}
              stroke="none"
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#F26522"
              dot={false}
              strokeWidth={2}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
