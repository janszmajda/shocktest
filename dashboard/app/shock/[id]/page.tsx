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
  DUMMY_BACKTEST,
  DUMMY_STATS,
} from "@/lib/dummyData";
import {
  Shock,
  PricePoint,
  BacktestResponse,
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
  const [backtestData, setBacktestData] =
    useState<BacktestResponse>(DUMMY_BACKTEST);
  const [stats, setStats] = useState<AggregateStats>(DUMMY_STATS);
  const [loading, setLoading] = useState(true);
  const [positionSize, setPositionSize] = useState(100);

  useEffect(() => {
    Promise.all([
      fetch("/api/shocks")
        .then((res) => {
          if (!res.ok) throw new Error("Failed");
          return res.json();
        })
        .then((shocks: Shock[]) => {
          const found = shocks.find((s) => s._id === id);
          if (found) {
            setShock(found);
            return fetch(`/api/markets?id=${found.market_id}`)
              .then((res) => {
                if (!res.ok) throw new Error("Failed");
                return res.json();
              })
              .then((market) => {
                if (market?.series?.length > 0) {
                  setSeries(market.series);
                }
              });
          }
        })
        .catch(() => {}),
      fetch("/api/backtest")
        .then((res) => {
          if (!res.ok) throw new Error("Failed");
          return res.json();
        })
        .then((data: BacktestResponse) => {
          if (data.backtest) setBacktestData(data);
        })
        .catch(() => {}),
      fetch("/api/stats")
        .then((res) => {
          if (!res.ok) throw new Error("Failed");
          return res.json();
        })
        .then((data: AggregateStats) => {
          if (data.total_shocks > 0) setStats(data);
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const shockT1 = new Date(shock.t1).getTime() / 1000;
  const shockT2 = new Date(shock.t2).getTime() / 1000;
  const fadeDirection = shock.delta > 0 ? "buy_no" : "buy_yes";
  const currentPrice = series.length > 0 ? series[series.length - 1].p : shock.p_after;
  const meanReversionTarget =
    shock.delta > 0
      ? shock.p_after - (stats.mean_reversion_6h ?? 0)
      : shock.p_after + (stats.mean_reversion_6h ?? 0);

  const catStats = shock.category
    ? backtestData.backtest?.by_category[shock.category]
    : null;

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
          className="inline-flex items-center text-sm text-blue-600 hover:underline"
        >
          &larr; Back to dashboard
        </Link>

        {/* 1. Market title + shock metadata */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {shock.question}
          </h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500">
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

        {/* Shared position size control */}
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <label className="text-sm font-medium text-gray-700">
            Position Size:
          </label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">$</span>
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
              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <p className="text-xs text-gray-400">
            Shared across all analysis below
          </p>
        </div>

        {/* 2. PriceChart */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-500">
            Probability Over Time
          </h3>
          <PriceChart series={series} shockT1={shockT1} shockT2={shockT2} />
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
          backtestStats={catStats ?? (backtestData.backtest ? {
            win_rate_6h: backtestData.backtest.win_rate_6h ?? 0.5,
            avg_pnl_6h: backtestData.backtest.avg_pnl_per_dollar_6h,
          } : null)}
        />

        {/* 5. TradeSimulator */}
        {backtestData.backtest && (
          <TradeSimulator
            shockDelta={shock.delta}
            shockCategory={shock.category}
            backtest={backtestData.backtest}
            distributions={{
              "1h": backtestData.distribution_1h,
              "6h": backtestData.distribution_6h,
              "24h": backtestData.distribution_24h,
            }}
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
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Post-Shock Outcomes
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Horizon
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Post Move
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Reversion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    1 hour
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.post_move_1h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.reversion_1h)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    6 hours
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.post_move_6h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.reversion_6h)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    24 hours
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.post_move_24h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.reversion_24h)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* 8. Caveats */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-400">
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
