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
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Reversion by Category
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Category
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Shocks
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                6h Reversion Rate
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                Mean Reversion
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {categories.map(([name, cat]) => (
              <tr key={name} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium capitalize text-gray-900">
                  {name}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                  {cat.count}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
                  {cat.reversion_rate_6h !== null
                    ? `${(cat.reversion_rate_6h * 100).toFixed(0)}%`
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-700">
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
