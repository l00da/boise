import { existsSync, readFileSync } from "node:fs";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import {
  runBottomReversalMissAnalysis,
  type ExpectedReversalRegion,
} from "../../../gold-grey/src/lib/imu/replay/bottomReversalMissAnalysis.ts";
import type { ReplayService } from "./replay.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import { runEstimatorReplay } from "../../../gold-grey/src/lib/imu/replay/replayRunner.ts";
import { serializeReplayTrace } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type BottomReversalMissAnalysisResult =
  | { status: "success"; report: ReturnType<typeof runBottomReversalMissAnalysis> }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

function tracePathForSample(replay: ReplayService, baseName: string): string {
  return replay.getAbCompareTracePaths(baseName).tracePathA;
}

export async function loadOrBuildTraceA(
  replay: ReplayService,
  baseName: string,
  fixture: import("../../../gold-grey/src/lib/imu/replay/fixturePlayer.ts").ImuFixtureFile
): Promise<string> {
  const tracePath = tracePathForSample(replay, baseName);
  if (!existsSync(tracePath)) {
    await replay.replaySample(baseName, fixture, { recompute: false });
  }
  if (!existsSync(tracePath)) {
    const result = runEstimatorReplay(fixture.samples);
    mkdirSync(path.dirname(tracePath), { recursive: true });
    writeFileSync(tracePath, serializeReplayTrace(result.rows), "utf8");
  }
  return tracePath;
}

export function runBottomReversalMissAnalysisForSample(
  replay: ReplayService,
  baseName: string,
  expectedRegions: ExpectedReversalRegion[] = []
): BottomReversalMissAnalysisResult {
  const tracePath = replay.getAbCompareTracePaths(baseName).tracePathA;
  if (!existsSync(tracePath)) {
    return {
      status: "failure",
      message: "A-novbt trace not found. Run Replay or A/B Compare first.",
    };
  }

  try {
    const rows = parseReplayTraceJsonl(readFileSync(tracePath, "utf8"));
    const report = runBottomReversalMissAnalysis(rows, expectedRegions);
    return { status: "success", report };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}

export async function runBottomReversalMissAnalysisWithReplay(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string,
  expectedRegions: ExpectedReversalRegion[] = []
): Promise<BottomReversalMissAnalysisResult> {
  const detail = dataset.getSample(exerciseId, baseName);
  const labelId = detail.meta?.label?.exerciseId ?? null;

  if (!detail.sample) {
    return { status: "failure", message: "Sample fixture missing or invalid" };
  }
  if (labelId !== "squat") {
    return {
      status: "unavailable",
      message: `Bottom-reversal miss analysis supports squat captures only (label: ${labelId ?? "unknown"})`,
    };
  }

  try {
    await loadOrBuildTraceA(replay, detail.baseName, detail.sample);
    return runBottomReversalMissAnalysisForSample(replay, detail.baseName, expectedRegions);
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}
