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
import { Shock, SimilarStatsResponse } from "@/lib/types";
import { DUMMY_SHOCKS } from "@/lib/dummyData";

interface SelectedShock {
  market_id: string;
  question: string;
  category: string | null;
  delta: number;
  p_after: number;
  positionSize: number;
  source: "manual" | "ai";
}

export default function PortfolioPage() {
  const [allShocks, setAllShocks] = useState<Shock[]>(DUMMY_SHOCKS);
  const [selected, setSelected] = useState<SelectedShock[]>([]);
  const [similarStatsMap, setSimilarStatsMap] = useState<
    Record<string, SimilarStatsResponse>
  >({});
  const [loading, setLoading] = useState(true);
  const [bankroll, setBankroll] = useState(500);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentReport, setAgentReport] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/shocks")
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((data: Shock[]) => {
        if (data.length > 0) setAllShocks(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Fetch similar-stats whenever selected shocks change
  useEffect(() => {
    if (selected.length === 0) return;

    const newIds = selected
      .map((s) => s.market_id)
      .filter((id) => !similarStatsMap[id]);
    if (newIds.length === 0) return;

    Promise.all(
      newIds.map((marketId) => {
        const s = selected.find((sel) => sel.market_id === marketId)!;
        const params = new URLSearchParams({
          abs_delta: String(Math.abs(s.delta)),
          direction: s.delta > 0 ? "up" : "down",
        });
        if (s.category) params.set("category", s.category);
        return fetch(`/api/similar-stats?${params}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data: SimilarStatsResponse | null) => ({
            marketId,
            data,
          }));
      }),
    ).then((results) => {
      const updates: Record<string, SimilarStatsResponse> = {};
      for (const r of results) {
        if (r.data) updates[r.marketId] = r.data;
      }
      if (Object.keys(updates).length > 0) {
        setSimilarStatsMap((prev) => ({ ...prev, ...updates }));
      }
    });
  }, [selected, similarStatsMap]);

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
    if (selected.length === 0) return null;

    const totalSize = selected.reduce((sum, s) => sum + s.positionSize, 0);
    const n = selected.length;

    // Compute weighted expected P&L from per-shock similar stats
    let weightedPnl = 0;
    let weightedWinRate = 0;
    let totalWeight = 0;
    let hasStats = false;

    for (const s of selected) {
      const stats = similarStatsMap[s.market_id];
      if (stats?.backtest) {
        hasStats = true;
        const avgPnl = stats.backtest.avg_pnl_per_dollar_6h;
        const winRate = stats.backtest.win_rate_6h ?? 0;
        weightedPnl += s.positionSize * avgPnl;
        weightedWinRate += s.positionSize * winRate;
        totalWeight += s.positionSize;
      }
    }

    if (!hasStats) return null;

    const stdReduction = Math.sqrt(1 / n);

    return {
      totalSize,
      numPositions: n,
      expectedPnl: Number(weightedPnl.toFixed(2)),
      avgWinRate: totalWeight > 0 ? weightedWinRate / totalWeight : 0,
      diversificationBenefit: `${((1 - stdReduction) * 100).toFixed(0)}% variance reduction`,
      maxLoss: -totalSize,
    };
  }, [selected, similarStatsMap]);

  const addShock = (shock: Shock) => {
    if (selected.length >= 8) return;
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
        source: "manual",
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

  const buildWithAgent = async () => {
    setAgentLoading(true);
    setAgentReport(null);
    setAgentError(null);
    try {
      const res = await fetch("/api/portfolio-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankroll }),
      });
      const data = (await res.json()) as {
        report?: string;
        allocations?: Array<{
          shock_id?: string;
          market_id: string;
          question: string;
          category: string | null;
          delta: number;
          p_after: number;
          current_price?: number | null;
          size: number;
        }>;
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      if (data.report) setAgentReport(data.report);
      if (data.allocations && data.allocations.length > 0) {
        const aiPicks: SelectedShock[] = [];
        for (const alloc of data.allocations) {
          // Try to match against existing shocks for best data
          const match = allShocks.find(
            (s) => s.market_id === alloc.market_id || s._id === alloc.shock_id,
          );
          aiPicks.push({
            market_id: match?.market_id ?? alloc.market_id,
            question: match?.question ?? alloc.question,
            category: match?.category ?? alloc.category,
            delta: match?.delta ?? alloc.delta,
            p_after: match?.p_after ?? alloc.p_after,
            positionSize: alloc.size,
            source: "ai",
          });
        }
        // Merge: keep manual picks that don't overlap, add AI picks
        setSelected((prev) => {
          const aiIds = new Set(aiPicks.map((p) => p.market_id));
          const kept = prev.filter((s) => !aiIds.has(s.market_id));
          return [...kept, ...aiPicks].slice(0, 8);
        });
      }
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAgentLoading(false);
    }
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
            Build a fade portfolio manually or with AI. Add, remove, and resize
            positions freely.
          </p>
        </div>

        {/* AI Portfolio Builder */}
        <div className="rounded-lg border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">AI Portfolio Builder</h3>
              <p className="mt-0.5 text-xs text-text-muted">
                K2 scans shocks, sizes positions with half-Kelly, and writes a trade memo.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">$</span>
                <input
                  type="number"
                  value={bankroll}
                  onChange={(e) => setBankroll(Math.max(50, Number(e.target.value)))}
                  min={50}
                  className="w-20 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={buildWithAgent}
                disabled={agentLoading}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {agentLoading ? "Building..." : "Build with AI"}
              </button>
            </div>
          </div>
          {agentLoading && (
            <div className="mt-3 flex items-center gap-2 text-sm text-text-muted">
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Running 3-agent pipeline (Scanner → Risk Manager → Reporter)...
            </div>
          )}
          {agentError && (
            <p className="mt-3 text-sm text-no-text">{agentError}</p>
          )}
          {agentReport && (
            <pre className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-4 text-xs leading-relaxed text-text-secondary">
              {agentReport}
            </pre>
          )}
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
                      disabled={selected.length >= 8 || isSelected}
                      className={`rounded-lg border p-3 text-left text-sm transition ${
                        isSelected
                          ? "border-accent bg-accent-dim opacity-60"
                          : "border-border bg-surface-1 hover:border-accent hover:bg-accent-dim"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <span className={`mr-1.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${shock.delta > 0 ? "bg-no-dim text-no-text" : "bg-yes-dim text-yes-text"}`}>
                        {shock.delta > 0 ? "NO" : "YES"}
                      </span>
                      <span className="font-medium text-text-primary">
                        {shock.question.substring(0, 50)}
                        {shock.question.length > 50 ? "..." : ""}
                      </span>
                      <span
                        className={`ml-2 font-semibold ${shock.delta > 0 ? "text-no-text" : "text-yes-text"}`}
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
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${s.delta > 0 ? "bg-no-dim text-no-text" : "bg-yes-dim text-yes-text"}`}>
                        {s.delta > 0 ? "Buy NO" : "Buy YES"}
                      </span>
                      <span className="flex-1 text-sm text-text-primary">
                        {s.question.substring(0, 40)}...{" "}
                        <span className="text-text-muted">
                          ({s.delta > 0 ? "+" : ""}
                          {(s.delta * 100).toFixed(0)}pp)
                        </span>
                        {s.source === "ai" && (
                          <span className="ml-1.5 rounded bg-accent-dim px-1.5 py-0.5 text-[10px] font-medium text-accent">
                            AI
                          </span>
                        )}
                      </span>
                      {similarStatsMap[s.market_id] && (
                        <span className="text-xs text-text-muted">
                          n={similarStatsMap[s.market_id].sample_size}
                          {similarStatsMap[s.market_id].filter_level !== "tight" && (
                            <span className="ml-1 text-amber-500">
                              ({similarStatsMap[s.market_id].filter_level})
                            </span>
                          )}
                        </span>
                      )}
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
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
