import type { AbReplayDiffSummary } from "../../../gold-grey/src/lib/imu/replay/abReplayCompare.ts";
import type { AbClampTimelinePayload } from "../src/abClampTimelineModel.ts";
import { finalizeAbCompareTimeline } from "./abCompareResponse.ts";
import { loadAbClampTimelineForSample } from "./abClampTimeline.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import type { ReplayService } from "./replay.ts";

/** Oracle B rules currently implemented for these exercise ids only. */
export const ORACLE_SUPPORTED_EXERCISES = ["squat"] as const;

export type AbCompareSuccess = {
  status: "success";
  traceKeyA: string;
  traceKeyB: string;
  tracePathA: string;
  tracePathB: string;
  summaryPath: string;
  summary: AbReplayDiffSummary;
  timeline: AbClampTimelinePayload;
  estimatorA: "Generic estimator";
  estimatorB: "Oracle squat estimator";
};

export type AbCompareFailure = {
  status: "failure";
  message: string;
};

export type AbCompareUnavailable = {
  status: "unavailable";
  message: string;
  sampleExerciseId: string | null;
};

export type AbCompareResult = AbCompareSuccess | AbCompareFailure | AbCompareUnavailable;

export function sampleLabelExerciseId(detail: {
  exerciseId: string;
  meta: { label: { exerciseId: string } } | null;
}): string | null {
  return detail.meta?.label?.exerciseId ?? null;
}

export function isOracleAbSupported(exerciseId: string | null): boolean {
  return (
    exerciseId !== null &&
    (ORACLE_SUPPORTED_EXERCISES as readonly string[]).includes(exerciseId)
  );
}

export async function runAbCompareForSample(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string
): Promise<AbCompareResult> {
  const detail = dataset.getSample(exerciseId, baseName);
  const labelId = sampleLabelExerciseId(detail);

  if (!detail.sample) {
    return { status: "failure", message: "Sample fixture missing or invalid" };
  }

  if (!isOracleAbSupported(labelId)) {
    return {
      status: "unavailable",
      message: `Oracle B currently supports squat only. Sample label: ${labelId ?? "unknown"}`,
      sampleExerciseId: labelId,
    };
  }

  try {
    const result = await replay.runAbCompare(detail.baseName, detail.sample);

    let timeline: AbClampTimelinePayload | undefined = result.timeline;
    if (!timeline?.velocitySeries?.length && !timeline?.rows?.length) {
      const loaded = loadAbClampTimelineForSample(replay, detail.baseName);
      if (loaded.status === "success") {
        timeline = loaded.timeline;
      }
    }

    const finalized = timeline ? finalizeAbCompareTimeline(timeline) : null;
    if (!finalized?.rows?.length) {
      return {
        status: "failure",
        message: "A/B compare succeeded but timeline payload could not be built",
      };
    }

    return {
      status: "success",
      traceKeyA: result.traceKeyA,
      traceKeyB: result.traceKeyB,
      tracePathA: result.tracePathA,
      tracePathB: result.tracePathB,
      summaryPath: result.summaryPath,
      summary: result.summary,
      timeline: finalized,
      estimatorA: "Generic estimator",
      estimatorB: "Oracle squat estimator",
    };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}
