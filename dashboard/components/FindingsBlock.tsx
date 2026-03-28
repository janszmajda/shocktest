import { AggregateStats } from "@/lib/types";

interface FindingsBlockProps {
  stats: AggregateStats;
}

export default function FindingsBlock({ stats }: FindingsBlockProps) {
  const rate6h = stats.reversion_rate_6h;
  const mean6h = stats.mean_reversion_6h;

  if (rate6h === null || mean6h === null) {
    return (
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <p className="text-sm text-text-muted">
          Waiting for analysis results. Stats will appear here once the analysis
          pipeline runs.
        </p>
      </div>
    );
  }

  const winRate = stats.backtest?.win_rate_6h;

  return (
    <div className="rounded-lg border-l-2 border-accent bg-accent-dim p-4">
      <p className="text-sm leading-relaxed text-text-primary">
        Across{" "}
        <span className="font-mono font-semibold">{stats.total_shocks}</span>{" "}
        probability shocks in{" "}
        <span className="font-mono font-semibold">{stats.total_markets}</span>{" "}
        markets,{" "}
        <span className="font-mono font-semibold text-yes-text">
          {(rate6h * 100).toFixed(0)}%
        </span>{" "}
        reverted within 6 hours
        {winRate !== null && winRate !== undefined && (
          <>
            {" "}
            — with a simulated fade strategy producing a{" "}
            <span className="font-mono font-semibold text-yes-text">
              {(winRate * 100).toFixed(0)}%
            </span>{" "}
            win rate
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
