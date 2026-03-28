"use client";

import { useState } from "react";

export interface DashboardFilters {
  theta: number;
  horizon: "1h" | "6h" | "24h";
  category: string;
}

interface DashboardControlsProps {
  categories: string[];
  onFilterChange: (filters: DashboardFilters) => void;
}

export default function DashboardControls({
  categories,
  onFilterChange,
}: DashboardControlsProps) {
  const [theta, setTheta] = useState(0.08);
  const [horizon, setHorizon] = useState<"1h" | "6h" | "24h">("6h");
  const [category, setCategory] = useState("all");

  function emitChange(
    newTheta: number,
    newHorizon: "1h" | "6h" | "24h",
    newCategory: string,
  ) {
    onFilterChange({
      theta: newTheta,
      horizon: newHorizon,
      category: newCategory,
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-surface-1 p-4">
      <div className="min-w-[200px]">
        <label className="block text-xs font-medium text-text-secondary">
          Shock Threshold (θ):{" "}
          <span className="font-mono font-semibold text-accent">
            {(theta * 100).toFixed(0)}pp
          </span>
        </label>
        <input
          type="range"
          min={0.03}
          max={0.2}
          step={0.01}
          value={theta}
          onChange={(e) => {
            const val = Number(e.target.value);
            setTheta(val);
            emitChange(val, horizon, category);
          }}
          className="mt-1 w-full"
        />
        <div className="flex justify-between text-xs text-text-muted">
          <span>3pp</span>
          <span>20pp</span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary">
          Horizon
        </label>
        <div className="mt-1 flex gap-1">
          {(["1h", "6h", "24h"] as const).map((h) => (
            <button
              key={h}
              onClick={() => {
                setHorizon(h);
                emitChange(theta, h, category);
              }}
              className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium ${
                horizon === h
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            emitChange(theta, horizon, e.target.value);
          }}
          className="mt-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-secondary"
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
