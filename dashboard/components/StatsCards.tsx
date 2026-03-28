import { AggregateStats } from "@/lib/types";

interface StatsCardsProps {
  stats: AggregateStats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const items = [
    {
      label: "Total Shocks",
      value: stats.total_shocks.toString(),
      delta: `across ${stats.total_markets} markets`,
      color: "text-text-primary",
    },
    {
      label: "6h Reversion Rate",
      value:
        stats.reversion_rate_6h !== null
          ? `${(stats.reversion_rate_6h * 100).toFixed(1)}%`
          : "—",
      delta:
        stats.reversion_rate_6h !== null && stats.reversion_rate_6h > 0.5
          ? "majority revert"
          : "below 50%",
      color:
        stats.reversion_rate_6h !== null && stats.reversion_rate_6h > 0.5
          ? "text-yes-text"
          : "text-text-primary",
    },
    {
      label: "Mean Reversion",
      value:
        stats.mean_reversion_6h !== null
          ? `${(stats.mean_reversion_6h * 100).toFixed(1)}pp`
          : "—",
      delta: "avg magnitude at 6h",
      color: "text-text-primary",
    },
    {
      label: "Sample Size",
      value: stats.sample_size_6h.toString(),
      delta: `${stats.sample_size_6h} valid at 6h`,
      color: "text-text-primary",
    },
    {
      label: "Win Rate",
      value:
        stats.backtest?.win_rate_6h != null
          ? `${(stats.backtest.win_rate_6h * 100).toFixed(0)}%`
          : "—",
      delta: "fade strategy 6h",
      color:
        stats.backtest?.win_rate_6h != null && stats.backtest.win_rate_6h > 0.5
          ? "text-yes-text"
          : "text-text-primary",
    },
  ];

  return (
    <div className="flex overflow-x-auto border-b border-border">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex-1 min-w-[120px] px-4 py-3 ${i < items.length - 1 ? "border-r border-border" : ""}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {item.label}
          </p>
          <p className={`mt-1 font-mono text-base font-medium ${item.color}`}>
            {item.value}
          </p>
          <p className="mt-0.5 text-[10px] text-text-muted">{item.delta}</p>
        </div>
      ))}
    </div>
  );
}
