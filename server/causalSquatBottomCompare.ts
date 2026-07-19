import { existsSync, readFileSync } from "node:fs";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import {
  analyzeCausalSquatBottomVsOracle,
  getCausalSquatBottomThresholds,
} from "../../../gold-grey/src/lib/imu/replay/causalSquatBottomDetector.ts";
import { findOracleBottomReversalsFromTrace } from "../../../gold-grey/src/lib/imu/replay/oracleBottomTimestamper.ts";
import { findCausalSquatBottomReversalsFromTrace } from "../../../gold-grey/src/lib/imu/replay/causalSquatBottomDetector.ts";
import { buildCausalSquatBottomTimeline } from "../src/causalSquatBottomTimelineModel.ts";
import type { ReplayService } from "./replay.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import { loadOrBuildTraceA } from "./bottomReversalMissAnalysis.ts";

export type CausalSquatBottomCompareResult =
  | {
      status: "success";
      summary: ReturnType<typeof analyzeCausalSquatBottomVsOracle>["summary"];
      matches: ReturnType<typeof analyzeCausalSquatBottomVsOracle>["matches"];
      misses: ReturnType<typeof analyzeCausalSquatBottomVsOracle>["misses"];
      falsePositives: ReturnType<typeof analyzeCausalSquatBottomVsOracle>["falsePositives"];
      thresholds: ReturnType<typeof getCausalSquatBottomThresholds>;
      timeline: ReturnType<typeof buildCausalSquatBottomTimeline>;
      tracePathA: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

export function runCausalSquatBottomCompareForSample(
  replay: ReplayService,
  baseName: string,
  toleranceMs = 300
): CausalSquatBottomCompareResult {
  const tracePath = replay.getAbCompareTracePaths(baseName).tracePathA;
  if (!existsSync(tracePath)) {
    return {
      status: "failure",
      message: "A-novbt trace not found. Run Replay or A/B Compare first.",
    };
  }

  try {
    const rows = parseReplayTraceJsonl(readFileSync(tracePath, "utf8"));
    const report = analyzeCausalSquatBottomVsOracle(rows, toleranceMs);
    const oracleEvents = findOracleBottomReversalsFromTrace(rows);
    const causalEvents = findCausalSquatBottomReversalsFromTrace(rows);
    const timeline = buildCausalSquatBottomTimeline(rows, oracleEvents, causalEvents);

    return {
      status: "success",
      summary: report.summary,
      matches: report.matches,
      misses: report.misses,
      falsePositives: report.falsePositives,
      thresholds: getCausalSquatBottomThresholds(),
      timeline,
      tracePathA: tracePath,
    };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}

export async function runCausalSquatBottomCompareWithReplay(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string,
  toleranceMs = 300
): Promise<CausalSquatBottomCompareResult> {
  const detail = dataset.getSample(exerciseId, baseName);
  const labelId = detail.meta?.label?.exerciseId ?? null;

  if (!detail.sample) {
    return { status: "failure", message: "Sample fixture missing or invalid" };
  }
  if (labelId !== "squat") {
    return {
      status: "unavailable",
      message: `Causal squat-bottom compare supports squat captures only (label: ${labelId ?? "unknown"})`,
    };
  }

  try {
    await loadOrBuildTraceA(replay, detail.baseName, detail.sample);
    return runCausalSquatBottomCompareForSample(replay, detail.baseName, toleranceMs);
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}
