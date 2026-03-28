"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import StatsCards from "@/components/StatsCards";
import FindingsBlock from "@/components/FindingsBlock";
import ShocksTable from "@/components/ShocksTable";
import Histogram from "@/components/Histogram";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import Footer from "@/components/Footer";
import LoadingSpinner from "@/components/LoadingSpinner";
import { DUMMY_SHOCKS, DUMMY_STATS } from "@/lib/dummyData";
import { Shock, AggregateStats } from "@/lib/types";

export default function Home() {
  const [shocks, setShocks] = useState<Shock[]>(DUMMY_SHOCKS);
  const [stats, setStats] = useState<AggregateStats>(DUMMY_STATS);
  const [loading, setLoading] = useState(true);
  const [usingDummy, setUsingDummy] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/shocks")
        .then((res) => {
          if (!res.ok) throw new Error("Failed");
          return res.json();
        })
        .then((data: Shock[]) => {
          if (data.length > 0) {
            setShocks(data);
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

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {usingDummy && !loading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-700">
            Showing dummy data — real data will appear once the analysis pipeline
            runs.
          </div>
        )}
        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            <StatsCards stats={stats} />
            <FindingsBlock stats={stats} />
            <ShocksTable shocks={shocks} />
            <Histogram shocks={shocks} />
            <CategoryBreakdown stats={stats} />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
