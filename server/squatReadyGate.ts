import { existsSync, readFileSync } from "node:fs";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import { runSquatRepCycle } from "../../../gold-grey/src/lib/imu/replay/squatRepCycle.ts";
import { buildSquatReadyGateTimeline } from "../src/squatReadyGateTimelineModel.ts";
import type { ReplayService } from "./replay.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import { loadOrBuildTraceA } from "./bottomReversalMissAnalysis.ts";

export type SquatReadyGateCompareResult =
  | {
      status: "success";
      readyThresholds: ReturnType<typeof runSquatRepCycle>["eccentricStart"]["readyGate"]["thresholds"];
      eccentricConfig: ReturnType<typeof runSquatRepCycle>["eccentricConfig"];
      cycleConfig: ReturnType<typeof runSquatRepCycle>["config"];
      reachedReady: boolean;
      readyEpochMs: number | null;
      reachedEccentric: boolean;
      eccentricStartEpochMs: number | null;
      countedReps: number;
      transitionCount: number;
      transitions: ReturnType<typeof runSquatRepCycle>["transitions"];
      eccentricEvents: ReturnType<typeof buildSquatReadyGateTimeline>["eccentricEvents"];
      phaseEvents: ReturnType<typeof runSquatRepCycle>["phaseEvents"];
      repCompleteEvents: ReturnType<typeof runSquatRepCycle>["repCompleteEvents"];
      reps: ReturnType<typeof runSquatRepCycle>["reps"];
      rejectedCandidateCount: number;
      timeline: ReturnType<typeof buildSquatReadyGateTimeline>;
      tracePathA: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

export function runSquatReadyGateForSample(
  replay: ReplayService,
  baseName: string
): SquatReadyGateCompareResult {
  const tracePath = replay.getAbCompareTracePaths(baseName).tracePathA;
  if (!existsSync(tracePath)) {
    return {
      status: "failure",
      message: "A-novbt trace not found. Run Replay or A/B Compare first.",
    };
  }

  try {
    const rows = parseReplayTraceJsonl(readFileSync(tracePath, "utf8"));
    const cycle = runSquatRepCycle(rows);
    const timeline = buildSquatReadyGateTimeline(rows, cycle);

    return {
      status: "success",
      readyThresholds: cycle.eccentricStart.readyGate.thresholds,
      eccentricConfig: cycle.eccentricConfig,
      cycleConfig: cycle.config,
      reachedReady: cycle.eccentricStart.readyGate.reachedReady,
      readyEpochMs: cycle.eccentricStart.readyGate.readyEpochMs,
      reachedEccentric: cycle.reachedEccentric,
      eccentricStartEpochMs: cycle.eccentricStartEpochMs,
      countedReps: cycle.countedReps,
      transitionCount: cycle.transitions.length,
      transitions: cycle.transitions,
      eccentricEvents: timeline.eccentricEvents,
      phaseEvents: cycle.phaseEvents,
      repCompleteEvents: cycle.repCompleteEvents,
      reps: cycle.reps,
      rejectedCandidateCount: cycle.allRejectedCandidates.length,
      timeline,
      tracePathA: tracePath,
    };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}

export async function runSquatReadyGateWithReplay(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string
): Promise<SquatReadyGateCompareResult> {
  const detail = dataset.getSample(exerciseId, baseName);
  const labelId = detail.meta?.label?.exerciseId ?? null;

  if (!detail.sample) {
    return { status: "failure", message: "Sample fixture missing or invalid" };
  }
  if (labelId !== "squat") {
    return {
      status: "unavailable",
      message: "Squat ready gate applies to squat captures only",
    };
  }

  await loadOrBuildTraceA(replay, detail.baseName, detail.sample);
  return runSquatReadyGateForSample(replay, detail.baseName);
}
