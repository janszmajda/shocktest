"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import PortfolioBuilder from "@/components/PortfolioBuilder";
import CategoryIcon, { getCategoryColor } from "@/components/CategoryIcon";
import LoadingSpinner from "@/components/LoadingSpinner";
import Footer from "@/components/Footer";
import { DUMMY_STATS, DUMMY_SHOCKS } from "@/lib/dummyData";
import { Shock, AggregateStats, PricePoint } from "@/lib/types";
import { cachedFetch, invalidate } from "@/lib/fetchCache";

/* ── Helpers ── */

const ROTATING_WORDS = ["panic", "shock", "spike", "outlier"];

function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % ROTATING_WORDS.length);
        setFading(false);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="text-accent inline-block transition-opacity duration-300"
      style={{ opacity: fading ? 0 : 1 }}
    >
      {ROTATING_WORDS[index]}
    </span>
  );
}

/** Continuously rotating carousel — shows 3 cards, edges fade out.
 *  When there are 3 or fewer cards, they sit stationary (no animation). */
function CardCarousel({ children }: { children: React.ReactNode[] }) {
  const count = children.length;
  const CARD_WIDTH = 320;
  const GAP = 20;
  const STEP = CARD_WIDTH + GAP;
  const VISIBLE = 3;
  const containerWidth = VISIBLE * CARD_WIDTH + (VISIBLE - 1) * GAP;
  const shouldAnimate = count > 3;

  // Double the children for seamless looping (only needed when animating)
  const items = shouldAnimate ? [...children, ...children] : children;

  const [offset, setOffset] = useState(0);
  const rafRef = useRef(0);
  const offsetRef = useRef(0);
  const totalWidth = count * STEP;

  useEffect(() => {
    if (!shouldAnimate) return;
    const speed = 0.3; // px per frame (~18px/s at 60fps)
    const tick = () => {
      offsetRef.current = (offsetRef.current + speed) % totalWidth;
      setOffset(offsetRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [totalWidth, shouldAnimate]);

  // Static layout for 1–3 cards: centered, no fade overlays
  if (!shouldAnimate) {
    const staticWidth = count * CARD_WIDTH + (count - 1) * GAP;
    return (
      <div className="relative mx-auto flex justify-center" style={{ height: 260 }}>
        <div className="flex" style={{ gap: GAP }}>
          {children.map((child, i) => (
            <div key={i} className="shrink-0" style={{ width: CARD_WIDTH }}>
              {child}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative mx-auto" style={{ width: containerWidth, height: 260, overflow: "hidden" }}>
      {/* Left fade */}
      <div
        className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24"
        style={{ background: "linear-gradient(to right, var(--st-bg), transparent)" }}
      />
      {/* Right fade */}
      <div
        className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24"
        style={{ background: "linear-gradient(to left, var(--st-bg), transparent)" }}
      />
      {/* Scrolling track */}
      <div
        className="absolute top-0 flex"
        style={{
          gap: GAP,
          transform: `translateX(${-offset}px)`,
          willChange: "transform",
        }}
      >
        {items.map((child, i) => (
          <div key={i} className="shrink-0" style={{ width: CARD_WIDTH }}>
            {child}
          </div>
        ))}
      </div>
    </div>
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
    const valid = points.filter((pt) => isFinite(pt.p));
    if (valid.length < 2) return null;
    const w = 300;
    const h = 44;
    const pad = 2;
    const pValues = valid.map((pt) => pt.p);
    const min = Math.min(...pValues);
    const max = Math.max(...pValues);
    const range = max - min || 0.01;
    const coords = valid.map((pt, i) => ({
      x: pad + (i / (valid.length - 1)) * (w - pad * 2),
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
      className="shock-card flex flex-col rounded-lg bg-surface-1 p-5 transition-all hover:translate-y-0.5 hover:shadow-none shadow-sm"
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

      {/* Title with market image — min-h ensures uniform card height */}
      <div className="flex min-h-[2.75rem] items-start gap-2.5">
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

/** Circular progress ring that matches LoadingSpinner style — fills over `durationMs` then resets.
 *  Shows a brief spinning animation when the timer completes before restarting. */
function CountdownRing({ durationMs }: { durationMs: number }) {
  const [progress, setProgress] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = Date.now();
    let raf: number;
    let spinTimeout: ReturnType<typeof setTimeout> | null = null;
    let isSpin = false;
    const tick = () => {
      if (isSpin) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / durationMs, 1);
      setProgress(pct);
      if (pct >= 1) {
        isSpin = true;
        setSpinning(true);
        spinTimeout = setTimeout(() => {
          isSpin = false;
          setSpinning(false);
          setProgress(0);
          startRef.current = Date.now();
        }, 2000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (spinTimeout) clearTimeout(spinTimeout);
    };
  }, [durationMs]);

  const size = 32;
  const strokeW = 4;
  const r = (size - strokeW) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = spinning ? 0 : circumference * (1 - progress);
  const secs = Math.max(0, Math.ceil((durationMs - progress * durationMs) / 1000));

  return (
    <div className="mx-auto mb-6 flex flex-col items-center gap-2">
      {spinning ? (
        /* Spinning loader — same as LoadingSpinner */
        <div
          className="h-8 w-8 animate-spin rounded-full"
          style={{
            border: "4px solid var(--st-border)",
            borderTopColor: "var(--st-accent)",
          }}
        />
      ) : (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--st-border)"
              strokeWidth={strokeW}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="var(--st-accent)"
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
        </div>
      )}
      <span className="text-[11px] text-text-muted">
        {spinning ? "scanning..." : `${secs}s`}
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

  /* Data fetching — every 120s (matches live_monitor poll cycle) */
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
    });
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000); // 120s refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  /* Filter out resolved markets using latest available price data */
  const liveShocks = useMemo(() => {
    return allShocks.filter((s) => {
      // Check series data first (most up-to-date)
      const series = seriesMap[s.market_id];
      if (series && series.length > 0) {
        const latestP = series[series.length - 1].p;
        if (latestP <= 0.01 || latestP >= 0.99) return false;
      }
      // Check close time
      const closeTime = closeTimeMap[s.market_id];
      if (closeTime != null && closeTime < now / 1000) return false;
      // Check post_move fields as fallback
      let currentP = s.p_after;
      if (s.post_move_24h != null) currentP = s.p_after + s.post_move_24h;
      else if (s.post_move_6h != null) currentP = s.p_after + s.post_move_6h;
      else if (s.post_move_1h != null) currentP = s.p_after + s.post_move_1h;
      if (currentP <= 0.01 || currentP >= 0.99) return false;
      return true;
    });
  }, [allShocks, seriesMap, closeTimeMap, now]);

  /* === Section 2: Featured shocks === */
  const featuredShocks = useMemo(() => {
    const live = [...liveShocks]
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
      .slice(0, 5);
    if (live.length > 0) return live;
    // Strip reversion/post-move data from dummies so they match live card appearance
    return DUMMY_SHOCKS.slice(0, 5).map((s) => ({
      ...s,
      reversion_1h: null,
      reversion_6h: null,
      reversion_24h: null,
      post_move_1h: null,
      post_move_6h: null,
      post_move_24h: null,
    }));
  }, [liveShocks]);

  // Fetch featured sparklines
  useEffect(() => {
    if (featuredShocks.length > 0) {
      fetchMiniSeries(featuredShocks.map((s) => s.market_id));
    }
  }, [featuredShocks, fetchMiniSeries]);

  /* === Section 6: All shocks grid with infinite scroll === */
  const GRID_PAGE_SIZE = 20;
  const [gridCategory, setGridCategory] = useState<string>("all");
  const [gridVisibleCount, setGridVisibleCount] = useState(GRID_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const gridShocks = useMemo(() => {
    return [...liveShocks]
      .filter((s) => {
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
  }, [liveShocks, gridCategory]);

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

  /* Category counts from the current (last-hour) shocks only */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of liveShocks) {
      const cat = s.category ?? "other";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [liveShocks]);

  /* Only categories that have live shocks */
  const allCategories = useMemo(() => {
    return Object.keys(categoryCounts).sort();
  }, [categoryCounts]);

  const totalShockCount = Object.values(categoryCounts).reduce(
    (a, b) => a + b,
    0,
  );

  const marketCount = stats.total_markets || 0;

  const noShocks = !loading && liveShocks.length === 0 && !usingDummy;

  if (loading) {
    return (
      <>
        <nav className="sticky top-0 z-50 bg-surface-base" style={{ borderBottom: "2px solid var(--st-accent)" }}>
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
      <nav className="sticky top-0 z-50 bg-surface-base" style={{ borderBottom: "2px solid var(--st-accent)" }}>
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

        {/* ── Featured Shocks Carousel (always visible) ── */}
        <section className="mx-auto max-w-7xl overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
          <CardCarousel>
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
          </CardCarousel>
        </section>

        {/* ── Empty state when no shocks in the last hour ── */}
        {noShocks ? (
          <section className="mx-auto max-w-7xl px-4 py-12 text-center sm:px-6 lg:px-8">
            <div className="mx-auto max-w-md">
              <CountdownRing durationMs={120000} />
              <p className="text-sm text-text-secondary">
                No shocks detected in the last hour.
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Markets are quiet, check back soon.
              </p>
              <p className="mt-4 text-[11px] text-text-muted">
                Monitoring {marketCount > 0 ? marketCount.toLocaleString() : "..."} markets
              </p>
            </div>
          </section>
        ) : (
          <>
            {/* ── SECTION 3: Explainer Text ── */}
            <section className="mx-auto max-w-7xl px-4 pb-12 pt-4 text-center sm:px-6 lg:px-8">
              <h2 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
                Detect the <RotatingWord />.{" "}
                Size the trade.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-muted">
                ShockTest scans Polymarket for sudden probability moves and
                backtests whether they revert. Browse shocks, build a portfolio,
                or dive into any market for deep analysis.
              </p>
              <div className="mx-auto mt-6 h-px w-24" style={{ backgroundColor: "var(--st-accent)" }} />
            </section>

            {/* ── SECTION 4: Portfolio Builder ── */}
            <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <PortfolioBuilder allShocks={liveShocks} />
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
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
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
                        return (
                          <li key={cat}>
                            <button
                              onClick={() => handleGridCategoryChange(cat)}
                              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                                gridCategory === cat
                                  ? "border-l-2 border-accent bg-surface-2 font-semibold text-text-primary"
                                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                <span
                                  style={{
                                    color: getCategoryColor(cat).text,
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
