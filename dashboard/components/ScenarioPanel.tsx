"use client";

import { useState, useMemo } from "react";

interface ScenarioPanelProps {
  entryPrice: number;
  shockDelta: number;
  positionSize: number;
  category: string | null;
  backtestStats: {
    win_rate_6h: number;
    avg_pnl_6h: number;
  } | null;
}

export default function ScenarioPanel({
  entryPrice,
  shockDelta,
  positionSize,
  category,
  backtestStats,
}: ScenarioPanelProps) {
  const [targetProb, setTargetProb] = useState(Math.round(entryPrice * 100));
  const [daysToResolution, setDaysToResolution] = useState(30);
  const [scenarioSize, setScenarioSize] = useState(positionSize);

  const fadeDirection = shockDelta > 0 ? "buy_no" : "buy_yes";

  const results = useMemo(() => {
    const p = targetProb / 100;

    let pnlAtTarget: number;
    if (fadeDirection === "buy_no") {
      const costPerShare = 1 - entryPrice;
      const shares = scenarioSize / costPerShare;
      pnlAtTarget = shares * (1 - p) - scenarioSize;
    } else {
      const costPerShare = entryPrice;
      const shares = scenarioSize / costPerShare;
      pnlAtTarget = shares * p - scenarioSize;
    }

    const timeDecayFactor = Math.min(daysToResolution / 30, 1);
    const adjustedWinRate = backtestStats
      ? 0.5 + (backtestStats.win_rate_6h - 0.5) * timeDecayFactor
      : 0.5;
    const adjustedEV = backtestStats
      ? backtestStats.avg_pnl_6h * scenarioSize * timeDecayFactor
      : 0;

    const maxLoss = -scenarioSize;

    return { pnlAtTarget, adjustedWinRate, adjustedEV, maxLoss, timeDecayFactor };
  }, [
    targetProb,
    daysToResolution,
    scenarioSize,
    entryPrice,
    fadeDirection,
    backtestStats,
  ]);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
      <h4 className="text-lg font-semibold text-gray-900">
        Scenario Analysis — What If?
      </h4>
      <p className="mb-4 text-xs text-gray-500">
        Explore how your fade position performs under different assumptions
        {category && ` (${category} market)`}
      </p>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Probability moves to:{" "}
            <span className="font-semibold text-blue-600">{targetProb}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={targetProb}
            onChange={(e) => setTargetProb(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Resolution in:{" "}
            <span className="font-semibold text-blue-600">
              {daysToResolution} days
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={30}
            value={daysToResolution}
            onChange={(e) => setDaysToResolution(Number(e.target.value))}
            className="mt-1 w-full"
          />
          <p className="mt-1 text-xs text-gray-400">
            Edge factor: {(results.timeDecayFactor * 100).toFixed(0)}%
            {daysToResolution < 7 &&
              " — Short horizon, less time for reversion"}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Position:{" "}
            <span className="font-semibold text-blue-600">${scenarioSize}</span>
          </label>
          <input
            type="range"
            min={10}
            max={5000}
            step={10}
            value={scenarioSize}
            onChange={(e) => setScenarioSize(Number(e.target.value))}
            className="mt-1 w-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg bg-white p-3 text-center shadow-sm">
          <p className="text-xs text-gray-500">P&L at {targetProb}%</p>
          <p
            className={`text-lg font-bold ${results.pnlAtTarget >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            ${results.pnlAtTarget.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-3 text-center shadow-sm">
          <p className="text-xs text-gray-500">Adj. Win Rate</p>
          <p className="text-lg font-bold text-gray-900">
            {(results.adjustedWinRate * 100).toFixed(0)}%
          </p>
        </div>
        <div className="rounded-lg bg-white p-3 text-center shadow-sm">
          <p className="text-xs text-gray-500">Adj. Expected Value</p>
          <p
            className={`text-lg font-bold ${results.adjustedEV >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            ${results.adjustedEV.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-3 text-center shadow-sm">
          <p className="text-xs text-gray-500">Max Loss</p>
          <p className="text-lg font-bold text-red-600">
            ${results.maxLoss.toFixed(2)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400">
        Time decay model is a linear approximation. Shorter resolution windows
        reduce the probability of mean reversion playing out. Not investment
        advice.
      </p>
    </div>
  );
}
