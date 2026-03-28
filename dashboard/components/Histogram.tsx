"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { Shock } from "@/lib/types";

interface HistogramProps {
  shocks: Shock[];
}

interface Bin {
  label: string;
  count: number;
  isReversion: boolean;
}

function buildBins(shocks: Shock[]): Bin[] {
  // Post-shock 6h reversion values, binned
  const values = shocks
    .map((s) => s.reversion_6h)
    .filter((v): v is number => v !== null);

  const bins: Bin[] = [
    { label: "<-5pp", count: 0, isReversion: false },
    { label: "-5 to -2", count: 0, isReversion: false },
    { label: "-2 to 0", count: 0, isReversion: false },
    { label: "0 to 2", count: 0, isReversion: true },
    { label: "2 to 5", count: 0, isReversion: true },
    { label: "5 to 10", count: 0, isReversion: true },
    { label: ">10pp", count: 0, isReversion: true },
  ];

  for (const v of values) {
    const pp = v * 100;
    if (pp < -5) bins[0].count++;
    else if (pp < -2) bins[1].count++;
    else if (pp < 0) bins[2].count++;
    else if (pp < 2) bins[3].count++;
    else if (pp < 5) bins[4].count++;
    else if (pp < 10) bins[5].count++;
    else bins[6].count++;
  }

  return bins;
}

export default function Histogram({ shocks }: HistogramProps) {
  const bins = buildBins(shocks);

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        Post-Shock Reversion Distribution (6h)
      </h2>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={bins}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              stroke="#9ca3af"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#9ca3af"
              allowDecimals={false}
            />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {bins.map((bin, idx) => (
                <Cell
                  key={idx}
                  fill={bin.isReversion ? "#22c55e" : "#ef4444"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-xs text-gray-400">
        Green = reversion (price moved back), Red = continuation (price kept
        going)
      </p>
    </div>
  );
}
