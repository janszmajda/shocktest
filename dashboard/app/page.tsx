"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "@/components/Header";
import LiveAlertBanner from "@/components/LiveAlertBanner";
import StatsCards from "@/components/StatsCards";
import ShocksTable from "@/components/ShocksTable";
import Histogram from "@/components/Histogram";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import { DashboardFilters } from "@/components/DashboardControls";
import Footer from "@/components/Footer";
import LoadingSpinner from "@/components/LoadingSpinner";
import { DUMMY_SHOCKS, DUMMY_STATS } from "@/lib/dummyData";
import { Shock, AggregateStats, PricePoint } from "@/lib/types";

export default function Home() {
  const [allShocks, setAllShocks] = useState<Shock[]>(DUMMY_SHOCKS);
  const [stats, setStats] = useState<AggregateStats>(DUMMY_STATS);
  const [loading, setLoading] = useState(true);
  const [usingDummy, setUsingDummy] = useState(true);
  const [seriesMap, setSeriesMap] = useState<Record<string, PricePoint[]>>({});
  const [closeTimeMap, setCloseTimeMap] = useState<Record<string, number | null>>({});
  const [filters, setFilters] = useState<DashboardFilters>({
    theta: 0.08,
    horizon: "6h",
    category: "all",
  });

  const fetchData = useCallback(() => {
    Promise.all([
      fetch("/api/shocks")
        .then((res) => {
          if (!res.ok) throw new Error("Failed");
          return res.json();
        })
        .then((data: Shock[]) => {
          if (data.length > 0) {
            setAllShocks(data);
            // Background fetch mini series for sparklines (batched)
            const marketIds = Array.from(new Set(data.map((s) => s.market_id)));
            const batchSize = 40;
            const batches: string[][] = [];
            for (let i = 0; i < marketIds.length; i += batchSize) {
              batches.push(marketIds.slice(i, i + batchSize));
            }
            Promise.all(
              batches.map((batch) =>
                fetch(`/api/markets/mini-series?ids=${batch.join(",")}`)
                  .then((r) => (r.ok ? r.json() : {}))
                  .catch(() => ({})),
              ),
            ).then((results) => {
              const mergedSeries: Record<string, PricePoint[]> = {};
              const mergedClose: Record<string, number | null> = {};
              for (const r of results) {
                for (const [k, v] of Object.entries(r)) {
                  const entry = v as { series: PricePoint[]; close_time: number | null };
                  mergedSeries[k] = entry.series;
                  mergedClose[k] = entry.close_time;
                }
              }
              setSeriesMap(mergedSeries);
              setCloseTimeMap(mergedClose);
            });
            return true;
          }
          return false;
        })
        .catch(() => false),
      fetch("/api/stats")
        .then((res) => {
          if (!res.ok) throw new Error("Failed");
          return res.json();
        })
        .then((data: AggregateStats) => {
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

  // Fetch on mount + every 2 minutes
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Client-side filtering based on dashboard controls
  const filteredShocks = useMemo(() => {
    return allShocks.filter((s) => {
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
    };
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
          s.is_live_alert === true ||
          (s.is_recent === true && (s.hours_ago ?? 999) <= 6),
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
                          <span>{cat}</span>
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
                  theta={filters.theta}
                  horizon={filters.horizon}
                  onFilterChange={handleFilterChange}
                />
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <Histogram shocks={filteredShocks} />
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
