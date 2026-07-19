/**
 * Pass 3D — Workbench scoring endpoint using shared `scoreRepCounters`.
 */

import type { BoiseDatasetReader } from "./dataset.ts";
import {
  scoreRepCounters,
  type CounterPredictionSet,
  type PredictedRep,
  type RepCounterScoreReport,
} from "../../../gold-grey/src/lib/boise/repCounterScoring.ts";
import type { RepCounterScoringConfigOverrides } from "../../../gold-grey/src/lib/boise/repCounterScoringConfig.ts";
import type { RepGroundTruthSidecarV1 } from "../../../gold-grey/src/lib/boise/repGroundTruth.ts";
import { PHASE_EVENT_TYPES } from "../../../gold-grey/src/lib/boise/repCounterScoringConfig.ts";

function predictionsFromSidecar(
  sidecar: RepGroundTruthSidecarV1,
  timingFilter?: RepGroundTruthSidecarV1["events"][0]["timingMethod"]
): PredictedRep[] {
  const byRep = new Map<string, PredictedRep>();
  for (const e of sidecar.events) {
    if (timingFilter && e.timingMethod !== timingFilter) continue;
    let row = byRep.get(e.repId);
    if (!row) {
      row = { predId: `from-${e.repId}`, completionEpochMs: Number.NaN, phases: {} };
      byRep.set(e.repId, row);
    }
    if (e.eventType === "rep_complete") {
      row.completionEpochMs = e.epochMs;
    } else if ((PHASE_EVENT_TYPES as readonly string[]).includes(e.eventType)) {
      row.phases = {
        ...row.phases,
        [e.eventType]: e.epochMs,
      };
    }
  }
  return [...byRep.values()]
    .filter((p) => Number.isFinite(p.completionEpochMs))
    .sort((a, b) => a.predId.localeCompare(b.predId));
}

/** Default comparison set when the request does not supply counters. */
export function buildDefaultCounterSets(
  sidecar: RepGroundTruthSidecarV1 | null
): CounterPredictionSet[] {
  if (!sidecar) {
    return [
      {
        counterId: "offline",
        counterName: "Unavailable counter",
        available: false,
        predictions: [],
      },
    ];
  }

  const allCompletions = predictionsFromSidecar(sidecar);
  const voice = predictionsFromSidecar(sidecar, "voice");
  const manual = predictionsFromSidecar(sidecar, "timeline_edit");

  const jittered: PredictedRep[] = allCompletions.map((p, i) => ({
    ...p,
    predId: `jitter-${i + 1}`,
    completionEpochMs: p.completionEpochMs + 180,
  }));

  return [
    {
      counterId: "voice_subset",
      counterName: "Voice markers (from GT)",
      available: true,
      predictions: voice,
    },
    {
      counterId: "manual_subset",
      counterName: "Manual markers (from GT)",
      available: true,
      predictions: manual,
    },
    {
      counterId: "jittered_demo",
      counterName: "Demo +180ms shift",
      available: true,
      predictions: jittered,
    },
    {
      counterId: "offline",
      counterName: "Unavailable counter",
      available: false,
      predictions: [],
    },
  ];
}

export type ScoreRepCountersRequest = {
  counters?: CounterPredictionSet[];
  config?: RepCounterScoringConfigOverrides;
  selectedCounterId?: string;
};

export type ScoreRepCountersResponse =
  | {
      status: "success";
      report: RepCounterScoreReport;
      selectedCounterId: string | null;
      selectedPredictions: PredictedRep[];
      sampleEpochStartMs: number;
      sampleEpochEndMs: number;
    }
  | { status: "failure"; message: string };

export function runRepCounterScoreForSample(
  dataset: BoiseDatasetReader,
  exerciseId: string,
  baseName: string,
  body: ScoreRepCountersRequest = {}
): ScoreRepCountersResponse {
  try {
    const detail = dataset.getSample(exerciseId, baseName);
    if (!detail.sample || !detail.meta) {
      return { status: "failure", message: "Sample or meta missing" };
    }

    const truth = detail.repGroundTruth;
    const counters =
      body.counters && body.counters.length > 0
        ? body.counters
        : buildDefaultCounterSets(truth);

    const report = scoreRepCounters({
      sampleId: baseName,
      truth,
      counters,
      config: body.config,
    });

    const selectedCounterId =
      body.selectedCounterId ??
      report.counters.find((c) => c.relativeRank === 1)?.counterId ??
      report.counters[0]?.counterId ??
      null;

    const selectedPredictions =
      counters.find((c) => c.counterId === selectedCounterId)?.predictions ?? [];

    const epochs = detail.sample.samples.map((s) => s.epochMs);
    const sampleEpochStartMs = epochs[0] ?? 0;
    const sampleEpochEndMs = epochs[epochs.length - 1] ?? sampleEpochStartMs;

    return {
      status: "success",
      report,
      selectedCounterId,
      selectedPredictions,
      sampleEpochStartMs,
      sampleEpochEndMs,
    };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}
