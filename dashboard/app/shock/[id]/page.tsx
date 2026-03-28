import Link from "next/link";
import Header from "@/components/Header";
import PriceChart from "@/components/PriceChart";
import Footer from "@/components/Footer";
import { DUMMY_SHOCKS, DUMMY_PRICE_SERIES } from "@/lib/dummyData";

interface ShockDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ShockDetailPage({ params }: ShockDetailPageProps) {
  const { id } = await params;

  // Using dummy data until real MongoDB data flows in (Hours 16-20)
  const shock = DUMMY_SHOCKS.find((s) => s._id === id) ?? DUMMY_SHOCKS[0];
  const series = DUMMY_PRICE_SERIES;

  const shockT1 = new Date(shock.t1).getTime() / 1000;
  const shockT2 = new Date(shock.t2).getTime() / 1000;

  function formatPp(val: number | null): string {
    if (val === null) return "—";
    const sign = val > 0 ? "+" : "";
    return `${sign}${(val * 100).toFixed(1)}pp`;
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-blue-600 hover:underline"
        >
          &larr; Back to dashboard
        </Link>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {shock.question}
          </h2>
          <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-500">
            <span>Source: {shock.source}</span>
            <span>&middot;</span>
            <span>Category: {shock.category ?? "uncategorized"}</span>
            <span>&middot;</span>
            <span>
              Shock: {(shock.p_before * 100).toFixed(0)}% &rarr;{" "}
              {(shock.p_after * 100).toFixed(0)}% (
              {shock.delta > 0 ? "+" : ""}
              {(shock.delta * 100).toFixed(1)}pp)
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-medium text-gray-500">
            Probability Over Time
          </h3>
          <PriceChart series={series} shockT1={shockT1} shockT2={shockT2} />
        </div>

        <div>
          <h3 className="mb-4 text-lg font-semibold text-gray-900">
            Post-Shock Outcomes
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Horizon
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Post Move
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Reversion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    1 hour
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.post_move_1h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.reversion_1h)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    6 hours
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.post_move_6h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.reversion_6h)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    24 hours
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.post_move_24h)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700">
                    {formatPp(shock.reversion_24h)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
