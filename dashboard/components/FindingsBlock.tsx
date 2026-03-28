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
          Waiting for analysis results. Stats will appear here once Person 2
          runs the analysis pipeline.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <p className="text-sm leading-relaxed text-blue-900">
        <strong>Finding:</strong> In a sample of{" "}
        <strong>{stats.total_shocks} shocks</strong> across{" "}
        <strong>{stats.total_markets} prediction markets</strong>,{" "}
        <strong>{(rate6h * 100).toFixed(0)}%</strong> showed mean reversion
        within 6 hours, with an average magnitude of{" "}
        <strong>{(mean6h * 100).toFixed(1)} percentage points</strong>.
        {stats.by_category?.politics && (
          <>
            {" "}
            Political markets reverted at a higher rate (
            {(stats.by_category.politics.reversion_rate_6h! * 100).toFixed(0)}
            %) than the overall average.
          </>
        )}
      </p>
    </div>
  );
}
