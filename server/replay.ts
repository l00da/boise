import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  runEstimatorReplay,
  tracesNumericallyEqual,
} from "../../../gold-grey/src/lib/imu/replay/replayRunner.ts";
import { runAbReplayCompare } from "../../../gold-grey/src/lib/imu/replay/abReplayCompare.ts";
import { ORACLE_SQUAT_CONTEXT } from "../../../gold-grey/src/lib/imu/exerciseContext.ts";
import type { EstimatorExerciseContext } from "../../../gold-grey/src/lib/imu/exerciseContext.ts";
import { serializeReplayTrace } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import { buildAbClampTimelineFromTraces } from "./abClampTimeline.ts";
import type { AbClampTimelinePayload } from "../src/abClampTimelineModel.ts";
import type { ImuFixtureFile } from "../../../gold-grey/src/lib/imu/replay/fixturePlayer.ts";
import { resolveUnderRoot } from "./pathGuard.ts";

export type ReplayOptions = {
  insideVBTWindow?: boolean;
  recompute?: boolean;
  exerciseContext?: EstimatorExerciseContext;
};

export type ReplayStats = {
  samples: number;
  clampCount: number;
  peakAbsBodyZ: number;
  insideVBTWindow: boolean;
};

export type ReplayResult = {
  traceKey: string;
  cached: boolean;
  stats: ReplayStats;
  tracePath: string;
  determinismVerified: boolean;
};

/** Encode replay options into a stable cache key (Pass 13 / M3). */
export function buildTraceKey(options: ReplayOptions = {}): string {
  const inside = options.insideVBTWindow ?? false;
  if (options.exerciseContext?.source === "oracle") {
    return inside
      ? `B-${options.exerciseContext.exercise}-vbt`
      : `B-${options.exerciseContext.exercise}`;
  }
  return inside ? "A-vbt" : "A-novbt";
}

function computeStats(
  rows: ReturnType<typeof runEstimatorReplay>["rows"],
  insideVBTWindow: boolean
): ReplayStats {
  let clampCount = 0;
  let peakAbsBodyZ = 0;
  for (const row of rows) {
    if (row.velocityClampedThisFrame) clampCount++;
    if (row.bodyZVelocity !== null) {
      peakAbsBodyZ = Math.max(peakAbsBodyZ, Math.abs(row.bodyZVelocity));
    }
  }
  return {
    samples: rows.length,
    clampCount,
    peakAbsBodyZ,
    insideVBTWindow,
  };
}

/** Serialize replay runs — IMUStreamProcessor has single-instance module state. */
let replayChain: Promise<unknown> = Promise.resolve();

function enqueueReplay<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = replayChain.then(fn, fn);
  replayChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export class ReplayService {
  constructor(private readonly dataRoot: string) {}

  private traceDir(baseName: string): string {
    return resolveUnderRoot(this.dataRoot, "_traces", baseName);
  }

  private tracePath(baseName: string, traceKey: string): string {
    return path.join(this.traceDir(baseName), `${traceKey}.jsonl`);
  }

  /** Same paths written by `runAbCompare()` — used by timeline loader. */
  getAbCompareTracePaths(baseName: string, insideVBTWindow = false): {
    traceKeyA: string;
    traceKeyB: string;
    tracePathA: string;
    tracePathB: string;
  } {
    const traceKeyA = buildTraceKey({ insideVBTWindow, exerciseContext: null });
    const traceKeyB = buildTraceKey({
      insideVBTWindow,
      exerciseContext: ORACLE_SQUAT_CONTEXT,
    });
    return {
      traceKeyA,
      traceKeyB,
      tracePathA: this.tracePath(baseName, traceKeyA),
      tracePathB: this.tracePath(baseName, traceKeyB),
    };
  }

  async replaySample(
    baseName: string,
    fixture: ImuFixtureFile,
    options: ReplayOptions = {}
  ): Promise<ReplayResult> {
    return enqueueReplay(() => this.replaySampleInner(baseName, fixture, options));
  }

  private replaySampleInner(
    baseName: string,
    fixture: ImuFixtureFile,
    options: ReplayOptions
  ): ReplayResult {
    const insideVBTWindow = options.insideVBTWindow ?? false;
    const exerciseContext = options.exerciseContext ?? null;
    const traceKey = buildTraceKey({ insideVBTWindow, exerciseContext });
    const traceFile = this.tracePath(baseName, traceKey);

    if (!options.recompute && existsSync(traceFile)) {
      const cached = readFileSync(traceFile, "utf8");
      const lines = cached.trim().split("\n").filter(Boolean);
      const rows = lines.map((l) => JSON.parse(l));
      return {
        traceKey,
        cached: true,
        stats: computeStats(rows, insideVBTWindow),
        tracePath: traceFile,
        determinismVerified: true,
      };
    }

    const samples = fixture.samples;
    const runA = runEstimatorReplay(samples, { insideVBTWindow, exerciseContext });
    const runB = runEstimatorReplay(samples, { insideVBTWindow, exerciseContext });
    const determinismVerified = tracesNumericallyEqual(runA.rows, runB.rows);

    if (!determinismVerified) {
      throw new Error("Replay determinism check failed: two runs produced different traces");
    }

    const jsonl = serializeReplayTrace(runA.rows);
    mkdirSync(path.dirname(traceFile), { recursive: true });
    writeFileSync(traceFile, jsonl, "utf8");

    return {
      traceKey,
      cached: false,
      stats: computeStats(runA.rows, insideVBTWindow),
      tracePath: traceFile,
      determinismVerified,
    };
  }

  async runAbCompare(
    baseName: string,
    fixture: ImuFixtureFile,
    options: ReplayOptions = {}
  ): Promise<{
    traceKeyA: string;
    traceKeyB: string;
    tracePathA: string;
    tracePathB: string;
    summaryPath: string;
    summary: ReturnType<typeof runAbReplayCompare>["summary"];
    determinismVerified: boolean;
    timeline: AbClampTimelinePayload;
  }> {
    return enqueueReplay(() => {
      const insideVBTWindow = options.insideVBTWindow ?? false;
      const result = runAbReplayCompare(fixture.samples, {
        insideVBTWindow,
        exerciseContextB: options.exerciseContext ?? ORACLE_SQUAT_CONTEXT,
      });

      const { traceKeyA, traceKeyB, tracePathA, tracePathB } = this.getAbCompareTracePaths(
        baseName,
        insideVBTWindow
      );

      mkdirSync(this.traceDir(baseName), { recursive: true });
      writeFileSync(tracePathA, serializeReplayTrace(result.traceA), "utf8");
      writeFileSync(tracePathB, serializeReplayTrace(result.traceB), "utf8");
      writeFileSync(
        path.join(this.traceDir(baseName), "ab-summary.json"),
        JSON.stringify(result.summary, null, 2) + "\n",
        "utf8"
      );

      return {
        traceKeyA,
        traceKeyB,
        tracePathA,
        tracePathB,
        summaryPath: path.join(this.traceDir(baseName), "ab-summary.json"),
        summary: result.summary,
        determinismVerified: result.summary.aPreservationVerified,
        timeline: buildAbClampTimelineFromTraces(result.traceA, result.traceB),
      };
    });
  }
}
