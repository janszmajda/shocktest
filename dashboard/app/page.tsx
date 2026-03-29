"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Header from "@/components/Header";
import LiveAlertBanner from "@/components/LiveAlertBanner";
import StatsCards from "@/components/StatsCards";
import ShocksTable from "@/components/ShocksTable";
import Histogram from "@/components/Histogram";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import { DashboardFilters } from "@/components/DashboardControls";
import CategoryIcon, { getCategoryColor } from "@/components/CategoryIcon";
import Footer from "@/components/Footer";
import LoadingSpinner from "@/components/LoadingSpinner";
import { DUMMY_SHOCKS, DUMMY_STATS } from "@/lib/dummyData";
import { Shock, AggregateStats, PricePoint } from "@/lib/types";
import { cachedFetch } from "@/lib/fetchCache";

export default function Home() {
  const [allShocks, setAllShocks] = useState<Shock[]>(DUMMY_SHOCKS);
  const [stats, setStats] = useState<AggregateStats>(DUMMY_STATS);
  const [loading, setLoading] = useState(true);
  const [usingDummy, setUsingDummy] = useState(true);
  const [seriesMap, setSeriesMap] = useState<Record<string, PricePoint[]>>({});
  const [closeTimeMap, setCloseTimeMap] = useState<Record<string, number | null>>({});
  const [imageMap, setImageMap] = useState<Record<string, string | null>>({});
  const [filters, setFilters] = useState<DashboardFilters>({
    theta: 0.08,
    horizon: "6h",
    category: "all",
  });

  // Track which IDs we've already fetched to avoid re-fetching
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIdsRef = useRef<string[]>([]);

  const handleVisibleIds = useCallback((ids: string[]) => {
    const missing = ids.filter((id) => !fetchedIdsRef.current.has(id));
    if (missing.length === 0) return;
    // Accumulate missing IDs and debounce the fetch
    pendingIdsRef.current = Array.from(new Set([...pendingIdsRef.current, ...missing]));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const toFetch = pendingIdsRef.current.filter((id) => !fetchedIdsRef.current.has(id));
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
            const entry = v as { series: PricePoint[]; close_time: number | null; image_url: string | null };
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

  const fetchData = useCallback(() => {
    Promise.all([
      cachedFetch<Shock[]>("/api/shocks")
        .then((data) => {
          if (data.length > 0) {
            setAllShocks(data);
            return true;
          }
          return false;
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
      setUsingDummy(!(shocksOk || statsOk));
      setLoading(false);
    });
  }, []);

  // Fetch on mount + every 2 minutes
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Client-side filtering based on dashboard controls
  const filteredShocks = useMemo(() => {
    return allShocks.filter((s) => {
      // Exclude resolved markets (probability at 0% or 100%)
      if (s.p_after <= 0.01 || s.p_after >= 0.99) return false;
      if (s.abs_delta < filters.theta) return false;
      if (filters.category !== "all" && s.category !== filters.category)
        return false;
      return true;
    });
  }, [allShocks, filters]);

  // Recompute stats from filtered shocks
  const filteredStats = useMemo((): AggregateStats => {
    if (filteredShocks.length === 0) return stats;

    const horizonKey = `reversion_${filters.horizon}` as keyof Shock;
    const revValues = filteredShocks
      .map((s) => s[horizonKey] as number | null)
      .filter((v): v is number => v !== null);

    if (revValues.length === 0) return stats;

    const reversionRate = revValues.filter((v) => v > 0).length / revValues.length;
    const meanReversion = revValues.reduce((a, b) => a + b, 0) / revValues.length;

    return {
      ...stats,
      total_shocks: filteredShocks.length,
      reversion_rate_6h: reversionRate,
      mean_reversion_6h: meanReversion,
      [`reversion_rate_${filters.horizon}`]: reversionRate,
      [`mean_reversion_${filters.horizon}`]: meanReversion,
      [`sample_size_${filters.horizon}`]: revValues.length,
    } as AggregateStats;
  }, [filteredShocks, stats, filters.horizon]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(allShocks.map((s) => s.category).filter(Boolean)),
    ) as string[];
  }, [allShocks]);

  // Category counts from filtered-by-theta shocks (not by category)
  const categoryCounts = useMemo(() => {
    const thetaFiltered = allShocks.filter((s) => s.abs_delta >= filters.theta);
    const counts: Record<string, number> = {};
    for (const s of thetaFiltered) {
      const cat = s.category ?? "Uncategorized";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [allShocks, filters.theta]);

  // Live alerts: shocks with is_live_alert or very recent, sorted most recent first
  const liveAlerts = useMemo(() => {
    return allShocks
      .filter(
        (s) =>
          // Exclude resolved markets (price at 0% or 100%)
          s.p_after > 0.01 &&
          s.p_after < 0.99 &&
          (s.is_live_alert === true ||
            (s.is_recent === true && (s.hours_ago ?? 999) <= 6)),
      )
      .sort((a, b) => (a.hours_ago ?? 999) - (b.hours_ago ?? 999));
  }, [allShocks]);

  const handleFilterChange = useCallback((newFilters: Partial<DashboardFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {usingDummy && !loading && (
          <div className="mb-5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-center text-[11px] text-text-muted">
            Showing dummy data — real data will appear once the analysis pipeline
            runs.
          </div>
        )}
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <LiveAlertBanner alerts={liveAlerts} />

            {/* Sidebar + main content layout */}
            <div className="mt-5 flex gap-5">
              {/* Left sidebar — categories */}
              <aside className="hidden w-56 shrink-0 lg:block">
                <div className="sticky top-5 rounded-lg border border-border bg-surface-1 p-4">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Categories
                  </h3>
                  <ul className="space-y-0.5">
                    <li>
                      <button
                        onClick={() =>
                          handleFilterChange({ ...filters, category: "all" })
                        }
                        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-all ${
                          filters.category === "all"
                            ? "border-l-2 border-accent bg-surface-2 font-semibold text-text-primary"
                            : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                        }`}
                      >
                        <span>All</span>
                        <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-text-muted">
                          {Object.values(categoryCounts).reduce((a, b) => a + b, 0)}
                        </span>
                      </button>
                    </li>
                    {categories.map((cat) => (
                      <li key={cat}>
                        <button
                          onClick={() =>
                            handleFilterChange({ ...filters, category: cat })
                          }
                          className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-all ${
                            filters.category === cat
                              ? "border-l-2 border-accent bg-surface-2 font-semibold text-text-primary"
                              : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span style={{ color: getCategoryColor(cat).text }}>
                              <CategoryIcon category={cat} className="h-3.5 w-3.5" />
                            </span>
                            {cat}
                          </span>
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-text-muted">
                            {categoryCounts[cat] ?? 0}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>

              {/* Main content */}
              <div className="min-w-0 flex-1 space-y-5">
                <ShocksTable
                  shocks={filteredShocks}
                  seriesMap={seriesMap}
                  closeTimeMap={closeTimeMap}
                  imageMap={imageMap}
                  theta={filters.theta}
                  horizon={filters.horizon}
                  onFilterChange={handleFilterChange}
                  onVisibleIdsChange={handleVisibleIds}
                />
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <Histogram shocks={filteredShocks} horizon={filters.horizon} />
                  <CategoryBreakdown stats={stats} />
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
