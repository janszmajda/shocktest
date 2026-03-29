"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Shock, PricePoint } from "@/lib/types";
import { DashboardFilters } from "@/components/DashboardControls";
import CategoryIcon, { getCategoryColor } from "@/components/CategoryIcon";

interface ShocksTableProps {
  shocks: Shock[];
  seriesMap?: Record<string, PricePoint[]>;
  closeTimeMap?: Record<string, number | null>;
  imageMap?: Record<string, string | null>;
  theta?: number;
  horizon?: "1h" | "6h" | "24h";
  onFilterChange?: (filters: Partial<DashboardFilters>) => void;
  onVisibleIdsChange?: (ids: string[]) => void;
}

type SortKey = "abs_delta" | "t2" | "reversion";
const PAGE_SIZE = 10;

/** Inline SVG sparkline from real price series data */
function MiniSparkline({
  series,
  shock,
}: {
  series: PricePoint[] | undefined;
  shock: Shock;
}) {
  const points: { t: number; p: number }[] = useMemo(() => {
    if (series && series.length >= 2) {
      // Trim series: show data up to ~10% past t2 so the shock dot is near the end
      const t2 = new Date(shock.t2).getTime() / 1000;
      const t1 = new Date(shock.t1).getTime() / 1000;
      const shockDuration = Math.abs(t2 - t1) || 3600;
      const cutoff = t2 + shockDuration * 0.5; // show a little post-shock
      const trimmed = series.filter((pt) => pt.t <= cutoff);
      return trimmed.length >= 2 ? trimmed : series;
    }
    const synth: { t: number; p: number }[] = [
      { t: 0, p: shock.p_before },
      { t: 1, p: shock.p_after },
    ];
    if (shock.post_move_1h !== null)
      synth.push({ t: 2, p: shock.p_after + shock.post_move_1h });
    if (shock.post_move_6h !== null)
      synth.push({ t: 3, p: shock.p_after + shock.post_move_6h });
    if (shock.post_move_24h !== null)
      synth.push({ t: 4, p: shock.p_after + shock.post_move_24h });
    return synth;
  }, [series, shock]);

  const svgData = useMemo(() => {
    if (points.length < 2) return null;

    const w = 300;
    const h = 44;
    const pad = 2;

    const pValues = points.map((pt) => pt.p);
    const min = Math.min(...pValues);
    const max = Math.max(...pValues);
    const range = max - min || 0.01;

    const coords = points.map((pt, i) => ({
      x: pad + (i / (points.length - 1)) * (w - pad * 2),
      y: pad + (1 - (pt.p - min) / range) * (h - pad * 2),
    }));

    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(h - pad).toFixed(1)} L${coords[0].x.toFixed(1)},${(h - pad).toFixed(1)} Z`;

    const dot = coords[coords.length - 1];
    return { w, h, linePath, areaPath, dot };
  }, [points]);

  if (!svgData) return null;

  const isUp = shock.delta > 0;
  const strokeColor = isUp ? "var(--st-yes)" : "var(--st-no)";
  const fillColor = isUp ? "rgba(34,199,138,0.10)" : "rgba(240,92,92,0.10)";

  return (
    <svg viewBox={`0 0 ${svgData.w} ${svgData.h}`} className="block h-10 flex-1" preserveAspectRatio="xMidYMid meet">
      <path d={svgData.areaPath} fill={fillColor} />
      <path
        d={svgData.linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {svgData.dot && (
        <circle
          cx={svgData.dot.x}
          cy={svgData.dot.y}
          r={2.5}
          fill={strokeColor}
        />
      )}
    </svg>
  );
}

function timeAgo(t2: string): string {
  const diffMs = Date.now() - new Date(t2).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ShocksTable({
  shocks,
  seriesMap = {},
  closeTimeMap = {},
  imageMap = {},
  theta = 0.08,
  horizon = "6h",
  onFilterChange,
  onVisibleIdsChange,
}: ShocksTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>("t2");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sorted = useMemo(() => {
    const query = search.toLowerCase().trim();
    let filtered: Shock[];
    if (query) {
      // When searching, show ALL shocks (including old/non-live)
      filtered = shocks.filter(
        (s) =>
          s.question.toLowerCase().includes(query) ||
          (s.category ?? "").toLowerCase().includes(query) ||
          (s.source ?? "").toLowerCase().includes(query),
      );
    } else {
      // Default: only show recent/live shocks
      filtered = shocks.filter(
        (s) => s.is_recent === true || s.is_live_alert === true,
      );
    }

    return [...filtered].sort((a, b) => {
      const aLive = a.is_live_alert === true ? 1 : 0;
      const bLive = b.is_live_alert === true ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;

      const mul = sortDir === "desc" ? -1 : 1;
      if (sortBy === "abs_delta") return mul * (a.abs_delta - b.abs_delta);
      if (sortBy === "t2")
        return mul * (new Date(a.t2).getTime() - new Date(b.t2).getTime());
      if (sortBy === "reversion") {
        const key = `reversion_${horizon}` as keyof Shock;
        return mul * (((a[key] as number) ?? 0) - ((b[key] as number) ?? 0));
      }
      return 0;
    });
  }, [shocks, sortBy, sortDir, search, horizon]);

  const visible = sorted.slice(0, visibleCount);
  const hasMore = visibleCount < sorted.length;

  // Notify parent of currently visible market IDs for lazy sparkline loading
  const visibleIdsKey = useMemo(
    () => Array.from(new Set(visible.map((s) => s.market_id))).sort().join(","),
    [visible],
  );
  useEffect(() => {
    if (onVisibleIdsChange && visibleIdsKey) {
      onVisibleIdsChange(visibleIdsKey.split(","));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey]);

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="mb-3 rounded-lg border border-border bg-surface-1 p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Search */}
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search markets..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="w-44 rounded-md border border-border bg-surface-2 py-1 pl-8 pr-3 text-[11px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-52"
            />
          </div>

          {/* Divider */}
          <div className="hidden h-5 w-px bg-surface-3 sm:block" />

          {/* Sort */}
          <div className="flex gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
            {(
              [
                { key: "t2", label: "Recent" },
                { key: "abs_delta", label: "Largest" },
                { key: "reversion" as SortKey, label: "Reversion" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleSort(opt.key)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  sortBy === opt.key
                    ? "bg-surface-3 text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {opt.label}
                {sortBy === opt.key && (
                  <span className="text-[9px]">{sortDir === "desc" ? "▼" : "▲"}</span>
                )}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="hidden h-5 w-px bg-surface-3 sm:block" />

          {/* Threshold (theta) */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted">Threshold</span>
            <span className="font-mono text-[11px] font-semibold text-accent">
              {(theta * 100).toFixed(0)}pp
            </span>
            <input
              type="range"
              min={0.03}
              max={0.2}
              step={0.01}
              value={theta}
              onChange={(e) =>
                onFilterChange?.({ theta: Number(e.target.value) })
              }
              className="w-20"
            />
          </div>

          {/* Divider */}
          <div className="hidden h-5 w-px bg-surface-3 sm:block" />

          {/* Horizon */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-muted">Horizon</span>
            <div className="flex gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
              {(["1h", "6h", "24h"] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => onFilterChange?.({ horizon: h })}
                  className={`rounded-md px-2 py-1 font-mono text-[11px] font-medium transition-all ${
                    horizon === h
                      ? "bg-accent text-white"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Result count — pushed right */}
          <span className="ml-auto text-[11px] text-text-muted">
            {sorted.length} result{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Cards — 2-column grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {visible.map((shock) => {
          let latestPrice = shock.p_after;
          if (shock.post_move_24h !== null)
            latestPrice = shock.p_after + shock.post_move_24h;
          else if (shock.post_move_6h !== null)
            latestPrice = shock.p_after + shock.post_move_6h;
          else if (shock.post_move_1h !== null)
            latestPrice = shock.p_after + shock.post_move_1h;
          const isResolved = latestPrice <= 0.03 || latestPrice >= 0.97;
          const closeTime = closeTimeMap[shock.market_id];
          const marketClosed = closeTime != null && closeTime < Date.now() / 1000;
          const isLive = !marketClosed && !isResolved;
          const isUp = shock.delta > 0;

          return (
            <Link
              key={shock._id}
              href={`/shock/${shock._id}`}
              className="flex flex-col rounded-lg border border-border bg-surface-1 p-5 transition-all hover:border-border-hover hover:bg-surface-2"
            >
              {/* Top row: badges + time ago */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {isLive && (
                    <span className="inline-flex items-center rounded-full bg-yes-dim px-2 py-0.5 text-[10px] font-medium text-yes-text">
                      LIVE
                    </span>
                  )}
                  {shock.category && (() => {
                    const catColor = getCategoryColor(shock.category);
                    return (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                        style={{ color: catColor.text, backgroundColor: catColor.bg }}
                      >
                        <CategoryIcon category={shock.category} className="h-3 w-3" />
                        {shock.category}
                      </span>
                    );
                  })()}
                  <span className="text-[10px] text-text-muted">
                    {shock.source}
                  </span>
                </div>
                <span className="text-[10px] text-text-muted">
                  {timeAgo(shock.t2)}
                </span>
              </div>

              {/* Title with market image */}
              <div className="flex items-start gap-2.5">
                {imageMap[shock.market_id] ? (
                  <img
                    src={imageMap[shock.market_id]!}
                    alt=""
                    className="mt-0.5 h-8 w-8 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-3">
                    <CategoryIcon category={shock.category} className="h-4 w-4 text-text-muted" />
                  </span>
                )}
                <p className="text-sm font-medium leading-snug text-text-primary">
                  {shock.question}
                </p>
              </div>

              {/* Sparkline preview */}
              <div className="mt-3 flex items-end justify-between gap-3">
                <MiniSparkline
                  series={seriesMap[shock.market_id]}
                  shock={shock}
                />
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className={`font-mono text-lg font-medium leading-none ${isUp ? "text-yes-text" : "text-no-text"}`}
                  >
                    {isUp ? "+" : "-"}
                    {(Math.abs(shock.delta) * 100).toFixed(0)}
                    <span className="text-[10px]">pp</span>
                  </span>
                  {(() => {
                    const revKey = `reversion_${horizon}` as keyof Shock;
                    const rev = shock[revKey] as number | null;
                    return rev !== null ? (
                      <span
                        className={`font-mono text-[10px] ${rev > 0 ? "text-yes-text" : "text-no-text"}`}
                      >
                        {rev > 0 ? "+" : ""}
                        {(rev * 100).toFixed(1)}pp rev ({horizon})
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Bottom: probability range */}
              <p className="mt-2 font-mono text-[10px] text-text-muted">
                {(shock.p_before * 100).toFixed(0)}% &rarr;{" "}
                {(shock.p_after * 100).toFixed(0)}%
              </p>
            </Link>
          );
        })}
      </div>

      {/* Show more */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          className="mt-3 w-full rounded-lg border border-border bg-surface-1 py-2.5 text-xs font-medium text-text-secondary transition-all hover:bg-surface-2 hover:text-text-primary"
        >
          Show {PAGE_SIZE} more &middot; {sorted.length - visibleCount} remaining
        </button>
      )}
    </div>
  );
}
