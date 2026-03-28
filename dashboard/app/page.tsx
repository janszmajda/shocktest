"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Header from "@/components/Header";
import LiveAlertBanner from "@/components/LiveAlertBanner";
import StatsCards from "@/components/StatsCards";
import FindingsBlock from "@/components/FindingsBlock";
import ShocksTable from "@/components/ShocksTable";
import Histogram from "@/components/Histogram";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import DashboardControls, {
  DashboardFilters,
} from "@/components/DashboardControls";
import Footer from "@/components/Footer";
import LoadingSpinner from "@/components/LoadingSpinner";
import { DUMMY_SHOCKS, DUMMY_STATS } from "@/lib/dummyData";
import { Shock, AggregateStats } from "@/lib/types";

export default function Home() {
  const [allShocks, setAllShocks] = useState<Shock[]>(DUMMY_SHOCKS);
  const [stats, setStats] = useState<AggregateStats>(DUMMY_STATS);
  const [loading, setLoading] = useState(true);
  const [usingDummy, setUsingDummy] = useState(true);
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

  const handleFilterChange = useCallback((newFilters: DashboardFilters) => {
    setFilters(newFilters);
  }, []);

  return (
    <>
      <Header />
      {/* Stats bar — full width, sits right under nav like Polymarket */}
      {!loading && <StatsCards stats={filteredStats} />}
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {usingDummy && !loading && (
          <div className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-center text-[11px] text-text-muted">
            Showing dummy data — real data will appear once the analysis pipeline
            runs.
          </div>
        )}
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <LiveAlertBanner alerts={liveAlerts} />
            <DashboardControls
              categories={categories}
              onFilterChange={handleFilterChange}
            />
            <FindingsBlock stats={filteredStats} />
            <ShocksTable shocks={filteredShocks} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Histogram shocks={filteredShocks} />
              <CategoryBreakdown stats={stats} />
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
