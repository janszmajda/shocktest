"use client";

import Link from "next/link";
import { Shock } from "@/lib/types";

interface LiveAlertBannerProps {
  alerts: Shock[];
}

export default function LiveAlertBanner({ alerts }: LiveAlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.slice(0, 3).map((alert) => (
        <div
          key={alert._id}
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex animate-pulse items-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  LIVE
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  SHOCK DETECTED
                  {alert.hours_ago != null
                    ? ` ${Math.round(alert.hours_ago)}h ago`
                    : ""}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-gray-800">
                &ldquo;{alert.question}&rdquo;{" "}
                <span className="font-medium">
                  {(alert.p_before * 100).toFixed(0)}% &rarr;{" "}
                  {(alert.p_after * 100).toFixed(0)}%
                </span>{" "}
                <span
                  className={`font-semibold ${alert.delta > 0 ? "text-green-700" : "text-red-700"}`}
                >
                  ({alert.delta > 0 ? "+" : ""}
                  {(alert.delta * 100).toFixed(0)}pp)
                </span>
              </p>
              {alert.ai_analysis && (
                <p className="mt-1 text-xs text-purple-700">
                  AI: {alert.ai_analysis.likely_cause}
                </p>
              )}
              {alert.historical_win_rate != null &&
                alert.historical_avg_pnl != null && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    Historical edge:{" "}
                    {(alert.historical_win_rate * 100).toFixed(0)}% win rate |
                    Avg return: ${alert.historical_avg_pnl.toFixed(4)}/$1
                  </p>
                )}
            </div>
            <Link
              href={`/shock/${alert._id}`}
              className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Analyze &rarr;
            </Link>
          </div>
        </div>
      ))}
      {alerts.length > 3 && (
        <p className="text-center text-xs text-gray-400">
          +{alerts.length - 3} more live signals
        </p>
      )}
    </div>
  );
}
