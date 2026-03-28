"use client";

import { useState } from "react";
import Link from "next/link";
import { Shock } from "@/lib/types";

interface ShocksTableProps {
  shocks: Shock[];
}

type SortKey = "abs_delta" | "category" | "source" | "reversion_6h";

export default function ShocksTable({ shocks }: ShocksTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("abs_delta");
  const [sortAsc, setSortAsc] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const categories = [
    "all",
    ...Array.from(new Set(shocks.map((s) => s.category).filter(Boolean))),
  ];

  const filtered =
    filterCategory === "all"
      ? shocks
      : shocks.filter((s) => s.category === filterCategory);

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortKey] ?? 0;
    const bVal = b[sortKey] ?? 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Detected Shocks
        </h2>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
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
                Source
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("category")}
              >
                Category
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("abs_delta")}
              >
                Delta
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Time
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700"
                onClick={() => handleSort("reversion_6h")}
              >
                6h Reversion
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
                  {new Date(shock.t2).toLocaleDateString()}
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
