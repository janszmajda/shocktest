"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import PortfolioBuilder from "@/components/PortfolioBuilder";
import CategoryIcon, { getCategoryColor } from "@/components/CategoryIcon";
import LoadingSpinner from "@/components/LoadingSpinner";
import Footer from "@/components/Footer";
import { DUMMY_STATS } from "@/lib/dummyData";
import { Shock, AggregateStats, PricePoint } from "@/lib/types";
import { cachedFetch, invalidate } from "@/lib/fetchCache";

/* ── Helpers ── */

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

/** Inline SVG sparkline — identical to ShocksTable's MiniSparkline */
function MiniSparkline({
  series,
  shock,
}: {
  series: PricePoint[] | undefined;
  shock: Shock;
}) {
  const points: { t: number; p: number }[] = useMemo(() => {
    if (series && series.length >= 2) {
      const t2 = new Date(shock.t2).getTime() / 1000;
      const t1 = new Date(shock.t1).getTime() / 1000;
      const shockDuration = Math.abs(t2 - t1) || 3600;
      const cutoff = t2 + shockDuration * 0.5;
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
      .map(
        (c, i) =>
          `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`,
      )
      .join(" ");
    const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(h - pad).toFixed(1)} L${coords[0].x.toFixed(1)},${(h - pad).toFixed(1)} Z`;
    const dot = coords[coords.length - 1];
    return { w, h, linePath, areaPath, dot };
  }, [points]);

  if (!svgData) return null;

  const isUp = shock.delta > 0;
  const strokeColor = isUp ? "var(--st-yes)" : "var(--st-no)";
  const fillColor = isUp
    ? "rgba(34,199,138,0.10)"
    : "rgba(240,92,92,0.10)";

  return (
    <svg
      viewBox={`0 0 ${svgData.w} ${svgData.h}`}
      className="block h-10 flex-1"
      preserveAspectRatio="xMidYMid meet"
    >
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

/** Reusable shock card for Sections 2 & 6 */
function ShockCard({
  shock,
  series,
  imageUrl,
  closeTime,
  horizon,
  now,
}: {
  shock: Shock;
  series?: PricePoint[];
  imageUrl?: string | null;
  closeTime?: number | null;
  horizon: "1h" | "6h" | "24h";
  now: number;
}) {
  let latestPrice = shock.p_after;
  if (shock.post_move_24h !== null)
    latestPrice = shock.p_after + shock.post_move_24h;
  else if (shock.post_move_6h !== null)
    latestPrice = shock.p_after + shock.post_move_6h;
  else if (shock.post_move_1h !== null)
    latestPrice = shock.p_after + shock.post_move_1h;
  const isResolved = latestPrice <= 0.03 || latestPrice >= 0.97;
  const marketClosed = closeTime != null && closeTime < now / 1000;
  const isLive = !marketClosed && !isResolved;
  const isUp = shock.delta > 0;
  const catColor = shock.category ? getCategoryColor(shock.category) : null;

  return (
    <Link
      href={`/shock/${shock._id}`}
      className="flex flex-col rounded-lg border border-border bg-surface-1 p-5 transition-all hover:border-border-hover hover:bg-surface-2"
    >
      {/* Top row: badges + time ago */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isLive && shock.is_live_alert && (
            <span className="inline-flex items-center rounded-full bg-no-dim px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-no-text">
              Live
            </span>
          )}
          {shock.category && catColor && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
              style={{ color: catColor.text, backgroundColor: catColor.bg }}
            >
              <CategoryIcon category={shock.category} className="h-3 w-3" />
              {shock.category}
            </span>
          )}
          <span className="text-[10px] text-text-muted">{shock.source}</span>
        </div>
        <span className="text-[10px] text-text-muted">
          {timeAgo(shock.t2)}
        </span>
      </div>

      {/* Title with market image */}
      <div className="flex items-start gap-2.5">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt=""
            className="mt-0.5 h-8 w-8 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-3">
            <CategoryIcon
              category={shock.category}
              className="h-4 w-4 text-text-muted"
            />
          </span>
        )}
        <p className="text-sm font-medium leading-snug text-text-primary">
          {shock.question}
        </p>
      </div>

      {/* Sparkline + delta */}
      <div className="mt-3 flex items-end justify-between gap-3">
        <MiniSparkline series={series} shock={shock} />
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

      {/* Probability range */}
      <p className="mt-2 font-mono text-[10px] text-text-muted">
        {(shock.p_before * 100).toFixed(0)}% &rarr;{" "}
        {(shock.p_after * 100).toFixed(0)}%
      </p>
    </Link>
  );
}

/** Circular progress ring that fills over `durationMs` then resets */
function CountdownRing({ durationMs }: { durationMs: number }) {
  const [progress, setProgress] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = Date.now();
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / durationMs, 1);
      setProgress(pct);
      if (pct >= 1) {
        // Reset after full cycle
        startRef.current = Date.now();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);

  const r = 22;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);
  const secs = Math.max(0, Math.ceil((durationMs - progress * durationMs) / 1000));

  return (
    <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center">
      <svg width={52} height={52} className="-rotate-90">
        {/* Track */}
        <circle
          cx={26}
          cy={26}
          r={r}
          fill="none"
          stroke="var(--st-s3)"
          strokeWidth={3}
        />
        {/* Progress */}
        <circle
          cx={26}
          cy={26}
          r={r}
          fill="none"
          stroke="var(--st-yes)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.3s linear" }}
        />
      </svg>
      <span className="absolute font-mono text-[11px] text-text-muted">
        {secs}s
      </span>
    </div>
  );
}

/* ── Main Page ── */

export default function Home() {
  /* === Shared state === */
  const [allShocks, setAllShocks] = useState<Shock[]>([]);
  const [stats, setStats] = useState<AggregateStats>(DUMMY_STATS);
  const [loading, setLoading] = useState(true);
  const [usingDummy, setUsingDummy] = useState(false);
  const [seriesMap, setSeriesMap] = useState<Record<string, PricePoint[]>>({});
  const [closeTimeMap, setCloseTimeMap] = useState<
    Record<string, number | null>
  >({});
  const [imageMap, setImageMap] = useState<Record<string, string | null>>({});
  const [now] = useState(() => Date.now());
  const [lastScanText, setLastScanText] = useState("");

  /* Sparkline lazy-loading */
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIdsRef = useRef<string[]>([]);

  const fetchMiniSeries = useCallback((ids: string[]) => {
    const missing = ids.filter((id) => !fetchedIdsRef.current.has(id));
    if (missing.length === 0) return;
    pendingIdsRef.current = Array.from(
      new Set([...pendingIdsRef.current, ...missing]),
    );
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const toFetch = pendingIdsRef.current.filter(
        (id) => !fetchedIdsRef.current.has(id),
      );
      pendingIdsRef.current = [];
      if (toFetch.length === 0) return;
      for (const id of toFetch) fetchedIdsRef.current.add(id);
      fetch(`/api/markets/mini-series?ids=${toFetch.join(",")}`)
        .then((r) => (r.ok ? r.json() : {}))
        .then((result) => {
          const ms: Record<string, PricePoint[]> = {};
          const mc: Record<string, number | null> = {};
          const mi: Record<string, string | null> = {};
          for (const [k, v] of Object.entries(result)) {
            const entry = v as {
              series: PricePoint[];
              close_time: number | null;
              image_url: string | null;
            };
            ms[k] = entry.series;
            mc[k] = entry.close_time;
            mi[k] = entry.image_url;
          }
          setSeriesMap((prev) => ({ ...prev, ...ms }));
          setCloseTimeMap((prev) => ({ ...prev, ...mc }));
          setImageMap((prev) => ({ ...prev, ...mi }));
        })
        .catch(() => {});
    }, 300);
  }, []);

  /* Data fetching — every 60 seconds */
  const fetchData = useCallback(() => {
    // Invalidate cache so we get fresh data each poll
    invalidate("/api/shocks");
    Promise.all([
      cachedFetch<Shock[]>("/api/shocks")
        .then((data) => {
          setAllShocks(data);
          return data.length > 0;
        })
        .catch(() => false),
      cachedFetch<AggregateStats>("/api/stats")
        .then((data) => {
          if (data.total_shocks > 0) {
            setStats(data);
            return true;
          }
          return false;
        })
        .catch(() => false),
    ]).then(([shocksOk, statsOk]) => {
      setUsingDummy(!shocksOk && !statsOk);
      setLoading(false);
      setLastScanText("just now");
    });
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // 60s refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  /* === Section 2: Featured shocks === */
  const featuredShocks = useMemo(() => {
    return [...allShocks]
      .filter((s) => s.p_after > 0.01 && s.p_after < 0.99)
      .sort((a, b) => {
        const aLive = a.is_live_alert ? 1 : 0;
        const bLive = b.is_live_alert ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        const aTime = a.detected_at
          ? new Date(a.detected_at).getTime()
          : new Date(a.t2).getTime();
        const bTime = b.detected_at
          ? new Date(b.detected_at).getTime()
          : new Date(b.t2).getTime();
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [allShocks]);

  // Fetch featured sparklines
  useEffect(() => {
    if (featuredShocks.length > 0) {
      fetchMiniSeries(featuredShocks.map((s) => s.market_id));
    }
  }, [featuredShocks, fetchMiniSeries]);

  /* === Section 5: AI analysis preview === */
  const aiPreview = useMemo(() => {
    return allShocks.find(
      (s) =>
        s.ai_analysis &&
        s.ai_analysis.likely_cause &&
        s.ai_analysis.reversion_confidence === "high",
    );
  }, [allShocks]);

  /* === Section 6: All shocks grid with infinite scroll === */
  const GRID_PAGE_SIZE = 20;
  const [gridCategory, setGridCategory] = useState<string>("all");
  const [gridVisibleCount, setGridVisibleCount] = useState(GRID_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const gridShocks = useMemo(() => {
    return [...allShocks]
      .filter((s) => {
        if (s.p_after <= 0.01 || s.p_after >= 0.99) return false;
        if (gridCategory !== "all" && s.category !== gridCategory) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a.detected_at
          ? new Date(a.detected_at).getTime()
          : new Date(a.t2).getTime();
        const bTime = b.detected_at
          ? new Date(b.detected_at).getTime()
          : new Date(b.t2).getTime();
        return bTime - aTime;
      });
  }, [allShocks, gridCategory]);

  const gridVisible = gridShocks.slice(0, gridVisibleCount);
  const gridHasMore = gridVisibleCount < gridShocks.length;

  // Fetch sparklines for visible grid cards
  useEffect(() => {
    if (gridVisible.length > 0) {
      fetchMiniSeries(gridVisible.map((s) => s.market_id));
    }
  }, [gridVisible, fetchMiniSeries]);

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && gridHasMore) {
          setGridVisibleCount((prev) => prev + GRID_PAGE_SIZE);
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [gridHasMore]);

  const handleGridCategoryChange = useCallback((cat: string) => {
    setGridCategory(cat);
    setGridVisibleCount(GRID_PAGE_SIZE);
  }, []);

  /* All known categories (from stats, which has the full dataset) */
  const allCategories = useMemo(() => {
    const fromStats = stats.by_category ? Object.keys(stats.by_category) : [];
    const fromShocks = allShocks
      .map((s) => s.category)
      .filter((c): c is string => !!c);
    return Array.from(new Set([...fromStats, ...fromShocks])).sort();
  }, [stats, allShocks]);

  /* Category counts from the current (last-hour) shocks only */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of allShocks) {
      if (s.p_after <= 0.01 || s.p_after >= 0.99) continue;
      const cat = s.category ?? "other";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [allShocks]);

  const totalShockCount = Object.values(categoryCounts).reduce(
    (a, b) => a + b,
    0,
  );

  const marketCount = stats.total_markets || 0;

  const noShocks = !loading && allShocks.length === 0 && !usingDummy;

  if (loading) {
    return (
      <>
        <nav className="sticky top-0 z-50 border-b border-border bg-surface-base">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <Image
              src="/Frame 9.svg"
              alt="ShockTEST"
              width={120}
              height={80}
              className="h-11 w-auto"
              priority
            />
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-20">
          <LoadingSpinner />
        </main>
      </>
    );
  }

  return (
    <>
      {/* ── SECTION 1: Sticky Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-border bg-surface-base">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Image
            src="/Frame 9.svg"
            alt="ShockTEST"
            width={120}
            height={80}
            className="h-11 w-auto"
            priority
          />
          <div />
        </div>
      </nav>

      <main>
        {usingDummy && (
          <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
            <div className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-center text-[11px] text-text-muted">
              Showing dummy data — real data will appear once the analysis
              pipeline runs.
            </div>
          </div>
        )}

        {/* ── Empty state when no shocks in the last hour ── */}
        {noShocks ? (
          <section className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
            <div className="mx-auto max-w-md">
              <CountdownRing durationMs={60000} />
              <p className="text-sm text-text-secondary">
                No shocks detected in the last hour.
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Markets are quiet — check back soon.
              </p>
              <p className="mt-4 text-[11px] text-text-muted">
                Monitoring {marketCount > 0 ? marketCount.toLocaleString() : "..."} markets
                {lastScanText && <> &middot; Last scan: {lastScanText}</>}
              </p>
            </div>
          </section>
        ) : (
          <>
            {/* ── SECTION 2: Featured Shocks ── */}
            {featuredShocks.length > 0 && (
              <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                <div
                  className={`grid gap-5 ${
                    featuredShocks.length >= 3
                      ? "grid-cols-1 md:grid-cols-3"
                      : featuredShocks.length === 2
                        ? "grid-cols-1 md:grid-cols-2"
                        : "grid-cols-1 md:max-w-md"
                  }`}
                >
                  {featuredShocks.map((shock) => (
                    <ShockCard
                      key={shock._id}
                      shock={shock}
                      series={seriesMap[shock.market_id]}
                      imageUrl={imageMap[shock.market_id]}
                      closeTime={closeTimeMap[shock.market_id]}
                      horizon="6h"
                      now={now}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── SECTION 3: Explainer Text ── */}
            <section className="mx-auto max-w-7xl px-4 py-8 text-center sm:px-6 lg:px-8">
              <p className="text-sm text-text-muted">
                ShockTest detects sudden probability moves on Polymarket and
                analyzes whether they&apos;re overreactions. Browse live shocks
                below, build a fade portfolio, or click any market for deep
                analysis.
              </p>
            </section>

            {/* ── SECTION 4: Portfolio Builder ── */}
            <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <PortfolioBuilder allShocks={allShocks} />
            </section>

            {/* ── SECTION 5: AI Analysis Bar ── */}
            <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="rounded-lg bg-surface-2 px-6 py-5">
                {aiPreview?.ai_analysis ? (
                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-dim">
                      <svg
                        className="h-4 w-4 text-accent"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-text-primary">
                        AI Insight &mdash; {aiPreview.question}
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {aiPreview.ai_analysis.likely_cause}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        Reversion confidence:{" "}
                        <span
                          className={
                            aiPreview.ai_analysis.reversion_confidence ===
                            "high"
                              ? "font-semibold text-yes-text"
                              : aiPreview.ai_analysis
                                    .reversion_confidence === "medium"
                                ? "font-semibold text-text-secondary"
                                : "font-semibold text-no-text"
                          }
                        >
                          {aiPreview.ai_analysis.reversion_confidence}
                        </span>
                      </p>
                    </div>
                    <Link
                      href={`/shock/${aiPreview._id}`}
                      className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    >
                      Analyze
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 py-2">
                    <svg
                      className="h-4 w-4 text-text-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <p className="text-sm text-text-muted">
                      Select shocks above to get AI-powered portfolio analysis
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* ── SECTION 6: All Shocks Grid ── */}
            <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <div className="flex gap-6">
                {/* Category sidebar */}
                <aside className="hidden w-48 shrink-0 lg:block">
                  <div className="sticky top-20">
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      Categories
                    </h3>
                    <ul className="space-y-0.5">
                      <li>
                        <button
                          onClick={() => handleGridCategoryChange("all")}
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-all ${
                            gridCategory === "all"
                              ? "border-l-2 border-accent bg-surface-2 font-semibold text-text-primary"
                              : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                          }`}
                        >
                          <span>All</span>
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-text-muted">
                            {totalShockCount}
                          </span>
                        </button>
                      </li>
                      {allCategories.map((cat) => {
                        const count = categoryCounts[cat] ?? 0;
                        const hasShocks = count > 0;
                        return (
                          <li key={cat}>
                            <button
                              onClick={() => handleGridCategoryChange(cat)}
                              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-all ${
                                gridCategory === cat
                                  ? "border-l-2 border-accent bg-surface-2 font-semibold text-text-primary"
                                  : hasShocks
                                    ? "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                                    : "text-text-muted opacity-50"
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span
                                  style={{
                                    color: hasShocks
                                      ? getCategoryColor(cat).text
                                      : undefined,
                                  }}
                                >
                                  <CategoryIcon
                                    category={cat}
                                    className="h-3.5 w-3.5"
                                  />
                                </span>
                                {cat}
                              </span>
                              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-text-muted">
                                {count}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </aside>

                {/* Mobile category select */}
                <div className="mb-4 w-full lg:hidden">
                  <select
                    value={gridCategory}
                    onChange={(e) => handleGridCategoryChange(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="all">All ({totalShockCount})</option>
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat} ({categoryCounts[cat] ?? 0})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Grid of shock cards with infinite scroll */}
                <div className="min-w-0 flex-1">
                  {gridShocks.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {gridVisible.map((shock) => (
                          <ShockCard
                            key={shock._id}
                            shock={shock}
                            series={seriesMap[shock.market_id]}
                            imageUrl={imageMap[shock.market_id]}
                            closeTime={closeTimeMap[shock.market_id]}
                            horizon="6h"
                            now={now}
                          />
                        ))}
                      </div>
                      {gridHasMore && (
                        <div ref={sentinelRef} className="py-8 text-center">
                          <span className="text-xs text-text-muted">
                            Loading more shocks...
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-16 text-center text-sm text-text-muted">
                      No shocks in this category in the last hour
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
