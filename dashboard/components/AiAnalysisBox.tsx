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
  high: { bg: "bg-yes-dim", text: "text-yes-text", border: "border-border" },
  medium: { bg: "bg-accent-dim", text: "text-accent", border: "border-border" },
  low: { bg: "bg-no-dim", text: "text-no-text", border: "border-border" },
} as const;

export default function AiAnalysisBox({ analysis }: AiAnalysisBoxProps) {
  const conf = CONFIDENCE_STYLES[analysis.reversion_confidence];

  return (
    <div className="rounded-lg border border-accent bg-accent-dim p-5">
      <div className="mb-3 flex items-center gap-2">
        <h4 className="text-sm font-semibold text-accent">
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
          <span className="font-medium text-accent">Likely cause: </span>
          <span className="text-text-secondary">{analysis.likely_cause}</span>
        </div>
        <div>
          <span className="font-medium text-accent">Assessment: </span>
          <span className="text-text-secondary">
            {analysis.overreaction_assessment}
          </span>
        </div>
      </div>
    </div>
  );
}
