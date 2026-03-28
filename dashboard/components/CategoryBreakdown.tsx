import { AggregateStats } from "@/lib/types";

interface CategoryBreakdownProps {
  stats: AggregateStats;
}

export default function CategoryBreakdown({ stats }: CategoryBreakdownProps) {
  const categories = Object.entries(stats.by_category);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        Reversion by Category
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                Category
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                Shocks
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                6h Reversion Rate
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-text-muted">
                Mean Reversion
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface-1">
            {categories.map(([name, cat]) => (
              <tr
                key={name}
                className="transition-colors hover:bg-surface-2"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium capitalize text-text-primary">
                  {name}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm text-text-muted">
                  {cat.count}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm text-text-secondary">
                  {cat.reversion_rate_6h !== null
                    ? `${(cat.reversion_rate_6h * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-sm text-text-secondary">
                  {cat.mean_reversion_6h !== null
                    ? `${(cat.mean_reversion_6h * 100).toFixed(1)}pp`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
