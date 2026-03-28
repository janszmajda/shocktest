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
    <div className="flex flex-wrap items-end gap-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="min-w-[200px]">
        <label className="block text-sm font-medium text-gray-700">
          Shock Threshold (θ):{" "}
          <span className="font-semibold text-blue-600">
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
        <div className="flex justify-between text-xs text-gray-400">
          <span>3pp</span>
          <span>20pp</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
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
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
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

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            emitChange(theta, horizon, e.target.value);
          }}
          className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
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
