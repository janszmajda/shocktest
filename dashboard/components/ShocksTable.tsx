"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Shock } from "@/lib/types";

interface ShocksTableProps {
  shocks: Shock[];
}

type SortKey = "abs_delta" | "t2" | "category" | "source" | "reversion_6h";

export default function ShocksTable({ shocks }: ShocksTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>("abs_delta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categories = useMemo(() => {
    const cats = new Set(shocks.map((s) => s.category).filter(Boolean));
    return ["all", ...Array.from(cats)];
  }, [shocks]);

  const sorted = useMemo(() => {
    const filtered =
      categoryFilter === "all"
        ? shocks
        : shocks.filter((s) => s.category === categoryFilter);

    return [...filtered].sort((a, b) => {
      const mul = sortDir === "desc" ? -1 : 1;
      if (sortBy === "abs_delta") return mul * (a.abs_delta - b.abs_delta);
      if (sortBy === "t2")
        return mul * (new Date(a.t2).getTime() - new Date(b.t2).getTime());
      if (sortBy === "reversion_6h")
        return mul * ((a.reversion_6h ?? 0) - (b.reversion_6h ?? 0));
      if (sortBy === "category")
        return mul * (a.category ?? "").localeCompare(b.category ?? "");
      if (sortBy === "source") return mul * a.source.localeCompare(b.source);
      return 0;
    });
  }, [shocks, sortBy, sortDir, categoryFilter]);

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  }

  function formatDelta(val: number): string {
    const sign = val > 0 ? "+" : "";
    return `${sign}${(val * 100).toFixed(1)}pp`;
  }

  function formatReversion(val: number | null): string {
    if (val === null) return "—";
    return `${(val * 100).toFixed(1)}pp`;
  }

  function sortIndicator(key: SortKey): string {
    if (sortBy !== key) return "";
    return sortDir === "desc" ? " ↓" : " ↑";
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Detected Shocks
        </h2>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          {categories.map((c) => (
            <option key={c} value={c!}>
              {c === "all" ? "All categories" : c}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Market
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("source")}
              >
                Source{sortIndicator("source")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("category")}
              >
                Category{sortIndicator("category")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("abs_delta")}
              >
                Delta{sortIndicator("abs_delta")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("t2")}
              >
                Time{sortIndicator("t2")}
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("reversion_6h")}
              >
                6h Reversion{sortIndicator("reversion_6h")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sorted.map((shock) => (
              <tr key={shock._id} className="hover:bg-gray-50">
                <td className="max-w-xs truncate px-4 py-3 text-sm">
                  <Link
                    href={`/shock/${shock._id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {shock.question}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {shock.source}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm">
                  <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {shock.category ?? "—"}
                  </span>
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium ${shock.delta > 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {formatDelta(shock.delta)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                  {(() => {
                    const hoursAgo =
                      (Date.now() - new Date(shock.t2).getTime()) / 3600000;
                    if (hoursAgo < 48) {
                      return (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 animate-pulse">
                            LIVE
                          </span>
                          {Math.round(hoursAgo)}h ago
                        </span>
                      );
                    }
                    return new Date(shock.t2).toLocaleDateString();
                  })()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                  {formatReversion(shock.reversion_6h)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
