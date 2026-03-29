"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import PriceChart from "@/components/PriceChart";
import PnlHeatmap from "@/components/PnlHeatmap";
import AiAnalysisBox from "@/components/AiAnalysisBox";
import PayoffCurve from "@/components/PayoffCurve";
import ScenarioPanel from "@/components/ScenarioPanel";
import TradeSimulator from "@/components/TradeSimulator";
import PnlTimeline from "@/components/PnlTimeline";
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

interface ShockDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatPp(val: number | null): string {
  if (val === null) return "—";
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
        // Fetch shock list + stats in parallel
        const [shocksRes, statsRes] = await Promise.all([
          fetch("/api/shocks"),
          fetch("/api/stats"),
        ]);

        let foundShock: Shock | undefined;

        if (shocksRes.ok) {
          const shocks: Shock[] = await shocksRes.json();
          foundShock = shocks.find((s) => s._id === id);
          if (foundShock) {
            setShock(foundShock);
            // Fetch market series in background
            fetch(`/api/markets?id=${foundShock.market_id}`)
              .then((res) => (res.ok ? res.json() : null))
              .then((market) => {
                if (market?.series?.length > 0) setSeries(market.series);
              })
              .catch(() => {});
          }
        }

        if (statsRes.ok) {
          const data: AggregateStats = await statsRes.json();
          if (data.total_shocks > 0) setStats(data);
        }

        // Now fetch similar stats using the shock's properties
        const s = foundShock ?? shock;
        const params = new URLSearchParams({
          abs_delta: String(s.abs_delta),
          direction: s.delta > 0 ? "up" : "down",
          exclude_id: s._id,
        });
        if (s.category) params.set("category", s.category);

        const similarRes = await fetch(`/api/similar-stats?${params}`);
        if (similarRes.ok) {
          const data: SimilarStatsResponse = await similarRes.json();
          if (data.backtest) setSimilarStats(data);
        }
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
  const meanReversionTarget =
    shock.delta > 0
      ? shock.p_after - (stats.mean_reversion_6h ?? 0)
      : shock.p_after + (stats.mean_reversion_6h ?? 0);

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
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <LoadingSpinner />
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-accent hover:underline"
        >
          &larr; Back to dashboard
        </Link>

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

        {/* AI Advisor */}
        <div className="rounded-lg border border-border bg-surface-1 p-5">
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

        {/* Shared position size control */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3">
          <label className="text-sm font-medium text-text-secondary">
            Position Size:
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-text-muted">$</span>
            <input
              type="number"
              value={positionSize}
              onChange={(e) =>
                setPositionSize(
                  Math.max(1, Math.min(10000, Number(e.target.value))),
                )
              }
              min={1}
              max={10000}
              className="w-28 rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
            />
          </div>
          <p className="text-xs text-text-muted">
            Shared across all analysis below
          </p>
        </div>

        {/* 2. PriceChart */}
        <div className="rounded-lg border border-border bg-surface-1 p-6">
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

        {/* 2c. P&L Heatmap */}
        <PnlHeatmap
          entryPrice={shock.p_after}
          positionSize={positionSize}
          direction={fadeDirection}
        />

        {/* 3. PayoffCurve */}
        <PayoffCurve
          entryPrice={shock.p_after}
          positionSize={positionSize}
          direction={fadeDirection}
          currentPrice={currentPrice}
          meanReversionTarget={meanReversionTarget}
        />

        {/* 4. ScenarioPanel */}
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

        {/* 5. TradeSimulator */}
        {similarStats.backtest && (
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
        )}

        {/* 6. PnlTimeline */}
        <PnlTimeline
          series={series}
          shockT2={shock.t2}
          shockDelta={shock.delta}
          positionSize={positionSize}
        />

        {/* 7. Post-Shock Outcomes Table */}
        <div>
          <h3 className="mb-4 text-lg font-semibold text-text-primary">
            Post-Shock Outcomes
          </h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-2">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                    Horizon
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                    Post Move
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                    Reversion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-1">
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    1 hour
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">
                    {formatPp(shock.post_move_1h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">
                    {formatPp(shock.reversion_1h)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    6 hours
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">
                    {formatPp(shock.post_move_6h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">
                    {formatPp(shock.reversion_6h)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    24 hours
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">
                    {formatPp(shock.post_move_24h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">
                    {formatPp(shock.reversion_24h)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 8. Caveats */}
        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <p className="text-xs text-text-muted">
            All analysis is based on historical data. In-sample backtest only —
            no out-of-sample validation. Ignores transaction costs, slippage, and
            liquidity constraints. Small sample size — edge may not persist. This
            is an exploratory analysis tool, not investment advice.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
