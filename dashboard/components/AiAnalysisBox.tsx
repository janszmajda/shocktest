"use client";

interface AiAnalysis {
  likely_cause: string;
  overreaction_assessment: string;
  reversion_confidence: "low" | "medium" | "high";
}

interface AiAnalysisBoxProps {
  analysis: AiAnalysis;
}

const CONFIDENCE_STYLES = {
  high: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  low: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
} as const;

export default function AiAnalysisBox({ analysis }: AiAnalysisBoxProps) {
  const conf = CONFIDENCE_STYLES[analysis.reversion_confidence];

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-purple-900">
          AI Shock Analysis
        </h4>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${conf.bg} ${conf.text} ${conf.border} border`}
        >
          {analysis.reversion_confidence} confidence
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <span className="font-medium text-purple-800">Likely cause: </span>
          <span className="text-gray-700">{analysis.likely_cause}</span>
        </div>
        <div>
          <span className="font-medium text-purple-800">Assessment: </span>
          <span className="text-gray-700">
            {analysis.overreaction_assessment}
          </span>
        </div>
      </div>
    </div>
  );
}
