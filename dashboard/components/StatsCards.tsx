import { AggregateStats } from "@/lib/types";

interface StatsCardsProps {
  stats: AggregateStats;
}

function formatPct(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatPp(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}pp`;
}

const cards = [
  {
    label: "Total Shocks",
    getValue: (s: AggregateStats) => s.total_shocks.toString(),
  },
  {
    label: "6h Reversion Rate",
    getValue: (s: AggregateStats) => formatPct(s.reversion_rate_6h),
  },
  {
    label: "Mean Reversion (6h)",
    getValue: (s: AggregateStats) => formatPp(s.mean_reversion_6h),
  },
  {
    label: "Markets Analyzed",
    getValue: (s: AggregateStats) => s.total_markets.toString(),
  },
];

export default function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <p className="text-sm font-medium text-gray-500">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900">
            {card.getValue(stats)}
          </p>
        </div>
      ))}
    </div>
  );
}
