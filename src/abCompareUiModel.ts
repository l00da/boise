import type { AbReplayDiffSummary } from "../../../gold-grey/src/lib/imu/replay/abReplayCompare.ts";

export type AbCompareUiState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "unavailable"; message: string }
  | { phase: "failure"; message: string }
  | {
      phase: "success";
      estimatorA: string;
      estimatorB: string;
      summary: AbReplayDiffSummary;
      tracePathA: string;
      tracePathB: string;
      summaryPath: string;
    };

export function preservationLabel(verified: boolean): string {
  return verified ? "Generic A preserved" : "Generic A preservation failed";
}

export function preservationTone(verified: boolean): "ok" | "bad" {
  return verified ? "ok" : "bad";
}

export function formatVelocity(v: number | null): string {
  if (v === null) return "—";
  return v.toExponential(4);
}

export function buildAbCompareSummaryRows(summary: AbReplayDiffSummary) {
  return [
    { label: "Sample count", value: String(summary.sampleCount) },
    { label: "Clamp events — A (Generic)", value: String(summary.clampCountA) },
    { label: "Clamp events — B (Oracle squat)", value: String(summary.clampCountB) },
    { label: "Oracle suppression count", value: String(summary.samplesWhereBSuppressedAClamp) },
    {
      label: "Mean |bodyZ| difference (m/s)",
      value: summary.meanAbsBodyZVelocityDiff.toExponential(4),
    },
    {
      label: "Max |bodyZ| difference (m/s)",
      value: summary.maxAbsBodyZVelocityDiff.toExponential(4),
    },
    {
      label: "Final bodyZ — A",
      value: formatVelocity(summary.finalBodyZVelocityA),
    },
    {
      label: "Final bodyZ — B",
      value: formatVelocity(summary.finalBodyZVelocityB),
    },
    {
      label: "A-preservation",
      value: preservationLabel(summary.aPreservationVerified),
      tone: preservationTone(summary.aPreservationVerified),
    },
  ];
}
