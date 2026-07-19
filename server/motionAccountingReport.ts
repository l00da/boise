import { existsSync, readFileSync } from "node:fs";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import { runMotionAccountingReport } from "../../../gold-grey/src/lib/imu/replay/motionAccountingReport.ts";
import { BOTTOM_REVERSAL_LABEL_FIXTURES } from "../../../gold-grey/src/lib/imu/replay/bottomReversalLabelFixtures.ts";
import { buildMotionAccountingTimeline } from "../src/motionAccountingTimelineModel.ts";
import type { ReplayService } from "./replay.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import { loadOrBuildTraceA } from "./bottomReversalMissAnalysis.ts";

export type MotionAccountingResult =
  | {
      status: "success";
      report: ReturnType<typeof runMotionAccountingReport>;
      timeline: ReturnType<typeof buildMotionAccountingTimeline>;
      tracePathA: string;
      tracePathB: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

function expectedMotionsForCapture(exerciseId: string, baseName: string) {
  const fixture = BOTTOM_REVERSAL_LABEL_FIXTURES.find(
    (e) => e.exerciseId === exerciseId && e.baseName === baseName
  );
  if (!fixture || fixture.expectedReversals.length === 0) {
    return null;
  }
  return fixture.expectedReversals.map((r, i) => ({
    id: `motion-${i + 1}`,
    centerEpochMs: r.epochMs,
    label: r.label ?? `motion ${i + 1}`,
  }));
}

export function runMotionAccountingForSample(
  replay: ReplayService,
  exerciseId: string,
  baseName: string
): MotionAccountingResult {
  const expectedMotions = expectedMotionsForCapture(exerciseId, baseName);
  if (!expectedMotions) {
    return {
      status: "unavailable",
      message:
        "No labeled expected motions for this capture. Add entries to bottom-reversal-label fixtures.",
    };
  }

  const { tracePathA, tracePathB } = replay.getAbCompareTracePaths(baseName);
  if (!existsSync(tracePathA) || !existsSync(tracePathB)) {
    return {
      status: "failure",
      message: "A/B traces not found. Run Replay or A/B Compare first.",
    };
  }

  try {
    const traceA = parseReplayTraceJsonl(readFileSync(tracePathA, "utf8"));
    const traceB = parseReplayTraceJsonl(readFileSync(tracePathB, "utf8"));
    const report = runMotionAccountingReport(traceA, traceB, expectedMotions, baseName);
    const timeline = buildMotionAccountingTimeline(traceA, traceB, report);
    return {
      status: "success",
      report,
      timeline,
      tracePathA,
      tracePathB,
    };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}

export async function runMotionAccountingWithReplay(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string
): Promise<MotionAccountingResult> {
  const detail = dataset.getSample(exerciseId, baseName);
  const labelId = detail.meta?.label?.exerciseId ?? null;

  if (!detail.sample) {
    return { status: "failure", message: "Sample fixture missing or invalid" };
  }
  if (labelId !== "squat") {
    return {
      status: "unavailable",
      message: `Motion accounting supports squat captures only (label: ${labelId ?? "unknown"})`,
    };
  }

  try {
    await loadOrBuildTraceA(replay, detail.baseName, detail.sample);
    await replay.runAbCompare(detail.baseName, detail.sample);
    return runMotionAccountingForSample(replay, exerciseId, baseName);
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}
