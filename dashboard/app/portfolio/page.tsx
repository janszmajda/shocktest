"use client";

import { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Shock, BacktestResponse } from "@/lib/types";
import { DUMMY_SHOCKS, DUMMY_BACKTEST } from "@/lib/dummyData";

interface SelectedShock {
  market_id: string;
  question: string;
  category: string | null;
  delta: number;
  p_after: number;
  positionSize: number;
}

export default function PortfolioPage() {
  const [allShocks, setAllShocks] = useState<Shock[]>(DUMMY_SHOCKS);
  const [selected, setSelected] = useState<SelectedShock[]>([]);
  const [backtest, setBacktest] = useState<BacktestResponse>(DUMMY_BACKTEST);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/shocks")
        .then((r) => {
          if (!r.ok) throw new Error("Failed");
          return r.json();
        })
        .then((data: Shock[]) => {
          if (data.length > 0) setAllShocks(data);
        })
        .catch(() => {}),
      fetch("/api/backtest")
        .then((r) => {
          if (!r.ok) throw new Error("Failed");
          return r.json();
        })
        .then((data: BacktestResponse) => {
          if (data.backtest) setBacktest(data);
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const combinedPayoffByOutcome = useMemo(() => {
    if (selected.length === 0) return [];

    const points = [];
    for (let movePct = -20; movePct <= 20; movePct += 1) {
      const move = movePct / 100;
      const point: Record<string, number> = { move: movePct };
      let totalPnl = 0;

      for (let i = 0; i < selected.length; i++) {
        const shock = selected[i];
        const shockDir = Math.sign(shock.delta);
        const reversion = -shockDir * move;
        const pnl = shock.positionSize * reversion;
        point[`shock_${i}`] = Number(pnl.toFixed(2));
        totalPnl += pnl;
      }

      point.portfolio = Number(totalPnl.toFixed(2));
      points.push(point);
    }
    return points;
  }, [selected]);

  const portfolioStats = useMemo(() => {
    if (selected.length === 0 || !backtest?.backtest) return null;

    const totalSize = selected.reduce((sum, s) => sum + s.positionSize, 0);
    const bt = backtest.backtest;
    const n = selected.length;
    const expectedPnl = totalSize * bt.avg_pnl_per_dollar_6h;
    const stdReduction = Math.sqrt(1 / n);

    return {
      totalSize,
      numPositions: n,
      expectedPnl: Number(expectedPnl.toFixed(2)),
      avgWinRate: bt.win_rate_6h ?? 0,
      diversificationBenefit: `${((1 - stdReduction) * 100).toFixed(0)}% variance reduction`,
      maxLoss: -totalSize,
    };
  }, [selected, backtest]);

  const addShock = (shock: Shock) => {
    if (selected.length >= 4) return;
    if (selected.find((s) => s.market_id === shock.market_id)) return;
    setSelected([
      ...selected,
      {
        market_id: shock.market_id,
        question: shock.question,
        category: shock.category,
        delta: shock.delta,
        p_after: shock.p_after,
        positionSize: 100,
      },
    ]);
  };

  const removeShock = (marketId: string) => {
    setSelected(selected.filter((s) => s.market_id !== marketId));
  };

  const updateSize = (marketId: string, size: number) => {
    setSelected(
      selected.map((s) =>
        s.market_id === marketId ? { ...s, positionSize: size } : s,
      ),
    );
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Sort by most recent, filter by search
  const filteredShocks = useMemo(() => {
    const sorted = [...allShocks].sort(
      (a, b) => new Date(b.t2).getTime() - new Date(a.t2).getTime(),
    );
    const searched = searchQuery
      ? sorted.filter((s) =>
          s.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.category?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false),
        )
      : sorted;
    return showAll ? searched : searched.slice(0, 20);
  }, [allShocks, searchQuery, showAll]);

  const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#8b5cf6"];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">
            Fade Portfolio Builder
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Select 2-4 shocks to fade simultaneously. See the combined payoff
            and diversification benefit.
          </p>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Shock selector */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-secondary">
                  Available Shocks — sorted by most recent (click to add)
                </h3>
                <span className="text-xs text-text-muted">
                  {filteredShocks.length} of {allShocks.length} shocks
                </span>
              </div>
              <div className="mb-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Search markets or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="whitespace-nowrap rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-2"
                >
                  {showAll ? "Show top 20" : "Show all"}
                </button>
              </div>
              <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                {filteredShocks.map((shock) => {
                  const isSelected = !!selected.find(
                    (s) => s.market_id === shock.market_id,
                  );
                  return (
                    <button
                      key={shock._id}
                      onClick={() => addShock(shock)}
                      disabled={selected.length >= 4 || isSelected}
                      className={`rounded-lg border p-3 text-left text-sm transition ${
                        isSelected
                          ? "border-accent bg-accent-dim opacity-60"
                          : "border-border bg-surface-1 hover:border-accent hover:bg-accent-dim"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span className="font-medium text-text-primary">
                        {shock.question.substring(0, 55)}
                        {shock.question.length > 55 ? "..." : ""}
                      </span>
                      <span
                        className={`ml-2 font-semibold ${shock.delta > 0 ? "text-yes-text" : "text-no-text"}`}
                      >
                        {shock.delta > 0 ? "+" : ""}
                        {(shock.delta * 100).toFixed(0)}pp
                      </span>
                      {shock.category && (
                        <span className="ml-2 inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
                          {shock.category}
                        </span>
                      )}
                      <span className="ml-2 text-xs text-text-muted">
                        {new Date(shock.t2).toLocaleDateString()}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected positions */}
            {selected.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                  Your Fade Positions
                </h3>
                <div className="space-y-2">
                  {selected.map((s, i) => (
                    <div
                      key={s.market_id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 p-3"
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: COLORS[i] }}
                      />
                      <span className="flex-1 text-sm text-text-primary">
                        {s.question.substring(0, 45)}...{" "}
                        <span className="text-text-muted">
                          ({s.delta > 0 ? "+" : ""}
                          {(s.delta * 100).toFixed(0)}pp)
                        </span>
                      </span>
                      <label className="text-sm text-text-muted">$</label>
                      <input
                        type="number"
                        value={s.positionSize}
                        min={10}
                        max={5000}
                        step={10}
                        onChange={(e) =>
                          updateSize(s.market_id, Number(e.target.value))
                        }
                        className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => removeShock(s.market_id)}
                        className="text-sm text-no-text hover:text-no-text"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Portfolio Stats */}
            {portfolioStats && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                  <p className="text-xs text-text-muted">Positions</p>
                  <p className="text-lg font-bold text-text-primary">
                    {portfolioStats.numPositions}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                  <p className="text-xs text-text-muted">Total Deployed</p>
                  <p className="text-lg font-bold text-text-primary">
                    ${portfolioStats.totalSize}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                  <p className="text-xs text-text-muted">Expected P&L</p>
                  <p
                    className={`text-lg font-bold ${portfolioStats.expectedPnl >= 0 ? "text-yes-text" : "text-no-text"}`}
                  >
                    ${portfolioStats.expectedPnl}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                  <p className="text-xs text-text-muted">Win Rate</p>
                  <p className="text-lg font-bold text-text-primary">
                    {(portfolioStats.avgWinRate * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                  <p className="text-xs text-text-muted">Diversification</p>
                  <p className="text-lg font-bold text-accent">
                    {portfolioStats.diversificationBenefit}
                  </p>
                </div>
              </div>
            )}

            {/* Combined Payoff Chart */}
            {combinedPayoffByOutcome.length > 0 && (
              <div className="rounded-lg border border-border bg-surface-1 p-6">
                <h3 className="mb-4 text-lg font-semibold text-text-primary">
                  Combined Payoff Graph
                </h3>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={combinedPayoffByOutcome}
                      margin={{ top: 5, right: 20, left: 10, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis
                        dataKey="move"
                        tickFormatter={(v: number) => `${v}%`}
                        tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                        stroke="var(--text-muted)"
                        label={{
                          value: "Market Move (%)",
                          position: "bottom",
                          offset: 0,
                          style: { fontSize: 11, fill: "var(--text-muted)" },
                        }}
                      />
                      <YAxis
                        tickFormatter={(v: number) => `$${v}`}
                        tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                        stroke="var(--text-muted)"
                      />
                      <Tooltip
                        contentStyle={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "12px" }}
                        formatter={(value) => [
                          `$${Number(value).toFixed(2)}`,
                        ]}
                      />
                      <ReferenceLine
                        y={0}
                        stroke="var(--text-muted)"
                        strokeDasharray="3 3"
                      />

                      {selected.map((s, i) => (
                        <Line
                          key={i}
                          type="monotone"
                          dataKey={`shock_${i}`}
                          stroke={COLORS[i]}
                          strokeWidth={1}
                          dot={false}
                          strokeDasharray="4 4"
                          name={s.question.substring(0, 25) + "..."}
                        />
                      ))}

                      <Line
                        type="monotone"
                        dataKey="portfolio"
                        stroke="var(--accent)"
                        strokeWidth={3}
                        dot={false}
                        name="Portfolio"
                      />

                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Dashed lines = individual positions. Bold blue = combined
                  portfolio P&L. Diversification reduces variance when shocks are
                  uncorrelated.
                </p>
              </div>
            )}

            {selected.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-surface-2 py-12 text-center">
                <p className="text-sm text-text-muted">
                  Click on shocks above to build your fade portfolio
                </p>
              </div>
            )}

            <p className="text-xs text-text-muted">
              Assumes shock outcomes are independent across markets. In-sample
              estimates. Ignores transaction costs, slippage, and liquidity. Not
              investment advice.
            </p>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
