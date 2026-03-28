"use client";

import { useMemo, useState } from "react";

interface PnlHeatmapProps {
  entryPrice: number;
  positionSize: number;
  direction: "buy_yes" | "buy_no";
}

const PROB_STEPS = Array.from({ length: 21 }, (_, i) => i * 5); // 0% to 100%
const DAYS_ROWS = [1, 3, 7, 14, 21, 30, 45, 60, 90, 120, 180];

function computePnl(
  entryPrice: number,
  positionSize: number,
  direction: "buy_yes" | "buy_no",
  probability: number,
  days: number,
): number {
  const p = probability / 100;
  let basePnl: number;

  if (direction === "buy_no") {
    const costPerShare = 1 - entryPrice;
    const shares = positionSize / costPerShare;
    const value = shares * (1 - p);
    basePnl = value - positionSize;
  } else {
    const costPerShare = entryPrice;
    const shares = positionSize / costPerShare;
    const value = shares * p;
    basePnl = value - positionSize;
  }

  const timeDecay = Math.min(days / 30, 1);
  return basePnl * timeDecay;
}

function pnlColor(pnl: number, maxAbs: number): string {
  if (maxAbs === 0) return "rgb(255, 255, 255)";
  const ratio = Math.min(Math.abs(pnl) / maxAbs, 1);
  const intensity = Math.round(ratio * 180);

  if (pnl > 0.5) return `rgb(${255 - intensity}, 255, ${255 - intensity})`;
  if (pnl < -0.5) return `rgb(255, ${255 - intensity}, ${255 - intensity})`;
  return "rgb(255, 255, 255)";
}

export default function PnlHeatmap({
  entryPrice,
  positionSize,
  direction,
}: PnlHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    prob: number;
    days: number;
    pnl: number;
    x: number;
    y: number;
  } | null>(null);

  const { grid, maxAbs } = useMemo(() => {
    let maxAbs = 0;
    const grid: number[][] = [];

    for (const days of DAYS_ROWS) {
      const row: number[] = [];
      for (const prob of PROB_STEPS) {
        const pnl = computePnl(entryPrice, positionSize, direction, prob, days);
        row.push(pnl);
        if (Math.abs(pnl) > maxAbs) maxAbs = Math.abs(pnl);
      }
      grid.push(row);
    }

    return { grid, maxAbs };
  }, [entryPrice, positionSize, direction]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h4 className="text-lg font-semibold text-gray-900">
        P&L Heatmap — Probability vs. Time to Resolution
      </h4>
      <p className="mb-4 text-xs text-gray-500">
        {direction === "buy_no" ? "Buy NO" : "Buy YES"} at{" "}
        {(entryPrice * 100).toFixed(0)}% with ${positionSize} — green = profit,
        red = loss
      </p>

      <div className="overflow-x-auto">
        <div className="relative inline-block">
          {/* Column headers (probabilities) */}
          <div
            className="grid gap-px"
            style={{
              gridTemplateColumns: `64px repeat(${PROB_STEPS.length}, minmax(36px, 1fr))`,
            }}
          >
            <div className="p-1 text-right text-[10px] font-medium text-gray-400">
              Days \ Prob
            </div>
            {PROB_STEPS.map((prob) => (
              <div
                key={prob}
                className="p-1 text-center text-[10px] font-medium text-gray-500"
              >
                {prob}%
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {DAYS_ROWS.map((days, rowIdx) => (
            <div
              key={days}
              className="grid gap-px"
              style={{
                gridTemplateColumns: `64px repeat(${PROB_STEPS.length}, minmax(36px, 1fr))`,
              }}
            >
              <div className="flex items-center justify-end p-1 text-[10px] font-medium text-gray-500">
                {days}d
              </div>
              {PROB_STEPS.map((prob, colIdx) => {
                const pnl = grid[rowIdx][colIdx];
                return (
                  <div
                    key={prob}
                    className="cursor-crosshair border border-gray-100 p-1 text-center text-[9px] transition-opacity hover:opacity-80"
                    style={{ backgroundColor: pnlColor(pnl, maxAbs) }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        prob,
                        days,
                        pnl,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span
                      className={
                        pnl > 0
                          ? "text-green-800"
                          : pnl < 0
                            ? "text-red-800"
                            : "text-gray-400"
                      }
                    >
                      {Math.abs(pnl) >= 1 ? `${pnl > 0 ? "+" : ""}${pnl.toFixed(0)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-500">Prob: </span>
          <span className="font-medium">{tooltip.prob}%</span>
          <span className="mx-2 text-gray-300">|</span>
          <span className="text-gray-500">Days: </span>
          <span className="font-medium">{tooltip.days}</span>
          <span className="mx-2 text-gray-300">|</span>
          <span className="text-gray-500">P&L: </span>
          <span
            className={`font-semibold ${tooltip.pnl > 0 ? "text-green-600" : tooltip.pnl < 0 ? "text-red-600" : "text-gray-600"}`}
          >
            ${tooltip.pnl.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
