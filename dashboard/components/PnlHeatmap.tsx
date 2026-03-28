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

  // Guard against division by zero at extreme entry prices
  if (direction === "buy_no" && entryPrice >= 1) return 0;
  if (direction === "buy_yes" && entryPrice <= 0) return 0;

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

  // Time decay: models how much of the expected reversion has materialized
  // At 30+ days, full resolution P&L; at fewer days, partial reversion
  const timeDecay = Math.min(days / 30, 1);
  return basePnl * timeDecay;
}

function pnlColor(pnl: number, maxAbs: number): string {
  if (maxAbs === 0) return "rgb(255, 255, 255)";
  const ratio = Math.min(Math.abs(pnl) / maxAbs, 1);
  const intensity = Math.round(ratio * 200);

  if (pnl > 0) return `rgb(${255 - intensity}, 255, ${255 - intensity})`;
  if (pnl < 0) return `rgb(255, ${255 - intensity}, ${255 - intensity})`;
  return "rgb(255, 255, 255)";
}

export default function PnlHeatmap({
  entryPrice,
  positionSize,
  direction,
}: PnlHeatmapProps) {
  const [hovered, setHovered] = useState<{
    prob: number;
    days: number;
    pnl: number;
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
                const isHovered =
                  hovered !== null &&
                  hovered.prob === prob &&
                  hovered.days === days;
                return (
                  <div
                    key={prob}
                    className={`cursor-crosshair border p-1 text-center text-[9px] ${
                      isHovered
                        ? "border-blue-500 ring-1 ring-blue-400"
                        : "border-gray-100"
                    }`}
                    style={{ backgroundColor: pnlColor(pnl, maxAbs) }}
                    onMouseEnter={() => setHovered({ prob, days, pnl })}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <span
                      className={
                        pnl > 0
                          ? "text-green-900"
                          : pnl < 0
                            ? "text-red-900"
                            : "text-gray-400"
                      }
                    >
                      {Math.abs(pnl) >= 0.5
                        ? `${pnl > 0 ? "+" : ""}${pnl.toFixed(0)}`
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip bar */}
      <div
        className={`mt-3 rounded-md border px-3 py-2 text-sm transition-opacity ${
          hovered ? "opacity-100" : "opacity-0"
        } border-gray-200 bg-gray-50`}
      >
        {hovered ? (
          <>
            <span className="text-gray-500">Probability: </span>
            <span className="font-medium">{hovered.prob}%</span>
            <span className="mx-2 text-gray-300">|</span>
            <span className="text-gray-500">Days: </span>
            <span className="font-medium">{hovered.days}</span>
            <span className="mx-2 text-gray-300">|</span>
            <span className="text-gray-500">P&L: </span>
            <span
              className={`font-semibold ${
                hovered.pnl > 0
                  ? "text-green-600"
                  : hovered.pnl < 0
                    ? "text-red-600"
                    : "text-gray-600"
              }`}
            >
              {hovered.pnl >= 0 ? "+" : ""}${hovered.pnl.toFixed(2)}
            </span>
          </>
        ) : (
          <span className="text-gray-400">Hover over a cell to see details</span>
        )}
      </div>
    </div>
  );
}
