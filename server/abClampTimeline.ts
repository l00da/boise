import { existsSync, readFileSync } from "node:fs";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import { findOracleBottomReversalsFromTrace } from "../../../gold-grey/src/lib/imu/replay/oracleBottomTimestamper.ts";
import type { ReplayTraceRow } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import {
  buildAbClampTimelinePayload,
  type AbClampTimelinePayload,
  type AbTraceRow,
} from "../src/abClampTimelineModel.ts";
import type { ReplayService } from "./replay.ts";

export type AbClampTimelineResult =
  | { status: "success"; timeline: AbClampTimelinePayload }
  | { status: "not_found"; message: string; tracePathA?: string; tracePathB?: string }
  | { status: "failure"; message: string };

function toAbTraceRow(row: ReplayTraceRow): AbTraceRow {
  return {
    sampleIndex: row.sampleIndex,
    epochMs: row.epochMs,
    bodyZVelocity: row.bodyZVelocity,
    velocityBeforeClampZ: row.velocityBeforeClampZ,
    velocityAfterClampZ: row.velocityAfterClampZ,
    stationaryZvu: row.stationaryZvu,
    genericWouldClamp: row.genericWouldClamp,
    finalClampDecision: row.finalClampDecision,
    oracleZvuSuppressed: row.oracleZvuSuppressed,
    oracleReason: row.oracleReason,
  };
}

export function buildAbClampTimelineFromTraces(
  traceA: ReplayTraceRow[],
  traceB: ReplayTraceRow[]
): AbClampTimelinePayload {
  const oracleReversals = findOracleBottomReversalsFromTrace(traceA).map((e) => ({
    sampleIndex: e.sampleIndex,
    epochMs: e.epochMs,
  }));
  return buildAbClampTimelinePayload(
    traceA.map(toAbTraceRow),
    traceB.map(toAbTraceRow),
    oracleReversals
  );
}

export function loadAbClampTimelineFromPaths(
  tracePathA: string,
  tracePathB: string
): AbClampTimelineResult {
  if (!existsSync(tracePathA) || !existsSync(tracePathB)) {
    return {
      status: "not_found",
      message:
        "A/B trace artifacts not found. Run A/B Compare first to generate A-novbt.jsonl and B-squat.jsonl.",
      tracePathA,
      tracePathB,
    };
  }

  try {
    const traceA = parseReplayTraceJsonl(readFileSync(tracePathA, "utf8"));
    const traceB = parseReplayTraceJsonl(readFileSync(tracePathB, "utf8"));
    return {
      status: "success",
      timeline: buildAbClampTimelineFromTraces(traceA, traceB),
    };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}

/** Load timeline using the same trace paths as `ReplayService.runAbCompare()`. */
export function loadAbClampTimelineForSample(
  replay: ReplayService,
  baseName: string
): AbClampTimelineResult {
  const { tracePathA, tracePathB } = replay.getAbCompareTracePaths(baseName);
  return loadAbClampTimelineFromPaths(tracePathA, tracePathB);
}
