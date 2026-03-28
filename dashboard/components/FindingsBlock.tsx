import { AggregateStats } from "@/lib/types";

interface FindingsBlockProps {
  stats: AggregateStats;
}

export default function FindingsBlock({ stats }: FindingsBlockProps) {
  const rate6h = stats.reversion_rate_6h;
  const mean6h = stats.mean_reversion_6h;

  if (rate6h === null || mean6h === null) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          Waiting for analysis results. Stats will appear here once the analysis
          pipeline runs.
        </p>
      </div>
    );
  }

  const winRate = stats.backtest?.win_rate_6h;

  return (
    <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
      <p className="text-base leading-relaxed text-blue-900">
        Across <strong>{stats.total_shocks}</strong> probability shocks in{" "}
        <strong>{stats.total_markets}</strong> markets, we found that{" "}
        <strong>{(rate6h * 100).toFixed(0)}%</strong> reverted within 6 hours
        {winRate !== null && winRate !== undefined && (
          <>
            {" "}
            — with a simulated fade strategy producing a{" "}
            <strong>{(winRate * 100).toFixed(0)}%</strong> win rate
          </>
        )}
        .
        {stats.by_category?.politics?.reversion_rate_6h != null && (
          <>
            {" "}
            Political markets reverted at{" "}
            {(stats.by_category.politics.reversion_rate_6h * 100).toFixed(0)}%
            vs. the overall average.
          </>
        )}
      </p>
    </div>
  );
}
