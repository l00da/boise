/**
 * Generic VBT vs squat-rep-cycle-v1 — primary Boise comparison.
 * Score both against the same Pass 3A sidecar via the shared Pass 3D scorer.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import {
  GENERIC_VBT_LIVE_COUNTER_ID,
  GENERIC_VBT_LIVE_FILENAME,
  GENERIC_VBT_REPLAY_COUNTER_ID,
  parseGenericVbtLiveHistory,
  predictionsFromGenericVbtLive,
  runGenericVbtReplay,
} from "../../../gold-grey/src/lib/boise/genericVbtReplay.ts";
import {
  SQUAT_REP_CYCLE_COUNTER_ID,
  runSquatContextPredictions,
} from "../../../gold-grey/src/lib/boise/squatCounterPredictions.ts";
import {
  scoreRepCounters,
  type CounterPredictionSet,
  type CounterScoreResult,
  type PredictedRep,
  type RepCounterScoreReport,
} from "../../../gold-grey/src/lib/boise/repCounterScoring.ts";
import type { RepCounterScoringConfigOverrides } from "../../../gold-grey/src/lib/boise/repCounterScoringConfig.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import type { ReplayService } from "./replay.ts";
import { loadOrBuildTraceA } from "./bottomReversalMissAnalysis.ts";

export type CompareStatusLabel =
  | "LIVE_CAPTURED"
  | "REPLAY_SAMPLE_CLOCK"
  | "LIVE_HISTORY_UNAVAILABLE"
  | "REPLAY_UNSUPPORTED"
  | "PARITY_UNPROVEN";

export type PrimaryCompareRow = {
  counterId: string;
  counterName: string;
  mode: "live" | "replay" | "unavailable";
  statusLabels: CompareStatusLabel[];
  claimsLiveParity: boolean;
  available: boolean;
  unavailableReason: string | null;
  predictedReps: number;
  truePositives: number;
  misses: number;
  extras: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  scoreMode: CounterScoreResult["mode"];
  absoluteQuality: CounterScoreResult["absoluteQuality"];
};

export type DualCounterTimeline = {
  captureEpochStartMs: number;
  captureEpochEndMs: number;
  approvedGroundTruth: { repId: string; epochMs: number }[];
  genericReplay: { predId: string; epochMs: number }[];
  squat: { predId: string; epochMs: number }[];
  genericLive: { predId: string; epochMs: number }[];
  unmatchedTruths: { counterId: string; repId: string; epochMs: number }[];
  unmatchedPredictions: { counterId: string; predId: string; epochMs: number }[];
  matchLinks: {
    counterId: string;
    truthRepId: string;
    predId: string;
    absErrorMs: number;
    midEpochMs: number;
  }[];
};

export type ComparisonSummary = {
  hasApprovedTruth: boolean;
  truthRepCount: number;
  text: string;
};

export type GenericVsSquatCompareErrorCode =
  | "sample_not_found"
  | "ground_truth_missing"
  | "ground_truth_unapproved"
  | "live_history_unavailable"
  | "replay_unsupported"
  | "trace_build_failed"
  | "compare_failed";

export type GenericVsSquatCompareFailure = {
  status: "failure";
  error: GenericVsSquatCompareErrorCode;
  exerciseId: string;
  baseName: string;
  message: string;
};

export type GenericVsSquatCompareResult =
  | {
      status: "success";
      sampleId: string;
      truthApprovalStatus: string | null;
      truthSource: string | null;
      primaryRows: PrimaryCompareRow[];
      demoExcluded: true;
      report: RepCounterScoreReport;
      timeline: DualCounterTimeline;
      summary: ComparisonSummary;
      notes: string[];
      /** Soft condition codes (distinct from HTTP route_not_found). */
      conditionCodes: GenericVsSquatCompareErrorCode[];
    }
  | GenericVsSquatCompareFailure;

function fail(
  error: GenericVsSquatCompareErrorCode,
  exerciseId: string,
  baseName: string,
  message: string
): GenericVsSquatCompareFailure {
  return { status: "failure", error, exerciseId, baseName, message };
}

function rowFromScore(
  set: CounterPredictionSet,
  scored: CounterScoreResult | undefined,
  mode: PrimaryCompareRow["mode"],
  statusLabels: CompareStatusLabel[],
  claimsLiveParity: boolean,
  unavailableReason: string | null
): PrimaryCompareRow {
  if (!set.available || !scored || scored.mode === "unavailable") {
    return {
      counterId: set.counterId,
      counterName: set.counterName,
      mode: "unavailable",
      statusLabels,
      claimsLiveParity,
      available: false,
      unavailableReason:
        unavailableReason ?? "No live VBT history persisted for this sample",
      predictedReps: 0,
      truePositives: 0,
      misses: 0,
      extras: 0,
      precision: null,
      recall: null,
      f1: null,
      scoreMode: "unavailable",
      absoluteQuality: "gray",
    };
  }
  return {
    counterId: set.counterId,
    counterName: set.counterName,
    mode,
    statusLabels,
    claimsLiveParity,
    available: true,
    unavailableReason: null,
    predictedReps: set.predictions.length,
    truePositives: scored.metrics.truePositives,
    misses: scored.metrics.misses,
    extras: scored.metrics.extras,
    precision: scored.metrics.precision,
    recall: scored.metrics.recall,
    f1: scored.metrics.f1,
    scoreMode: scored.mode,
    absoluteQuality: scored.absoluteQuality,
  };
}

function loadLiveHistory(dataRoot: string, exerciseId: string, baseName: string) {
  const livePath = path.join(
    path.resolve(dataRoot),
    exerciseId,
    baseName,
    GENERIC_VBT_LIVE_FILENAME
  );
  if (!existsSync(livePath)) return null;
  try {
    return parseGenericVbtLiveHistory(JSON.parse(readFileSync(livePath, "utf8")));
  } catch {
    return null;
  }
}

function buildSummary(
  truthApprovalStatus: string | null,
  truthRepCount: number,
  generic: PrimaryCompareRow,
  squat: PrimaryCompareRow
): ComparisonSummary {
  const hasApprovedTruth = truthApprovalStatus === "approved";
  if (!hasApprovedTruth) {
    return {
      hasApprovedTruth: false,
      truthRepCount,
      text:
        "No approved ground truth on this sample — scores are provisional; neither counter is declared better.",
    };
  }
  const gPred = generic.available ? generic.truePositives : 0;
  const gExtra = generic.available ? generic.extras : 0;
  const sPred = squat.available ? squat.truePositives : 0;
  const sExtra = squat.available ? squat.extras : 0;
  const genericLine = generic.available
    ? `Generic counted ${gPred} of ${truthRepCount} true reps with ${gExtra} extras.`
    : `Generic live/replay unavailable for counting summary.`;
  const squatLine = squat.available
    ? `Squat SM counted ${sPred} of ${truthRepCount} true reps with ${sExtra} extras.`
    : `Squat SM unavailable.`;
  // Prefer replay row for "Generic" when live is gray.
  return {
    hasApprovedTruth: true,
    truthRepCount,
    text: `${genericLine} ${squatLine}`,
  };
}

export async function runGenericVsSquatCompare(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string,
  config?: RepCounterScoringConfigOverrides
): Promise<GenericVsSquatCompareResult> {
  try {
    const detail = dataset.getSample(exerciseId, baseName);
    if (!detail.sample || !detail.meta) {
      return fail(
        "sample_not_found",
        exerciseId,
        baseName,
        "Sample or meta missing"
      );
    }

    const truth = detail.repGroundTruth;
    const conditionCodes: GenericVsSquatCompareErrorCode[] = [];
    if (!truth) conditionCodes.push("ground_truth_missing");
    else if (truth.approvalStatus !== "approved") {
      conditionCodes.push("ground_truth_unapproved");
    }

    const notes: string[] = [
      "Primary table uses real counter outputs only (not GT-derived demos).",
      "generic-vbt-live = persisted appVbtCoordinator RepResult events (LIVE_CAPTURED).",
      "generic-vbt-replay = sample-clock adapter reusing production transition() — PARITY_UNPROVEN.",
      "squat-rep-cycle-v1 = runSquatRepCycle rep_complete only.",
      "See docs/boise/GENERIC-VBT-PRODUCTION-TRACE.md",
    ];

    await loadOrBuildTraceA(replay, baseName, detail.sample);
    const tracePath = replay.getAbCompareTracePaths(baseName).tracePathA;
    if (!existsSync(tracePath)) {
      return fail(
        "replay_unsupported",
        exerciseId,
        baseName,
        "Failed to build A-novbt trace for comparison"
      );
    }
    const rows = parseReplayTraceJsonl(readFileSync(tracePath, "utf8"));

    const genericReplay = runGenericVbtReplay(rows);
    const squat = runSquatContextPredictions(rows);
    const liveHistory = loadLiveHistory(dataset.dataRoot, exerciseId, baseName);
    const livePreds = predictionsFromGenericVbtLive(liveHistory);
    if (!liveHistory || liveHistory.events.length === 0) {
      conditionCodes.push("live_history_unavailable");
    }

    const counters: CounterPredictionSet[] = [
      {
        counterId: GENERIC_VBT_LIVE_COUNTER_ID,
        counterName: "Generic VBT — live",
        available: liveHistory != null && liveHistory.events.length > 0,
        predictions: livePreds,
      },
      {
        counterId: GENERIC_VBT_REPLAY_COUNTER_ID,
        counterName: "Generic VBT — replay",
        available: true,
        predictions: genericReplay.predictions,
      },
      {
        counterId: SQUAT_REP_CYCLE_COUNTER_ID,
        counterName: "Squat lifecycle SM — replay",
        available: true,
        predictions: squat.predictions,
      },
    ];

    const report = scoreRepCounters({
      sampleId: baseName,
      truth,
      counters,
      config,
    });
    const byId = new Map(report.counters.map((c) => [c.counterId, c]));

    const liveAvailable = counters[0]!.available;
    const primaryRows: PrimaryCompareRow[] = [
      rowFromScore(
        counters[0]!,
        byId.get(GENERIC_VBT_LIVE_COUNTER_ID),
        liveAvailable ? "live" : "unavailable",
        liveAvailable
          ? ["LIVE_CAPTURED"]
          : ["LIVE_HISTORY_UNAVAILABLE"],
        false,
        liveAvailable
          ? null
          : `No ${GENERIC_VBT_LIVE_FILENAME} (old capture or no production reps during Boise capture)`
      ),
      rowFromScore(
        counters[1]!,
        byId.get(GENERIC_VBT_REPLAY_COUNTER_ID),
        "replay",
        ["REPLAY_SAMPLE_CLOCK", "PARITY_UNPROVEN"],
        false,
        null
      ),
      rowFromScore(
        counters[2]!,
        byId.get(SQUAT_REP_CYCLE_COUNTER_ID),
        "replay",
        ["REPLAY_SAMPLE_CLOCK"],
        false,
        null
      ),
    ];

    const epochs = detail.sample.samples.map((s) => s.epochMs);
    const captureEpochStartMs = epochs[0] ?? 0;
    const captureEpochEndMs = epochs[epochs.length - 1] ?? captureEpochStartMs;

    const truthById = new Map(report.truthReps.map((t) => [t.repId, t]));
    const unmatchedTruths: DualCounterTimeline["unmatchedTruths"] = [];
    const unmatchedPredictions: DualCounterTimeline["unmatchedPredictions"] = [];
    const matchLinks: DualCounterTimeline["matchLinks"] = [];

    for (const c of [
      GENERIC_VBT_LIVE_COUNTER_ID,
      GENERIC_VBT_REPLAY_COUNTER_ID,
      SQUAT_REP_CYCLE_COUNTER_ID,
    ] as const) {
      const scored = byId.get(c);
      const preds = counters.find((x) => x.counterId === c)?.predictions ?? [];
      const predById = new Map(preds.map((p) => [p.predId, p]));
      for (const id of scored?.unmatchedTruthRepIds ?? []) {
        const t = truthById.get(id);
        if (t?.completionEpochMs != null) {
          unmatchedTruths.push({ counterId: c, repId: id, epochMs: t.completionEpochMs });
        }
      }
      for (const id of scored?.unmatchedPredIds ?? []) {
        const p = predById.get(id);
        if (p) {
          unmatchedPredictions.push({
            counterId: c,
            predId: id,
            epochMs: p.completionEpochMs,
          });
        }
      }
      for (const m of scored?.matches ?? []) {
        const truth = truthById.get(m.truthRepId);
        const pred = predById.get(m.predId);
        if (!truth?.completionEpochMs || !pred) continue;
        matchLinks.push({
          counterId: c,
          truthRepId: m.truthRepId,
          predId: m.predId,
          absErrorMs: m.absCompletionErrorMs,
          midEpochMs: (truth.completionEpochMs + pred.completionEpochMs) / 2,
        });
      }
    }

    const timeline: DualCounterTimeline = {
      captureEpochStartMs,
      captureEpochEndMs,
      approvedGroundTruth: report.truthReps
        .filter((t): t is typeof t & { completionEpochMs: number } => t.completionEpochMs != null)
        .map((t) => ({ repId: t.repId, epochMs: t.completionEpochMs })),
      genericReplay: genericReplay.predictions.map((p) => ({
        predId: p.predId,
        epochMs: p.completionEpochMs,
      })),
      squat: squat.predictions.map((p) => ({
        predId: p.predId,
        epochMs: p.completionEpochMs,
      })),
      genericLive: livePreds.map((p) => ({
        predId: p.predId,
        epochMs: p.completionEpochMs,
      })),
      unmatchedTruths,
      unmatchedPredictions,
      matchLinks,
    };

    const truthRepCount = report.truthReps.filter((t) => t.completionEpochMs != null).length;
    // Prefer live Generic when captured; otherwise sample-clock replay.
    const genericForSummary = primaryRows[0]!.available ? primaryRows[0]! : primaryRows[1]!;
    const summary = buildSummary(
      truth?.approvalStatus ?? null,
      truthRepCount,
      genericForSummary,
      primaryRows[2]!
    );

    return {
      status: "success",
      sampleId: baseName,
      truthApprovalStatus: truth?.approvalStatus ?? null,
      truthSource: truth?.source ?? null,
      primaryRows,
      demoExcluded: true,
      report,
      timeline,
      summary,
      notes,
      conditionCodes,
    };
  } catch (err) {
    return fail(
      "compare_failed",
      exerciseId,
      baseName,
      (err as Error).message
    );
  }
}

/** Test helper: build primary sets without filesystem. */
export function buildPrimaryCounterSetsForTest(input: {
  genericReplay: PredictedRep[];
  squat: PredictedRep[];
  live?: PredictedRep[] | null;
}): CounterPredictionSet[] {
  return [
    {
      counterId: GENERIC_VBT_LIVE_COUNTER_ID,
      counterName: "Generic VBT — live",
      available: input.live != null,
      predictions: input.live ?? [],
    },
    {
      counterId: GENERIC_VBT_REPLAY_COUNTER_ID,
      counterName: "Generic VBT — replay",
      available: true,
      predictions: input.genericReplay,
    },
    {
      counterId: SQUAT_REP_CYCLE_COUNTER_ID,
      counterName: "Squat lifecycle SM — replay",
      available: true,
      predictions: input.squat,
    },
  ];
}
