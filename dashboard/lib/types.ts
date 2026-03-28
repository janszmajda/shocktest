export interface PricePoint {
  t: number; // unix timestamp (seconds)
  p: number; // probability 0-1
}

export interface Market {
  _id: string;
  market_id: string;
  source: "polymarket" | "manifold";
  question: string;
  token_id: string;
  volume: number;
  category: string | null;
  series?: PricePoint[]; // only included when fetching single market
}

export interface Shock {
  _id: string;
  market_id: string;
  source: string;
  question: string;
  category: string | null;
  t1: string; // ISO timestamp
  t2: string; // ISO timestamp
  p_before: number;
  p_after: number;
  delta: number; // signed (-0.15 = dropped 15pp)
  abs_delta: number; // absolute value
  post_move_1h: number | null;
  post_move_6h: number | null;
  post_move_24h: number | null;
  reversion_1h: number | null;
  reversion_6h: number | null;
  reversion_24h: number | null;
}

export interface CategoryStats {
  count: number;
  reversion_rate_6h: number | null;
  mean_reversion_6h: number | null;
  sample_size_6h: number;
}

export interface AggregateStats {
  _id: string; // always "aggregate_stats"
  total_shocks: number;
  total_markets: number;
  reversion_rate_1h: number | null;
  reversion_rate_6h: number | null;
  reversion_rate_24h: number | null;
  mean_reversion_1h: number | null;
  mean_reversion_6h: number | null;
  mean_reversion_24h: number | null;
  std_reversion_6h: number | null;
  sample_size_1h: number;
  sample_size_6h: number;
  sample_size_24h: number;
  by_category: Record<string, CategoryStats>;
}
