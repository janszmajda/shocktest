"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Shock } from "@/lib/types";

interface ShocksTableProps {
  shocks: Shock[];
}

type SortKey = "abs_delta" | "t2" | "reversion_6h";

export default function ShocksTable({ shocks }: ShocksTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>("t2");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const mostRecentT2 = useMemo(() => {
    if (shocks.length === 0) return 0;
    return Math.max(...shocks.map((s) => new Date(s.t2).getTime()));
  }, [shocks]);

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
      // Live alerts always sort to the top
      const aLive = a.is_live_alert === true ? 1 : 0;
      const bLive = b.is_live_alert === true ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;

      const mul = sortDir === "desc" ? -1 : 1;
      if (sortBy === "abs_delta") return mul * (a.abs_delta - b.abs_delta);
      if (sortBy === "t2")
        return mul * (new Date(a.t2).getTime() - new Date(b.t2).getTime());
      if (sortBy === "reversion_6h")
        return mul * ((a.reversion_6h ?? 0) - (b.reversion_6h ?? 0));
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

  return (
    <div>
      {/* Header with sort + filter */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-text-primary">
          Detected Shocks
        </span>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-lg border border-border bg-surface-1 p-0.5">
            {(
              [
                { key: "t2", label: "Recent" },
                { key: "abs_delta", label: "Largest" },
                { key: "reversion_6h", label: "Reversion" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSort(opt.key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  sortBy === opt.key
                    ? "bg-surface-2 text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-[11px] text-text-secondary"
          >
            {categories.map((c) => (
              <option key={c} value={c!}>
                {c === "all" ? "All" : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-1.5">
        {sorted.map((shock) => {
          const isRecent =
            (mostRecentT2 - new Date(shock.t2).getTime()) / 3600000 < 48;
          // Compute the latest known price from available post-move data
          let latestPrice = shock.p_after;
          if (shock.post_move_24h !== null)
            latestPrice = shock.p_after + shock.post_move_24h;
          else if (shock.post_move_6h !== null)
            latestPrice = shock.p_after + shock.post_move_6h;
          else if (shock.post_move_1h !== null)
            latestPrice = shock.p_after + shock.post_move_1h;
          // Market is resolved if latest price is near 0% or 100%
          const isResolved = latestPrice <= 0.03 || latestPrice >= 0.97;
          // Live = no full outcome data yet AND not resolved to an extreme
          const isLive =
            shock.reversion_24h === null && !isResolved;
          const isUp = shock.delta > 0;

          return (
            <Link
              key={shock._id}
              href={`/shock/${shock._id}`}
              className="block rounded-lg border border-border bg-surface-1 p-4 transition-all hover:border-border-hover hover:bg-surface-2"
            >
              <div className="flex items-start justify-between">
                {/* Left: meta + title + volume */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    {isLive && (
                      <span className="inline-flex items-center rounded-full bg-yes-dim px-2 py-0.5 text-[10px] font-medium text-yes-text">
                        LIVE
                      </span>
                    )}
                    {!isLive && isRecent && (
                      <span className="inline-flex items-center rounded-full bg-accent-dim px-2 py-0.5 text-[10px] font-medium text-accent">
                        RECENT
                      </span>
                    )}
                    {shock.category && (
                      <span className="inline-flex rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                        {shock.category}
                      </span>
                    )}
                    <span className="text-[10px] text-text-muted">
                      {shock.source}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-snug text-text-primary">
                    {shock.question}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-text-muted">
                    {new Date(shock.t2).toLocaleDateString()} &middot;{" "}
                    {(shock.p_before * 100).toFixed(0)}% &rarr;{" "}
                    {(shock.p_after * 100).toFixed(0)}%
                  </p>
                </div>

                {/* Right: delta hero number */}
                <div className="ml-4 flex flex-col items-end gap-1">
                  <span
                    className={`font-mono text-xl font-medium ${isUp ? "text-yes-text" : "text-no-text"}`}
                  >
                    {isUp ? "+" : "-"}
                    {(Math.abs(shock.delta) * 100).toFixed(0)}
                    <span className="text-xs">pp</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">
                    Delta
                  </span>
                  {shock.reversion_6h !== null && (
                    <span
                      className={`mt-1 font-mono text-xs ${shock.reversion_6h > 0 ? "text-yes-text" : "text-no-text"}`}
                    >
                      {shock.reversion_6h > 0 ? "+" : ""}
                      {(shock.reversion_6h * 100).toFixed(1)}pp rev
                    </span>
                  )}
                </div>
              </div>

              {/* Probability bar */}
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${shock.p_after * 100}%`,
                    background: `linear-gradient(90deg, ${isUp ? "var(--yes)" : "var(--no)"} 0%, ${isUp ? "rgba(34,199,138,0.6)" : "rgba(240,92,92,0.6)"} 100%)`,
                  }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
