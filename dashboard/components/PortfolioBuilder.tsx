"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { Shock, SimilarStatsResponse } from "@/lib/types";

interface SelectedShock {
  market_id: string;
  question: string;
  category: string | null;
  delta: number;
  p_after: number;
  p_before: number;
  positionSize: number;
  ai_analysis?: Shock["ai_analysis"];
  source: "manual" | "ai";
}

interface PortfolioBuilderProps {
  allShocks: Shock[];
}

const POSITION_COLORS = ["#F26522", "#7c3aed", "#0891b2", "#c026d3"];
const QUICK_SIZES = [50, 100, 250, 500];

export default function PortfolioBuilder({ allShocks }: PortfolioBuilderProps) {
  const [selected, setSelected] = useState<SelectedShock[]>([]);
  const [similarStatsMap, setSimilarStatsMap] = useState<
    Record<string, SimilarStatsResponse>
  >({});
  const fetchingRef = useRef<Set<string>>(new Set());
  const [totalBudget, setTotalBudget] = useState(400);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentReport, setAgentReport] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [activeTab, setActiveTab] = useState<"recent" | "largest" | "live">(
    "recent",
  );
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Fetch similar-stats lazily when selections change
  useEffect(() => {
    if (selected.length === 0) return;

    const newIds = selected
      .map((s) => s.market_id)
      .filter(
        (id) => !similarStatsMap[id] && !fetchingRef.current.has(id),
      );
    if (newIds.length === 0) return;

    for (const id of newIds) fetchingRef.current.add(id);

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
        fetchingRef.current.delete(r.marketId);
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
    const riskReward =
      totalSize > 0 ? Math.abs(weightedPnl / totalSize) : 0;

    return {
      totalSize,
      numPositions: n,
      expectedPnl: Number(weightedPnl.toFixed(2)),
      avgWinRate: totalWeight > 0 ? weightedWinRate / totalWeight : 0,
      diversificationBenefit: ((1 - stdReduction) * 100).toFixed(0),
      maxLoss: -totalSize,
      riskReward,
    };
  }, [selected, similarStatsMap]);

  const correlationWarnings = useMemo(() => {
    const catCounts: Record<string, number> = {};
    for (const s of selected) {
      const cat = s.category ?? "uncategorized";
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
    return Object.entries(catCounts)
      .filter(([, count]) => count >= 2)
      .map(([cat, count]) => ({ category: cat, count }));
  }, [selected]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const s of allShocks) {
      if (s.category) cats.add(s.category);
    }
    return ["all", ...Array.from(cats).sort()];
  }, [allShocks]);

  const filteredShocks = useMemo(() => {
    let filtered = [...allShocks];
    if (categoryFilter !== "all") {
      filtered = filtered.filter((s) => s.category === categoryFilter);
    }
    if (activeTab === "live") {
      filtered = filtered.filter((s) => s.is_recent || s.is_live_alert);
      filtered.sort(
        (a, b) => new Date(b.t2).getTime() - new Date(a.t2).getTime(),
      );
    } else if (activeTab === "recent") {
      filtered.sort(
        (a, b) => new Date(b.t2).getTime() - new Date(a.t2).getTime(),
      );
    } else {
      filtered.sort((a, b) => b.abs_delta - a.abs_delta);
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (s) =>
          s.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.category
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ??
            false),
      );
    }
    return showAll ? filtered : filtered.slice(0, 20);
  }, [allShocks, searchQuery, showAll, activeTab, categoryFilter]);

  const liveCount = useMemo(
    () => allShocks.filter((s) => s.is_recent || s.is_live_alert).length,
    [allShocks],
  );

  const [now] = useState(() => Date.now());
  const formatTimeAgo = (t2: string) => {
    const diff = now - new Date(t2).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "< 1h ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

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
        p_before: shock.p_before,
        positionSize: 100,
        ai_analysis: shock.ai_analysis,
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

  const equalWeight = () => {
    if (selected.length === 0) return;
    const perPosition = Math.round(totalBudget / selected.length);
    setSelected(selected.map((s) => ({ ...s, positionSize: perPosition })));
  };

  const buildWithAgent = async () => {
    setAgentLoading(true);
    setAgentReport(null);
    setAgentError(null);
    try {
      const res = await fetch("/api/portfolio-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankroll: totalBudget }),
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
          const match = allShocks.find(
            (s) => s.market_id === alloc.market_id || s._id === alloc.shock_id,
          );
          aiPicks.push({
            market_id: match?.market_id ?? alloc.market_id,
            question: match?.question ?? alloc.question,
            category: match?.category ?? alloc.category,
            delta: match?.delta ?? alloc.delta,
            p_after: match?.p_after ?? alloc.p_after,
            p_before: match?.p_before ?? alloc.p_after,
            positionSize: alloc.size,
            ai_analysis: match?.ai_analysis,
            source: "ai",
          });
        }
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

  return (
    <div>
      {/* AI Portfolio Builder */}
      <div className="mb-6 rounded-xl border border-border bg-surface-1 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              AI Portfolio Builder
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Claude searches the web, picks the best fades, and sizes with
              half-Kelly.
            </p>
          </div>
          <button
            onClick={buildWithAgent}
            disabled={agentLoading}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {agentLoading ? "Building..." : "Build with AI"}
          </button>
        </div>
        {agentLoading && (
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <svg
              className="h-3.5 w-3.5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            Searching the web and building portfolio...
          </div>
        )}
        {agentError && (
          <p className="mt-3 text-xs text-no-text">{agentError}</p>
        )}
        {agentReport && (
          <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-4 text-xs leading-relaxed text-text-secondary">
            {agentReport}
          </pre>
        )}
      </div>

      {/* Two-column builder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT PANEL — Market selector */}
        <div className="lg:col-span-5">
          <div className="rounded-xl border border-border bg-surface-1">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">
                Markets
              </h2>
              <p className="mt-0.5 text-xs text-text-muted">
                Select up to 4 shocks to fade
              </p>
            </div>

            <div className="border-b border-border px-4 py-2">
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search markets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-8 pr-3 text-xs text-text-primary outline-none placeholder:text-text-muted focus:border-accent"
                />
              </div>

              {/* Tabs */}
              <div className="mt-2 flex items-center gap-1">
                {(
                  [
                    { key: "recent", label: "Recent" },
                    { key: "largest", label: "Largest" },
                    { key: "live", label: "Live" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      activeTab === tab.key
                        ? "bg-surface-3 text-text-primary"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {tab.label}
                    {tab.key === "live" && liveCount > 0 && (
                      <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-no-text" />
                    )}
                  </button>
                ))}
                <div className="flex-1" />
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-xs text-text-muted hover:text-accent"
                >
                  {showAll ? "Top 20" : `All ${allShocks.length}`}
                </button>
              </div>

              {/* Category filter pills */}
              <div className="mt-2 flex flex-wrap gap-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                      categoryFilter === cat
                        ? "bg-accent text-white"
                        : "bg-surface-2 text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Market list */}
            <div className="max-h-[500px] overflow-y-auto">
              {filteredShocks.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-text-muted">
                  No shocks match your filters
                </div>
              ) : (
                filteredShocks.map((shock) => {
                  const isSelected = !!selected.find(
                    (s) => s.market_id === shock.market_id,
                  );
                  const prob = Math.round(shock.p_after * 100);
                  const isLive = shock.is_recent || shock.is_live_alert;

                  return (
                    <button
                      key={shock._id}
                      onClick={() => addShock(shock)}
                      disabled={selected.length >= 4 || isSelected}
                      className={`group flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors ${
                        isSelected
                          ? "bg-accent-dim"
                          : "hover:bg-surface-2"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isLive && (
                            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-no-text" />
                          )}
                          <span className="truncate text-sm font-medium text-text-primary">
                            {shock.question}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {shock.category && (
                            <span className="text-[10px] uppercase tracking-wider text-text-muted">
                              {shock.category}
                            </span>
                          )}
                          <span className="text-[10px] text-text-muted">
                            {formatTimeAgo(shock.t2)}
                          </span>
                        </div>
                      </div>

                      <div className="w-14 shrink-0 text-right">
                        <div className="text-sm font-semibold text-text-primary">
                          {prob}%
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            shock.delta > 0
                              ? "text-yes-text"
                              : "text-no-text"
                          }`}
                        >
                          {shock.delta > 0 ? "+" : ""}
                          {(shock.delta * 100).toFixed(0)}pp
                        </div>
                      </div>

                      <div className="hidden w-12 shrink-0 sm:block">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${prob}%`,
                              backgroundColor:
                                shock.delta > 0
                                  ? "var(--st-yes)"
                                  : "var(--st-no)",
                            }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL — Positions + chart */}
        <div className="space-y-4 lg:col-span-7">
          {/* Positions card */}
          <div className="rounded-xl border border-border bg-surface-1">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-text-primary">
                Positions
              </h2>
              <div className="flex items-center gap-2">
                {selected.length > 0 && (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-text-muted">
                        Budget
                      </span>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
                          $
                        </span>
                        <input
                          type="number"
                          value={totalBudget}
                          min={50}
                          max={10000}
                          step={50}
                          onChange={(e) =>
                            setTotalBudget(Number(e.target.value))
                          }
                          className="w-16 rounded border border-border bg-surface-2 py-1 pl-4 pr-1 text-[10px] font-medium text-text-primary outline-none focus:border-accent"
                        />
                      </div>
                      <button
                        onClick={equalWeight}
                        className="rounded bg-accent px-2 py-1 text-[10px] font-semibold text-white transition-colors hover:opacity-90"
                      >
                        Equal
                      </button>
                    </div>
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">
                      {selected.length}/4
                    </span>
                  </>
                )}
              </div>
            </div>

            {selected.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">
                  <svg
                    className="h-5 w-5 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </div>
                <p className="text-sm text-text-muted">
                  Select markets to build your portfolio
                </p>
              </div>
            ) : (
              <div>
                {selected.map((s, i) => {
                  const stats = similarStatsMap[s.market_id];
                  const winRate = stats?.backtest?.win_rate_6h;
                  const avgPnl = stats?.backtest?.avg_pnl_per_dollar_6h;
                  const sampleSize = stats?.sample_size;
                  const fadeDir = s.delta > 0 ? "Fade Down" : "Fade Up";

                  return (
                    <div
                      key={s.market_id}
                      className="border-b border-border px-4 py-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-1 h-3 w-3 shrink-0 rounded"
                          style={{
                            backgroundColor: POSITION_COLORS[i],
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-text-primary">
                              {s.question}
                            </span>
                            <button
                              onClick={() => removeShock(s.market_id)}
                              className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                            >
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>

                          {s.ai_analysis && (
                            <p className="mt-0.5 truncate text-xs text-text-muted">
                              {s.ai_analysis.overreaction_assessment.length > 60
                                ? s.ai_analysis.overreaction_assessment.substring(0, 60) + "..."
                                : s.ai_analysis.overreaction_assessment}
                              <span
                                className={`ml-1.5 inline-block rounded px-1 py-px text-[9px] font-semibold uppercase ${
                                  s.ai_analysis.reversion_confidence === "high"
                                    ? "bg-yes-dim text-yes-text"
                                    : s.ai_analysis.reversion_confidence === "medium"
                                      ? "bg-surface-3 text-text-secondary"
                                      : "bg-no-dim text-no-text"
                                }`}
                              >
                                {s.ai_analysis.reversion_confidence}
                              </span>
                            </p>
                          )}

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                s.delta > 0
                                  ? "bg-no-dim text-no-text"
                                  : "bg-yes-dim text-yes-text"
                              }`}
                            >
                              {fadeDir}
                            </span>
                            <span className="font-mono text-xs text-text-secondary">
                              {Math.round(s.p_before * 100)}% &rarr;{" "}
                              {Math.round(s.p_after * 100)}%
                            </span>
                            {winRate != null && (
                              <span className="text-xs text-text-muted">
                                {(winRate * 100).toFixed(0)}% win
                                {avgPnl != null && (
                                  <>
                                    {" "}
                                    &middot; ${avgPnl.toFixed(3)}/$1
                                  </>
                                )}
                                {sampleSize != null && (
                                  <>
                                    {" "}
                                    &middot; n={sampleSize}
                                  </>
                                )}
                              </span>
                            )}
                            {sampleSize != null && sampleSize < 10 && (
                              <span className="text-[10px] font-medium text-amber-500">
                                Small sample
                              </span>
                            )}
                            {stats && stats.filter_level !== "tight" && (
                              <span className="text-[10px] text-text-muted">
                                ({stats.filter_level})
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-text-muted">
                              Size
                            </span>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                                $
                              </span>
                              <input
                                type="number"
                                value={s.positionSize}
                                min={10}
                                max={5000}
                                step={10}
                                onChange={(e) =>
                                  updateSize(
                                    s.market_id,
                                    Number(e.target.value),
                                  )
                                }
                                className="w-24 rounded-lg border border-border bg-surface-2 py-1.5 pl-5 pr-2 text-sm font-medium text-text-primary outline-none focus:border-accent"
                              />
                            </div>
                            {QUICK_SIZES.map((size) => (
                              <button
                                key={size}
                                onClick={() => updateSize(s.market_id, size)}
                                className={`text-xs transition-colors ${
                                  s.positionSize === size
                                    ? "font-medium text-accent"
                                    : "text-text-muted hover:text-text-primary"
                                }`}
                              >
                                ${size}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Correlation warning */}
          {correlationWarnings.length > 0 && (
            <div className="rounded-lg border-l-4 border-amber-400 bg-surface-2 px-4 py-3">
              <p className="text-xs font-semibold text-text-primary">
                Portfolio Correlation Warning
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {correlationWarnings.map((w, i) => (
                  <span key={w.category}>
                    {i > 0 && ", "}
                    {w.count} positions in &ldquo;{w.category}&rdquo;
                  </span>
                ))}{" "}
                may be correlated. Diversification benefit assumes independent
                outcomes.
              </p>
            </div>
          )}

          {/* Portfolio stats */}
          {portfolioStats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  Deployed
                </p>
                <p className="mt-1 text-lg font-bold text-text-primary">
                  ${portfolioStats.totalSize.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  Expected P&L
                </p>
                <p
                  className={`mt-1 text-lg font-bold ${
                    portfolioStats.expectedPnl >= 0
                      ? "text-yes-text"
                      : "text-no-text"
                  }`}
                >
                  {portfolioStats.expectedPnl >= 0 ? "+" : ""}$
                  {Math.abs(portfolioStats.expectedPnl).toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  Win Rate
                </p>
                <p className="mt-1 text-lg font-bold text-text-primary">
                  {(portfolioStats.avgWinRate * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  Risk/Reward
                </p>
                <p className="mt-1 text-lg font-bold text-text-primary">
                  {(portfolioStats.riskReward * 100).toFixed(1)}%
                </p>
                <p className="text-[10px] text-text-muted">
                  return on capital
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-1 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-text-muted">
                  Diversification
                </p>
                <p className="mt-1 text-lg font-bold text-accent">
                  {portfolioStats.diversificationBenefit}%
                </p>
                <p className="text-[10px] text-text-muted">
                  variance reduction
                </p>
              </div>
            </div>
          )}

          {/* Combined payoff chart */}
          {combinedPayoffByOutcome.length > 0 && (
            <div className="rounded-xl border border-border bg-surface-1 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">
                  Portfolio Payoff
                </h3>
                <div className="flex items-center gap-3">
                  {selected.map((s, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 rounded-sm"
                        style={{
                          backgroundColor: POSITION_COLORS[i],
                        }}
                      />
                      <span className="max-w-[80px] truncate text-[10px] text-text-muted">
                        {s.question.split(" ").slice(0, 3).join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart
                    data={combinedPayoffByOutcome}
                    margin={{ top: 5, right: 10, left: 10, bottom: 20 }}
                  >
                    <defs>
                      <linearGradient
                        id="portfolioGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--st-accent)"
                          stopOpacity={0.15}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--st-accent)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--st-grid)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="move"
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 10, fill: "var(--st-muted)" }}
                      stroke="var(--st-border)"
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: "Market Move",
                        position: "bottom",
                        offset: 2,
                        style: { fontSize: 10, fill: "var(--st-muted)" },
                      }}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `$${v}`}
                      tick={{ fontSize: 10, fill: "var(--st-muted)" }}
                      stroke="var(--st-border)"
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--st-s1)",
                        border: "1px solid var(--st-border)",
                        borderRadius: "8px",
                        color: "var(--st-txt)",
                        fontSize: "12px",
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      }}
                      formatter={(value) => [
                        `$${Number(value).toFixed(2)}`,
                      ]}
                      labelFormatter={(v) => `Move: ${v}%`}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="var(--st-muted)"
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                    {selected.map((s, i) => (
                      <Line
                        key={i}
                        type="monotone"
                        dataKey={`shock_${i}`}
                        stroke={POSITION_COLORS[i]}
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                        strokeOpacity={0.5}
                        name={s.question.substring(0, 20) + "..."}
                      />
                    ))}
                    <Area
                      type="monotone"
                      dataKey="portfolio"
                      stroke="var(--st-accent)"
                      strokeWidth={2.5}
                      fill="url(#portfolioGrad)"
                      dot={false}
                      name="Portfolio"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          {selected.length > 0 && (
            <p className="text-[10px] leading-relaxed text-text-muted">
              Historical backtest results. Assumes independent outcomes. Ignores
              transaction costs, slippage, and liquidity constraints. Not
              investment advice.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
