import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runAbcBottomResetCompare } from "../../../gold-grey/src/lib/imu/replay/abcBottomResetCompare.ts";
import { serializeReplayTrace } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import { BOTTOM_REVERSAL_LABEL_FIXTURES } from "../../../gold-grey/src/lib/imu/replay/bottomReversalLabelFixtures.ts";
import { buildAbcBottomResetTimeline } from "../src/abcBottomResetTimelineModel.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import type { ReplayService } from "./replay.ts";

export const ABC_TRACE_KEY_B2 = "B2-generic-oracle-reset";

export type AbcBottomResetCompareResult =
  | {
      status: "success";
      traceKeyA: string;
      traceKeyB1: string;
      traceKeyB2: string;
      tracePathA: string;
      tracePathB1: string;
      tracePathB2: string;
      summaryPath: string;
      summary: ReturnType<typeof runAbcBottomResetCompare>["summary"];
      deliberateResetEvents: ReturnType<typeof runAbcBottomResetCompare>["deliberateResetEvents"];
      oracleBottomEpochMs: number[];
      timeline: ReturnType<typeof buildAbcBottomResetTimeline>;
      estimatorA: "Generic estimator";
      estimatorB1: "Oracle squat clamp-suppression";
      estimatorB2: "Generic + oracle-timed deliberate reset (offline counterfactual)";
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

function confirmedMotionEpochsForSample(baseName: string): number[] {
  const entry = BOTTOM_REVERSAL_LABEL_FIXTURES.find((l) => l.baseName === baseName);
  return entry?.expectedReversals.map((r) => r.epochMs) ?? [];
}

export async function runAbcBottomResetCompareForSample(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string
): Promise<AbcBottomResetCompareResult> {
  const detail = dataset.getSample(exerciseId, baseName);
  const labelId = detail.meta?.label?.exerciseId ?? null;

  if (!detail.sample) {
    return { status: "failure", message: "Sample fixture missing or invalid" };
  }
  if (labelId !== "squat") {
    return {
      status: "unavailable",
      message: `ABC bottom-reset compare supports squat captures only (label: ${labelId ?? "unknown"})`,
    };
  }

  try {
    const { traceKeyA, traceKeyB, tracePathA, tracePathB } = replay.getAbCompareTracePaths(
      detail.baseName
    );
    const tracePathB2 = path.join(path.dirname(tracePathA), `${ABC_TRACE_KEY_B2}.jsonl`);

    const result = runAbcBottomResetCompare(detail.sample.samples, {
      confirmedMotionEpochMs: confirmedMotionEpochsForSample(detail.baseName),
    });

    const traceDir = path.dirname(tracePathA);
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(tracePathA, serializeReplayTrace(result.traceA), "utf8");
    writeFileSync(tracePathB, serializeReplayTrace(result.traceB1), "utf8");
    writeFileSync(tracePathB2, serializeReplayTrace(result.traceB2), "utf8");
    const summaryPath = path.join(traceDir, "abc-bottom-reset-summary.json");
    writeFileSync(summaryPath, JSON.stringify(result.summary, null, 2) + "\n", "utf8");

    const timeline = buildAbcBottomResetTimeline(
      result.traceA,
      result.traceB1,
      result.traceB2,
      result.oracleBottomEpochMs,
      result.deliberateResetEvents
    );

    return {
      status: "success",
      traceKeyA,
      traceKeyB1: traceKeyB,
      traceKeyB2: ABC_TRACE_KEY_B2,
      tracePathA,
      tracePathB1: tracePathB,
      tracePathB2,
      summaryPath,
      summary: result.summary,
      deliberateResetEvents: result.deliberateResetEvents,
      oracleBottomEpochMs: result.oracleBottomEpochMs,
      timeline,
      estimatorA: "Generic estimator",
      estimatorB1: "Oracle squat clamp-suppression",
      estimatorB2: "Generic + oracle-timed deliberate reset (offline counterfactual)",
    };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}
