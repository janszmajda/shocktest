import {
  Shock,
  AggregateStats,
  PricePoint,
  BacktestResponse,
  SimilarStatsResponse,
} from "./types";

// Generate dummy timestamps relative to now so shocks always look recent
function recentISO(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

export const DUMMY_SHOCKS: Shock[] = [
  // ── POLITICS ──
  {
    _id: "demo-1",
    market_id: "trump-2028-election",
    source: "polymarket",
    question: "Will Trump win the 2028 presidential election?",
    category: "politics",
    t1: recentISO(35),
    t2: recentISO(28),
    p_before: 0.42,
    p_after: 0.57,
    delta: 0.15,
    abs_delta: 0.15,
    post_move_1h: -0.03,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.03,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(28),
    hours_ago: 0.47,
    ai_analysis: {
      likely_cause: "New CBS poll shows Trump leading in 3 swing states after VP announcement.",
      overreaction_assessment: "Polls often cause short-term spikes that partially revert as other polls emerge.",
      reversion_confidence: "high",
    },
  },
  {
    _id: "demo-2",
    market_id: "fed-rate-cut-june",
    source: "polymarket",
    question: "Will the Fed cut rates by June 2026?",
    category: "politics",
    t1: recentISO(50),
    t2: recentISO(42),
    p_before: 0.61,
    p_after: 0.38,
    delta: -0.23,
    abs_delta: 0.23,
    post_move_1h: 0.05,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.05,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(42),
    hours_ago: 0.7,
    ai_analysis: {
      likely_cause: "Hot CPI print came in at 3.4% vs 3.1% expected, pushing rate cut expectations lower.",
      overreaction_assessment: "Single inflation prints often cause outsized moves that partially revert within hours.",
      reversion_confidence: "medium",
    },
  },
  {
    _id: "demo-3",
    market_id: "trump-xi-meeting",
    source: "polymarket",
    question: "Will Trump meet with Xi Jinping before July?",
    category: "geopolitics",
    t1: recentISO(22),
    t2: recentISO(15),
    p_before: 0.67,
    p_after: 0.41,
    delta: -0.26,
    abs_delta: 0.26,
    post_move_1h: 0.08,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.08,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(15),
    hours_ago: 0.25,
  },

  // ── CRYPTO ──
  {
    _id: "demo-4",
    market_id: "btc-above-100k-q2",
    source: "polymarket",
    question: "Will Bitcoin be above $100k on June 30?",
    category: "crypto",
    t1: recentISO(40),
    t2: recentISO(33),
    p_before: 0.58,
    p_after: 0.39,
    delta: -0.19,
    abs_delta: 0.19,
    post_move_1h: 0.04,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.04,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(33),
    hours_ago: 0.55,
    ai_analysis: {
      likely_cause: "Bitcoin flash crash to $82k triggered by large liquidation cascade on Binance.",
      overreaction_assessment: "Flash crashes on leveraged exchanges frequently revert as spot buyers step in.",
      reversion_confidence: "high",
    },
  },
  {
    _id: "demo-5",
    market_id: "eth-above-4000-april",
    source: "polymarket",
    question: "Will Ethereum stay above $4,000 through April?",
    category: "crypto",
    t1: recentISO(18),
    t2: recentISO(12),
    p_before: 0.71,
    p_after: 0.52,
    delta: -0.19,
    abs_delta: 0.19,
    post_move_1h: 0.06,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.06,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(12),
    hours_ago: 0.2,
  },
  {
    _id: "demo-6",
    market_id: "solana-etf-2026",
    source: "polymarket",
    question: "Will a Solana ETF be approved in 2026?",
    category: "crypto",
    t1: recentISO(55),
    t2: recentISO(48),
    p_before: 0.24,
    p_after: 0.41,
    delta: 0.17,
    abs_delta: 0.17,
    post_move_1h: -0.05,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.05,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(48),
    hours_ago: 0.8,
  },

  // ── SPORTS ──
  {
    _id: "demo-7",
    market_id: "lakers-nba-championship",
    source: "polymarket",
    question: "Will the Lakers win the 2026 NBA Championship?",
    category: "sports",
    t1: recentISO(30),
    t2: recentISO(24),
    p_before: 0.12,
    p_after: 0.22,
    delta: 0.10,
    abs_delta: 0.10,
    post_move_1h: -0.03,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.03,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(24),
    hours_ago: 0.4,
  },
  {
    _id: "demo-8",
    market_id: "real-madrid-ucl-2026",
    source: "polymarket",
    question: "Will Real Madrid win the Champions League 2026?",
    category: "sports",
    t1: recentISO(45),
    t2: recentISO(38),
    p_before: 0.31,
    p_after: 0.19,
    delta: -0.12,
    abs_delta: 0.12,
    post_move_1h: 0.04,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.04,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(38),
    hours_ago: 0.63,
  },

  // ── GEOPOLITICS ──
  {
    _id: "demo-9",
    market_id: "us-israel-strike-yemen",
    source: "polymarket",
    question: "Will the US/Israel conduct a joint strike on Yemen by April?",
    category: "geopolitics",
    t1: recentISO(25),
    t2: recentISO(19),
    p_before: 0.51,
    p_after: 0.38,
    delta: -0.13,
    abs_delta: 0.13,
    post_move_1h: 0.03,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.03,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(19),
    hours_ago: 0.32,
  },
  {
    _id: "demo-10",
    market_id: "ukraine-ceasefire-q2",
    source: "polymarket",
    question: "Will there be a Ukraine-Russia ceasefire by June 2026?",
    category: "geopolitics",
    t1: recentISO(38),
    t2: recentISO(31),
    p_before: 0.18,
    p_after: 0.34,
    delta: 0.16,
    abs_delta: 0.16,
    post_move_1h: -0.07,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.07,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(31),
    hours_ago: 0.52,
    ai_analysis: {
      likely_cause: "Reuters reported back-channel talks between US envoy and Russian FM in Istanbul.",
      overreaction_assessment: "Ceasefire rumors have spiked this market 4 times before — each reverted within hours.",
      reversion_confidence: "high",
    },
  },

  // ── OTHER / TECH ──
  {
    _id: "demo-11",
    market_id: "us-recession-2026",
    source: "polymarket",
    question: "Will the US enter a recession in 2026?",
    category: "politics",
    t1: recentISO(48),
    t2: recentISO(41),
    p_before: 0.22,
    p_after: 0.36,
    delta: 0.14,
    abs_delta: 0.14,
    post_move_1h: -0.02,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.02,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(41),
    hours_ago: 0.68,
  },
  {
    _id: "demo-12",
    market_id: "hottest-year-record",
    source: "polymarket",
    question: "Will 2026 be the hottest year on record?",
    category: "other",
    t1: recentISO(52),
    t2: recentISO(46),
    p_before: 0.09,
    p_after: 0.21,
    delta: 0.12,
    abs_delta: 0.12,
    post_move_1h: -0.04,
    post_move_6h: null,
    post_move_24h: null,
    reversion_1h: 0.04,
    reversion_6h: null,
    reversion_24h: null,
    is_live_alert: true,
    is_recent: true,
    detected_at: recentISO(46),
    hours_ago: 0.77,
  },
];

export const DUMMY_BACKTEST: BacktestResponse = {
  backtest: {
    win_rate_1h: 0.58,
    win_rate_6h: 0.62,
    win_rate_24h: 0.55,
    avg_pnl_per_dollar_6h: 0.028,
    max_drawdown_6h: -0.14,
    total_trades: 1337,
    by_category: {
      politics: { win_rate_6h: 0.65, avg_pnl_6h: 0.034, sample_size: 412 },
      crypto: { win_rate_6h: 0.54, avg_pnl_6h: 0.019, sample_size: 335 },
      sports: { win_rate_6h: 0.56, avg_pnl_6h: 0.022, sample_size: 190 },
      geopolitics: { win_rate_6h: 0.61, avg_pnl_6h: 0.031, sample_size: 148 },
      other: { win_rate_6h: 0.54, avg_pnl_6h: 0.018, sample_size: 252 },
    },
  },
  distribution_1h: {
    bin_edges: [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15, 0.20],
    bin_counts: [12, 45, 118, 89, 156, 134, 67, 28],
    percentiles: { p10: -0.06, p25: -0.01, p50: 0.03, p75: 0.08, p90: 0.13 },
    mean: 0.028,
    std: 0.072,
    min: -0.18,
    max: 0.24,
  },
  distribution_6h: {
    bin_edges: [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12, 0.16],
    bin_counts: [18, 56, 142, 78, 189, 162, 84, 41],
    percentiles: { p10: -0.05, p25: 0.0, p50: 0.03, p75: 0.07, p90: 0.12 },
    mean: 0.028,
    std: 0.058,
    min: -0.14,
    max: 0.19,
  },
  distribution_24h: {
    bin_edges: [-0.15, -0.10, -0.05, 0, 0.05, 0.10, 0.15, 0.20],
    bin_counts: [22, 68, 130, 95, 145, 119, 58, 23],
    percentiles: { p10: -0.07, p25: -0.02, p50: 0.02, p75: 0.06, p90: 0.11 },
    mean: 0.021,
    std: 0.065,
    min: -0.19,
    max: 0.22,
  },
};

export const DUMMY_STATS: AggregateStats = {
  _id: "aggregate_stats",
  total_shocks: 1337,
  total_markets: 959,
  reversion_rate_1h: 0.58,
  reversion_rate_6h: 0.62,
  reversion_rate_24h: 0.55,
  mean_reversion_1h: 0.021,
  mean_reversion_6h: 0.028,
  mean_reversion_24h: 0.024,
  std_reversion_6h: 0.058,
  sample_size_1h: 1337,
  sample_size_6h: 1248,
  sample_size_24h: 1102,
  by_category: {
    politics: {
      count: 412,
      reversion_rate_6h: 0.65,
      mean_reversion_6h: 0.034,
      sample_size_6h: 398,
    },
    crypto: {
      count: 335,
      reversion_rate_6h: 0.54,
      mean_reversion_6h: 0.019,
      sample_size_6h: 312,
    },
    sports: {
      count: 190,
      reversion_rate_6h: 0.56,
      mean_reversion_6h: 0.022,
      sample_size_6h: 178,
    },
    geopolitics: {
      count: 148,
      reversion_rate_6h: 0.61,
      mean_reversion_6h: 0.031,
      sample_size_6h: 139,
    },
    other: {
      count: 252,
      reversion_rate_6h: 0.54,
      mean_reversion_6h: 0.018,
      sample_size_6h: 221,
    },
  },
  backtest: DUMMY_BACKTEST.backtest!,
};

export const DUMMY_SIMILAR_STATS: SimilarStatsResponse = {
  backtest: DUMMY_BACKTEST.backtest!,
  distribution_1h: DUMMY_BACKTEST.distribution_1h,
  distribution_6h: DUMMY_BACKTEST.distribution_6h,
  distribution_24h: DUMMY_BACKTEST.distribution_24h,
  sample_size: 39,
  filter_level: "tight",
};

/** Generate realistic price series around a shock event */
export function generateDummySeries(
  pBefore: number,
  pAfter: number,
  minutesBefore = 180,
  minutesAfter = 60,
): PricePoint[] {
  const points: PricePoint[] = [];
  const shockTime = Date.now() / 1000 - minutesAfter * 60;
  const startTime = shockTime - minutesBefore * 60;

  // Pre-shock: gentle drift around pBefore
  for (let i = 0; i < minutesBefore; i += 2) {
    const t = startTime + i * 60;
    const noise = (Math.random() - 0.5) * 0.02;
    const drift = ((pAfter - pBefore) * 0.05 * i) / minutesBefore;
    points.push({ t, p: Math.max(0.01, Math.min(0.99, pBefore + noise + drift)) });
  }

  // Shock: sharp move over ~5 minutes
  const shockSteps = 5;
  for (let i = 0; i <= shockSteps; i++) {
    const t = shockTime + (i * 60);
    const progress = i / shockSteps;
    const eased = progress * progress * (3 - 2 * progress); // smoothstep
    const p = pBefore + (pAfter - pBefore) * eased;
    points.push({ t, p: Math.max(0.01, Math.min(0.99, p)) });
  }

  // Post-shock: partial reversion with noise
  const reversionRate = 0.3 + Math.random() * 0.3; // 30-60% reversion
  for (let i = 6; i <= minutesAfter; i += 2) {
    const t = shockTime + i * 60;
    const revProgress = Math.min(1, (i - 5) / (minutesAfter - 5));
    const reversion = (pAfter - pBefore) * reversionRate * revProgress;
    const noise = (Math.random() - 0.5) * 0.015;
    const p = pAfter - reversion + noise;
    points.push({ t, p: Math.max(0.01, Math.min(0.99, p)) });
  }

  return points;
}

export const DUMMY_PRICE_SERIES: PricePoint[] = generateDummySeries(0.42, 0.57);
