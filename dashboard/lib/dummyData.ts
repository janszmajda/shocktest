import {
  Shock,
  AggregateStats,
  PricePoint,
  BacktestResponse,
} from "./types";

export const DUMMY_SHOCKS: Shock[] = [
  {
    _id: "shock-001",
    market_id: "will-trump-win-2028",
    source: "polymarket",
    question: "Will Trump win the 2028 presidential election?",
    category: "politics",
    t1: "2026-03-15T14:00:00Z",
    t2: "2026-03-15T14:30:00Z",
    p_before: 0.42,
    p_after: 0.57,
    delta: 0.15,
    abs_delta: 0.15,
    post_move_1h: -0.08,
    post_move_6h: -0.11,
    post_move_24h: -0.09,
    reversion_1h: 0.08,
    reversion_6h: 0.11,
    reversion_24h: 0.09,
  },
  {
    _id: "shock-002",
    market_id: "btc-above-100k-june",
    source: "polymarket",
    question: "Will Bitcoin be above $100k on June 30?",
    category: "crypto",
    t1: "2026-03-20T09:00:00Z",
    t2: "2026-03-20T09:45:00Z",
    p_before: 0.65,
    p_after: 0.52,
    delta: -0.13,
    abs_delta: 0.13,
    post_move_1h: 0.04,
    post_move_6h: 0.07,
    post_move_24h: 0.1,
    reversion_1h: 0.04,
    reversion_6h: 0.07,
    reversion_24h: 0.1,
  },
  {
    _id: "shock-003",
    market_id: "fed-rate-cut-may",
    source: "polymarket",
    question: "Will the Fed cut rates in May 2026?",
    category: "politics",
    t1: "2026-03-18T16:30:00Z",
    t2: "2026-03-18T17:00:00Z",
    p_before: 0.35,
    p_after: 0.52,
    delta: 0.17,
    abs_delta: 0.17,
    post_move_1h: -0.06,
    post_move_6h: -0.1,
    post_move_24h: -0.12,
    reversion_1h: 0.06,
    reversion_6h: 0.1,
    reversion_24h: 0.12,
  },
  {
    _id: "shock-004",
    market_id: "lakers-win-championship",
    source: "manifold",
    question: "Will the Lakers win the 2026 NBA Championship?",
    category: "sports",
    t1: "2026-03-22T20:00:00Z",
    t2: "2026-03-22T20:30:00Z",
    p_before: 0.12,
    p_after: 0.22,
    delta: 0.1,
    abs_delta: 0.1,
    post_move_1h: -0.03,
    post_move_6h: -0.05,
    post_move_24h: -0.04,
    reversion_1h: 0.03,
    reversion_6h: 0.05,
    reversion_24h: 0.04,
  },
  {
    _id: "shock-005",
    market_id: "eth-merge-success",
    source: "polymarket",
    question: "Will Ethereum stay above $4000 through April?",
    category: "crypto",
    t1: "2026-03-19T11:00:00Z",
    t2: "2026-03-19T11:30:00Z",
    p_before: 0.71,
    p_after: 0.58,
    delta: -0.13,
    abs_delta: 0.13,
    post_move_1h: 0.02,
    post_move_6h: 0.05,
    post_move_24h: 0.08,
    reversion_1h: 0.02,
    reversion_6h: 0.05,
    reversion_24h: 0.08,
  },
  {
    _id: "shock-006",
    market_id: "oscars-best-picture",
    source: "manifold",
    question: "Will 'The Brutalist' win Best Picture at the Oscars?",
    category: "entertainment",
    t1: "2026-03-25T02:00:00Z",
    t2: "2026-03-25T02:15:00Z",
    p_before: 0.28,
    p_after: 0.45,
    delta: 0.17,
    abs_delta: 0.17,
    post_move_1h: -0.12,
    post_move_6h: -0.15,
    post_move_24h: -0.14,
    reversion_1h: 0.12,
    reversion_6h: 0.15,
    reversion_24h: 0.14,
  },
  {
    _id: "shock-007",
    market_id: "us-recession-2026",
    source: "polymarket",
    question: "Will the US enter a recession in 2026?",
    category: "politics",
    t1: "2026-03-21T14:00:00Z",
    t2: "2026-03-21T14:45:00Z",
    p_before: 0.22,
    p_after: 0.34,
    delta: 0.12,
    abs_delta: 0.12,
    post_move_1h: -0.01,
    post_move_6h: 0.03,
    post_move_24h: -0.02,
    reversion_1h: 0.01,
    reversion_6h: -0.03,
    reversion_24h: 0.02,
  },
  {
    _id: "shock-008",
    market_id: "champions-league-winner",
    source: "manifold",
    question: "Will Real Madrid win the Champions League 2026?",
    category: "sports",
    t1: "2026-03-23T21:00:00Z",
    t2: "2026-03-23T21:30:00Z",
    p_before: 0.31,
    p_after: 0.19,
    delta: -0.12,
    abs_delta: 0.12,
    post_move_1h: 0.04,
    post_move_6h: 0.06,
    post_move_24h: 0.08,
    reversion_1h: 0.04,
    reversion_6h: 0.06,
    reversion_24h: 0.08,
  },
];

export const DUMMY_BACKTEST: BacktestResponse = {
  backtest: {
    win_rate_1h: 0.62,
    win_rate_6h: 0.68,
    win_rate_24h: 0.55,
    avg_pnl_per_dollar_6h: 0.034,
    max_drawdown_6h: -0.12,
    total_trades: 47,
    by_category: {
      politics: { win_rate_6h: 0.72, avg_pnl_6h: 0.041, sample_size: 18 },
      crypto: { win_rate_6h: 0.6, avg_pnl_6h: 0.029, sample_size: 15 },
      sports: { win_rate_6h: 0.63, avg_pnl_6h: 0.032, sample_size: 8 },
      other: { win_rate_6h: 0.67, avg_pnl_6h: 0.035, sample_size: 6 },
    },
  },
  distribution_1h: null,
  distribution_6h: {
    bin_edges: [-0.12, -0.09, -0.06, -0.03, 0, 0.03, 0.06, 0.09, 0.12, 0.15],
    bin_counts: [1, 2, 4, 8, 6, 10, 8, 5, 3],
    percentiles: { p10: -0.04, p25: 0.01, p50: 0.03, p75: 0.06, p90: 0.1 },
    mean: 0.034,
    std: 0.052,
    min: -0.12,
    max: 0.15,
  },
  distribution_24h: null,
};

export const DUMMY_STATS: AggregateStats = {
  _id: "aggregate_stats",
  total_shocks: 47,
  total_markets: 83,
  reversion_rate_1h: 0.62,
  reversion_rate_6h: 0.68,
  reversion_rate_24h: 0.55,
  mean_reversion_1h: 0.028,
  mean_reversion_6h: 0.034,
  mean_reversion_24h: 0.031,
  std_reversion_6h: 0.021,
  sample_size_1h: 47,
  sample_size_6h: 47,
  sample_size_24h: 42,
  by_category: {
    politics: {
      count: 18,
      reversion_rate_6h: 0.72,
      mean_reversion_6h: 0.041,
      sample_size_6h: 18,
    },
    crypto: {
      count: 15,
      reversion_rate_6h: 0.6,
      mean_reversion_6h: 0.029,
      sample_size_6h: 15,
    },
    sports: {
      count: 8,
      reversion_rate_6h: 0.63,
      mean_reversion_6h: 0.032,
      sample_size_6h: 8,
    },
    other: {
      count: 6,
      reversion_rate_6h: 0.67,
      mean_reversion_6h: 0.035,
      sample_size_6h: 6,
    },
  },
  backtest: DUMMY_BACKTEST.backtest!,
};

// 100+ points simulating 2-min interval data around a shock
// stable → sudden jump → partial reversion
function generateDummySeries(): PricePoint[] {
  const points: PricePoint[] = [];
  const baseTime = new Date("2026-03-15T12:00:00Z").getTime() / 1000;
  let price = 0.42;

  // Pre-shock: stable around 0.42 (60 points = 2 hours)
  for (let i = 0; i < 60; i++) {
    price += (Math.random() - 0.5) * 0.005;
    price = Math.max(0.01, Math.min(0.99, price));
    points.push({ t: baseTime + i * 120, p: Math.round(price * 1000) / 1000 });
  }

  // Shock: jump from ~0.42 to ~0.57 over 15 points (30 min)
  const shockTarget = 0.57;
  for (let i = 0; i < 15; i++) {
    price += (shockTarget - price) * 0.3 + (Math.random() - 0.5) * 0.008;
    price = Math.max(0.01, Math.min(0.99, price));
    points.push({
      t: baseTime + (60 + i) * 120,
      p: Math.round(price * 1000) / 1000,
    });
  }

  // Post-shock: partial reversion toward ~0.48 (75 points = 2.5 hours)
  const reversionTarget = 0.48;
  for (let i = 0; i < 75; i++) {
    price += (reversionTarget - price) * 0.02 + (Math.random() - 0.5) * 0.006;
    price = Math.max(0.01, Math.min(0.99, price));
    points.push({
      t: baseTime + (75 + i) * 120,
      p: Math.round(price * 1000) / 1000,
    });
  }

  return points;
}

export const DUMMY_PRICE_SERIES: PricePoint[] = generateDummySeries();
