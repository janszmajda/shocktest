"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface PnlTimelineProps {
  series: { t: number; p: number }[];
  shockT2: string;
  shockDelta: number;
  positionSize: number;
}

export default function PnlTimeline({
  series,
  shockT2,
  shockDelta,
  positionSize,
}: PnlTimelineProps) {
  const data = useMemo(() => {
    const t2 = new Date(shockT2).getTime() / 1000;
    const shockDirection = Math.sign(shockDelta);
    const pAtShock = series.find((pt) => Math.abs(pt.t - t2) < 120)?.p;
    if (!pAtShock) return [];

    return series
      .filter((pt) => pt.t >= t2 && pt.t <= t2 + 86400)
      .map((pt) => {
        const hoursAfter = (pt.t - t2) / 3600;
        const postMove = pt.p - pAtShock;
        const reversion = -shockDirection * postMove;
        const pnl = positionSize * reversion;
        return {
          hours: Number(hoursAfter.toFixed(2)),
          label: `${hoursAfter.toFixed(1)}h`,
          pnl: Number(pnl.toFixed(2)),
        };
      });
  }, [series, shockT2, shockDelta, positionSize]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-border bg-surface-1 text-sm text-text-muted">
        No post-shock price data available for P&L timeline
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-6">
      <h4 className="text-lg font-semibold text-text-primary">
        P&L Over Time (if you faded at shock peak)
      </h4>
      <p className="mb-4 text-xs text-text-muted">
        Shows how your ${positionSize} fade position would have performed over
        24 hours
      </p>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--st-grid)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--st-muted)" }}
              stroke="var(--st-muted)"
              label={{
                value: "Hours After Shock",
                position: "bottom",
                offset: 0,
                style: { fontSize: 11, fill: "var(--st-muted)" },
              }}
            />
            <YAxis
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fontSize: 10, fill: "var(--st-muted)" }}
              stroke="var(--st-muted)"
            />
            <Tooltip
              contentStyle={{ background: "var(--st-s2)", border: "1px solid var(--st-border)", borderRadius: "8px", color: "var(--st-txt)", fontSize: "12px" }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, "P&L"]}
            />
            <ReferenceLine y={0} stroke="var(--st-muted)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="var(--st-accent)"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
