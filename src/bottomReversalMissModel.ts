import type { BottomReversalRejectionReason } from "../../../gold-grey/src/lib/imu/replay/bottomReversalMissAnalysis.ts";

export type ExpectedReversalRegion = {
  id: string;
  centerEpochMs: number;
  centerSampleIndex: number;
  label?: string;
};

export const REJECTION_REASON_LABELS: Record<BottomReversalRejectionReason, string> = {
  no_meaningful_negative_descent: "No meaningful negative descent",
  no_confirmed_positive_ascent: "No confirmed positive ascent",
  smoothing_removed_crossing: "Smoothing removed the crossing",
  minimum_duration_sample_threshold: "Minimum duration / sample threshold",
  stationary_zvu_exclusion: "Stationary / ZVU exclusion",
  sign_convention_inconsistency: "Sign convention inconsistency",
  pipeline_not_ready: "Pipeline not ready",
  min_rep_separation_deduped: "Min rep separation (deduped)",
};

const STORAGE_PREFIX = "boise-workbench:expected-reversals:";

export function storageKey(exerciseId: string, baseName: string): string {
  return `${STORAGE_PREFIX}${exerciseId}/${baseName}`;
}

export function loadExpectedRegions(exerciseId: string, baseName: string): ExpectedReversalRegion[] {
  try {
    const raw = localStorage.getItem(storageKey(exerciseId, baseName));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExpectedReversalRegion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveExpectedRegions(
  exerciseId: string,
  baseName: string,
  regions: ExpectedReversalRegion[]
): void {
  localStorage.setItem(storageKey(exerciseId, baseName), JSON.stringify(regions));
}

export function nearestVelocityPoint(
  series: { sampleIndex: number; epochMs: number }[],
  epochMs: number
): { sampleIndex: number; epochMs: number } {
  let best = series[0]!;
  let bestDist = Math.abs(best.epochMs - epochMs);
  for (const pt of series) {
    const dist = Math.abs(pt.epochMs - epochMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = pt;
    }
  }
  return best;
}
