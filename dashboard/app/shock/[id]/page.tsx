"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import PriceChart from "@/components/PriceChart";
import PnlHeatmap from "@/components/PnlHeatmap";
import AiAnalysisBox from "@/components/AiAnalysisBox";
import ScenarioPanel from "@/components/ScenarioPanel";
import TradeSimulator from "@/components/TradeSimulator";
import Footer from "@/components/Footer";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  DUMMY_SHOCKS,
  DUMMY_PRICE_SERIES,
  DUMMY_SIMILAR_STATS,
  DUMMY_STATS,
} from "@/lib/dummyData";
import {
  Shock,
  PricePoint,
  SimilarStatsResponse,
  AggregateStats,
} from "@/lib/types";
import { cachedFetch } from "@/lib/fetchCache";

interface ShockDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatPp(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "—";
  const sign = val > 0 ? "+" : "";
  return `${sign}${(val * 100).toFixed(1)}pp`;
}

export default function ShockDetailPage({ params }: ShockDetailPageProps) {
  const { id } = use(params);

  const [shock, setShock] = useState<Shock>(
    DUMMY_SHOCKS.find((s) => s._id === id) ?? DUMMY_SHOCKS[0],
  );
  const [series, setSeries] = useState<PricePoint[]>(DUMMY_PRICE_SERIES);
  const [similarStats, setSimilarStats] =
    useState<SimilarStatsResponse>(DUMMY_SIMILAR_STATS);
  const [stats, setStats] = useState<AggregateStats>(DUMMY_STATS);
  const [loading, setLoading] = useState(true);
  const [positionSize, setPositionSize] = useState(100);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorAnalysis, setAdvisorAnalysis] = useState<{
    event: string;
    decision: string;
    details: string;
  } | null>(null);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Fetch shock list + stats in parallel (cached across navigations)
        const [shocks, statsData] = await Promise.all([
          cachedFetch<Shock[]>("/api/shocks?all=true").catch(() => null),
          cachedFetch<AggregateStats>("/api/stats").catch(() => null),
        ]);

        let foundShock: Shock | undefined;

        if (shocks && shocks.length > 0) {
          foundShock = shocks.find((s) => s._id === id);
          if (foundShock) setShock(foundShock);
        }

        if (statsData && statsData.total_shocks > 0) setStats(statsData);

        // Fire similar-stats + market series in parallel (no waterfall)
        const s = foundShock ?? shock;
        const similarParams = new URLSearchParams({
          abs_delta: String(s.abs_delta),
          direction: s.delta > 0 ? "up" : "down",
          exclude_id: s._id,
        });
        if (s.category) similarParams.set("category", s.category);

        const [similarData, market] = await Promise.all([
          cachedFetch<SimilarStatsResponse>(
            `/api/similar-stats?${similarParams}`,
          ).catch(() => null),
          foundShock
            ? fetch(`/api/markets?id=${foundShock.market_id}`)
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            : null,
        ]);

        if (similarData?.backtest) setSimilarStats(similarData);
        if (market?.series?.length > 0) setSeries(market.series);
      } catch {
        // keep dummy data
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shockT1 = new Date(shock.t1).getTime() / 1000;
  const shockT2 = new Date(shock.t2).getTime() / 1000;
  const fadeDirection = shock.delta > 0 ? "buy_no" : "buy_yes";
  const currentPrice = series.length > 0 ? series[series.length - 1].p : shock.p_after;
  const catStats = shock.category
    ? similarStats.backtest?.by_category[shock.category]
    : null;

  const categoryWinRate = catStats?.win_rate_6h ?? similarStats.backtest?.win_rate_6h ?? null;

  async function askAdvisor() {
    setAdvisorLoading(true);
    setAdvisorError(null);
    setAdvisorAnalysis(null);
    try {
      const res = await fetch("/api/shock-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: shock.question,
          category: shock.category,
          p_before: shock.p_before,
          p_after: shock.p_after,
          delta: shock.delta,
          t2: shock.t2,
          source: shock.source,
          reversion_1h: shock.reversion_1h,
          reversion_6h: shock.reversion_6h,
          reversion_24h: shock.reversion_24h,
          current_price: currentPrice,
          category_win_rate: categoryWinRate,
        }),
      });
      const data = (await res.json()) as {
        analysis?: { event: string; decision: string; details: string };
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setAdvisorAnalysis(data.analysis ?? null);
      setDetailsOpen(false);
    } catch (e) {
      setAdvisorError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdvisorLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-8 w-8 animate-spin rounded-full"
              style={{
                border: "4px solid var(--st-border)",
                borderTopColor: "var(--st-accent)",
              }}
            />
            <p className="text-sm text-text-muted">Loading shock analysis...</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* 1. Market title + shock metadata */}
        <div>
          <h2 className="text-2xl font-bold text-text-primary">
            {shock.question}
          </h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-text-muted">
            <span>Source: {shock.source}</span>
            <span>&middot;</span>
            <span>Category: {shock.category ?? "uncategorized"}</span>
            <span>&middot;</span>
            <span>
              Shock: {(shock.p_before * 100).toFixed(0)}% &rarr;{" "}
              {(shock.p_after * 100).toFixed(0)}% (
              {shock.delta > 0 ? "+" : ""}
              {(shock.delta * 100).toFixed(1)}pp)
            </span>
          </div>
        </div>

        {/* AI Advisor (Claude with web search) */}
        <div className="rounded-lg border border-accent bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">AI Advisor</h3>
            <button
              onClick={askAdvisor}
              disabled={advisorLoading}
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {advisorLoading ? "Searching..." : advisorAnalysis ? "Re-analyze" : "Explain Shock"}
            </button>
          </div>
          {!advisorAnalysis && !advisorLoading && !advisorError && (
            <p className="mt-2 text-sm text-text-muted">
              Searches the web for what caused this shock and gives a trade recommendation.
            </p>
          )}
          {advisorLoading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Searching the web and analyzing...
            </div>
          )}
          {advisorError && (
            <p className="mt-3 text-sm text-no-text">{advisorError}</p>
          )}
          {advisorAnalysis && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <span className="mt-0.5 text-text-muted">&#x2022;</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">What happened</p>
                  <p className="mt-0.5 text-sm text-text-secondary">{advisorAnalysis.event}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="mt-0.5 text-text-muted">&#x2022;</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Recommendation</p>
                  <p className="mt-0.5 text-sm text-text-secondary">{advisorAnalysis.decision}</p>
                </div>
              </div>
              {advisorAnalysis.details && (
                <div className="border-t border-border pt-2">
                  <button
                    onClick={() => setDetailsOpen(!detailsOpen)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {detailsOpen ? "Hide details" : "Show details"}
                  </button>
                  {detailsOpen && (
                    <p className="mt-2 text-sm leading-relaxed text-text-muted">
                      {advisorAnalysis.details}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. PriceChart */}
        <div className="rounded-lg border border-accent bg-surface-1 p-6">
          <h3 className="mb-4 text-sm font-medium text-text-muted">
            Probability Over Time
          </h3>
          <PriceChart
            series={series}
            shockT1={shockT1}
            shockT2={shockT2}
            pBefore={shock.p_before}
            pAfter={shock.p_after}
          />
        </div>

        {/* 2b. AI Analysis (if available) */}
        {"ai_analysis" in shock &&
          (shock as unknown as { ai_analysis?: { likely_cause: string; overreaction_assessment: string; reversion_confidence: "low" | "medium" | "high" } }).ai_analysis && (
          <AiAnalysisBox
            analysis={
              (shock as unknown as { ai_analysis: { likely_cause: string; overreaction_assessment: string; reversion_confidence: "low" | "medium" | "high" } }).ai_analysis
            }
          />
        )}

        {/* Collapsible analysis panels */}
        <details className="group rounded-lg border border-accent bg-surface-1">
          <summary className="cursor-pointer list-none select-none px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="text-accent transition-transform group-open:rotate-90">&#9654;</span>
              P&amp;L Heatmap
            </span>
          </summary>
          <div className="space-y-3 px-5 pb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-text-muted">Position Size:</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">$</span>
                <input
                  type="number"
                  value={positionSize}
                  onChange={(e) => setPositionSize(Math.max(1, Math.min(10000, Number(e.target.value))))}
                  min={1}
                  max={10000}
                  className="w-24 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                />
              </div>
            </div>
            <PnlHeatmap
              entryPrice={shock.p_after}
              positionSize={positionSize}
              direction={fadeDirection}
            />
          </div>
        </details>

        <details className="group rounded-lg border border-accent bg-surface-1">
          <summary className="cursor-pointer list-none select-none px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="text-accent transition-transform group-open:rotate-90">&#9654;</span>
              Scenario Analysis
            </span>
          </summary>
          <div className="space-y-3 px-5 pb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-text-muted">Position Size:</label>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-muted">$</span>
                <input
                  type="number"
                  value={positionSize}
                  onChange={(e) => setPositionSize(Math.max(1, Math.min(10000, Number(e.target.value))))}
                  min={1}
                  max={10000}
                  className="w-24 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                />
              </div>
            </div>
            <ScenarioPanel
              entryPrice={shock.p_after}
              shockDelta={shock.delta}
              positionSize={positionSize}
              category={shock.category}
              backtestStats={catStats ?? (similarStats.backtest ? {
                win_rate_6h: similarStats.backtest.win_rate_6h ?? 0.5,
                avg_pnl_6h: similarStats.backtest.avg_pnl_per_dollar_6h,
              } : null)}
            />
          </div>
        </details>

        {similarStats.backtest && (
          <details className="group rounded-lg border border-accent bg-surface-1">
            <summary className="cursor-pointer list-none select-none px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <span className="text-accent transition-transform group-open:rotate-90">&#9654;</span>
                Fade This Shock?
              </span>
            </summary>
            <div className="px-1 pb-1">
              <TradeSimulator
                shockDelta={shock.delta}
                shockCategory={shock.category}
                backtest={similarStats.backtest}
                distributions={{
                  "1h": similarStats.distribution_1h,
                  "6h": similarStats.distribution_6h,
                  "24h": similarStats.distribution_24h,
                }}
                sampleSize={similarStats.sample_size}
                filterLevel={similarStats.filter_level}
              />
            </div>
          </details>
        )}

      </main>
      <Footer />
    </>
  );
}
