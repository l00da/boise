export type SampleListItem = {
  exerciseId: string;
  baseName: string;
  status: string;
  triggerId: string;
  durationSec: number | null;
  collectorId: string;
  collectorName: string;
  capturedAtIso: string;
  integrityIssues: { kind: string; message: string }[];
};

export type DatasetOverview = {
  dataRoot: string;
  totalSamples: number;
  countsByExercise: Record<string, { kept: number; rejected: number; unreviewed: number; error: number }>;
  integrityIssues: { kind: string; message: string }[];
};

export type ImuFixtureSample = {
  epochMs: number;
  accG: [number, number, number];
  gyroDps: [number, number, number];
};

export type SampleDetail = {
  exerciseId: string;
  baseName: string;
  meta: {
    status: string;
    collector: { id: string; displayName: string };
    captureTrigger: { triggerId: string };
    capturedAtIso: string;
    label: { exerciseId: string };
  } | null;
  sample: { samples: ImuFixtureSample[]; sampleRateHz: number } | null;
  /** Optional Pass 3A sidecar — null/absent when unlabeled. */
  repGroundTruth?: unknown | null;
  integrityIssues: { kind: string; message: string }[];
};

export type CapabilityEntry = {
  capability: string;
  state: "FUNCTIONAL" | "CONDITIONAL" | "UNAVAILABLE";
  reason: string;
  evidencePaths: string[];
};

export type ReplayResult = {
  traceKey: string;
  cached: boolean;
  determinismVerified: boolean;
  stats: { samples: number; clampCount: number; peakAbsBodyZ: number; insideVBTWindow: boolean };
  tracePath: string;
};

export type AbReplayDiffSummary = {
  sampleCount: number;
  clampCountA: number;
  clampCountB: number;
  samplesWhereBSuppressedAClamp: number;
  maxAbsBodyZVelocityDiff: number;
  meanAbsBodyZVelocityDiff: number;
  finalBodyZVelocityA: number | null;
  finalBodyZVelocityB: number | null;
  aPreservationVerified: boolean;
  inputTimestampsMatch: boolean;
};

export type AbCompareApiResult =
  | {
      status: "success";
      traceKeyA: string;
      traceKeyB: string;
      tracePathA: string;
      tracePathB: string;
      summaryPath: string;
      summary: AbReplayDiffSummary;
      timeline: import("./abClampTimelineModel").AbClampTimelinePayload;
      estimatorA: string;
      estimatorB: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string; sampleExerciseId: string | null };

export type AbClampTimelineApiResult =
  | { status: "success"; timeline: import("./abClampTimelineModel").AbClampTimelinePayload }
  | { status: "not_found"; message: string }
  | { status: "failure"; message: string };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errBody = body as { error?: string; message?: string; status?: string };
    const detail =
      errBody.message ??
      (errBody.error
        ? errBody.error === "route_not_found"
          ? `route_not_found: ${url}`
          : errBody.error
        : null) ??
      res.statusText;
    throw new Error(detail);
  }
  return body as T;
}

export function fetchOverview(): Promise<DatasetOverview> {
  return getJson("/api/overview");
}

export function fetchSamples(): Promise<{ samples: SampleListItem[] }> {
  return getJson("/api/samples");
}

export function fetchSample(exerciseId: string, baseName: string): Promise<SampleDetail> {
  return getJson(`/api/samples/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`);
}

export function fetchCapabilities(): Promise<{ audit: { entries: CapabilityEntry[] } }> {
  return getJson("/api/capabilities");
}

export function runReplay(exerciseId: string, baseName: string): Promise<ReplayResult> {
  return getJson(`/api/replay/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ insideVBTWindow: false }),
  });
}

export function runAbCompare(exerciseId: string, baseName: string): Promise<AbCompareApiResult> {
  return getJson(
    `/api/ab-compare/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }
  );
}

export async function fetchAbClampTimeline(
  exerciseId: string,
  baseName: string
): Promise<AbClampTimelineApiResult> {
  const url = `/api/ab-compare/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}/timeline`;
  const res = await fetch(url);
  const body = (await res.json().catch(() => ({}))) as AbClampTimelineApiResult & {
    error?: string;
  };
  if (res.ok) {
    return body;
  }
  if (res.status === 404 && body.status === "not_found") {
    return {
      status: "not_found",
      message: body.message ?? "A/B trace artifacts not found",
    };
  }
  return {
    status: "failure",
    message: body.message ?? body.error ?? res.statusText,
  };
}

export function runAction(actionId: string, args: Record<string, unknown>) {
  return getJson(`/api/actions/${actionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

export type BottomReversalRejectionReason =
  | "no_meaningful_negative_descent"
  | "no_confirmed_positive_ascent"
  | "smoothing_removed_crossing"
  | "minimum_duration_sample_threshold"
  | "stationary_zvu_exclusion"
  | "sign_convention_inconsistency"
  | "pipeline_not_ready"
  | "min_rep_separation_deduped";

export type BottomReversalMissReport = {
  thresholds: Record<string, number>;
  velocitySeries: {
    sampleIndex: number;
    epochMs: number;
    bodyZVelocity: number | null;
    pipelineReady: boolean;
    stationaryZvu: boolean | null;
  }[];
  readySampleCount: number;
  oracleDetections: { sampleIndex: number; epochMs: number; kind: string }[];
  rejectedCandidates: {
    sampleIndex: number;
    epochMs: number;
    accepted: boolean;
    rejectionReason: BottomReversalRejectionReason | null;
    descentSampleCount: number;
    ascentSampleCount: number;
    descentSamplesBelowEpsilon: number;
    ascentSamplesAboveEpsilon: number;
    rawVelocity: number;
    smoothedVelocity: number;
    windowMinAbsSmoothed: number;
    detail: string;
  }[];
  directionUpCandidates: { sampleIndex: number; epochMs: number; kind: string }[];
  expectedOutcomes: {
    region: { id: string; centerEpochMs: number; centerSampleIndex: number; label?: string };
    status: "detected" | "missed";
    matchedOracle: { sampleIndex: number; epochMs: number } | null;
    missCause: BottomReversalRejectionReason | null;
    detail: string;
  }[];
  extraDetections: { sampleIndex: number; epochMs: number }[];
  summary: {
    oracleDetectionCount: number;
    rejectedCandidateCount: number;
    directionUpCandidateCount: number;
    expectedRegionCount: number;
    detectedCount: number;
    missedCount: number;
    extraCount: number;
    precision: number;
    recall: number;
    falsePositiveCount: number;
  };
};

export type BottomReversalMissApiResult =
  | { status: "success"; report: BottomReversalMissReport }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

export function fetchBottomReversalMissAnalysis(
  exerciseId: string,
  baseName: string,
  expectedRegions: { id: string; centerEpochMs: number; centerSampleIndex: number; label?: string }[] = []
): Promise<BottomReversalMissApiResult> {
  return getJson(`/api/bottom-reversal-analysis/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedRegions }),
  });
}

export type AbcBottomResetSummary = {
  sampleCount: number;
  oracleBottomCount: number;
  deliberateResetCount: number;
  confirmedMotionCount: number;
  oneResetPerConfirmedMotion: boolean;
  finalRestDriftA: number;
  finalRestDriftB1: number;
  finalRestDriftB2: number;
  diffA_B1: {
    meanAbsBodyZVelocityDiff: number;
    maxAbsBodyZVelocityDiff: number;
    finalBodyZVelocityA: number | null;
    finalBodyZVelocityB: number | null;
  };
  diffA_B2: {
    meanAbsBodyZVelocityDiff: number;
    maxAbsBodyZVelocityDiff: number;
    finalBodyZVelocityA: number | null;
    finalBodyZVelocityB: number | null;
  };
  diffB1_B2: {
    meanAbsBodyZVelocityDiff: number;
    maxAbsBodyZVelocityDiff: number;
    finalBodyZVelocityA: number | null;
    finalBodyZVelocityB: number | null;
  };
  disclaimer: string;
};

export type AbcBottomResetApiResult =
  | {
      status: "success";
      summary: AbcBottomResetSummary;
      deliberateResetEvents: {
        oracleBottomEpochMs: number;
        sampleIndex: number;
        epochMs: number;
        velocityBeforeResetZ: number;
        velocityAfterResetZ: number | null;
      }[];
      oracleBottomEpochMs: number[];
      timeline: import("./abcBottomResetTimelineModel").AbcBottomResetTimelinePayload;
      tracePathA: string;
      tracePathB1: string;
      tracePathB2: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

export function fetchAbcBottomResetCompare(
  exerciseId: string,
  baseName: string
): Promise<AbcBottomResetApiResult> {
  return getJson(
    `/api/abc-bottom-reset-compare/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

export type CausalSquatBottomSummary = {
  toleranceMs: number;
  oracleCount: number;
  candidateCount: number;
  matchCount: number;
  missCount: number;
  falsePositiveCount: number;
  meanTimingErrorMs: number | null;
  meanAbsTimingErrorMs: number | null;
  maxAbsTimingErrorMs: number | null;
};

export type CausalSquatBottomApiResult =
  | {
      status: "success";
      summary: CausalSquatBottomSummary;
      matches: {
        oracle: { sampleIndex: number; epochMs: number };
        candidate: { sampleIndex: number; epochMs: number };
        timingErrorMs: number;
      }[];
      misses: { sampleIndex: number; epochMs: number }[];
      falsePositives: { sampleIndex: number; epochMs: number }[];
      timeline: import("./causalSquatBottomTimelineModel").CausalSquatBottomTimelinePayload;
      tracePathA: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

export function fetchCausalSquatBottomCompare(
  exerciseId: string,
  baseName: string,
  toleranceMs = 300
): Promise<CausalSquatBottomApiResult> {
  return getJson(
    `/api/causal-squat-bottom-compare/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toleranceMs }),
    }
  );
}

export type MotionAccountingApiResult =
  | {
      status: "success";
      report: import("../../../gold-grey/src/lib/imu/replay/motionAccountingReport.ts").MotionAccountingReport;
      timeline: import("./motionAccountingTimelineModel").MotionAccountingTimelinePayload;
      tracePathA: string;
      tracePathB: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

export function fetchMotionAccountingReport(
  exerciseId: string,
  baseName: string
): Promise<MotionAccountingApiResult> {
  return getJson(
    `/api/motion-accounting/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

export type SquatReadyGateApiResult =
  | {
      status: "success";
      readyThresholds: import("../../../gold-grey/src/lib/imu/replay/squatReadyGate.ts").SquatReadyGateThresholds;
      eccentricConfig: import("../../../gold-grey/src/lib/imu/replay/squatEccentricStart.ts").SquatEccentricStartConfig;
      cycleConfig: import("../../../gold-grey/src/lib/imu/replay/squatRepCycle.ts").SquatRepCycleConfig;
      reachedReady: boolean;
      readyEpochMs: number | null;
      reachedEccentric: boolean;
      eccentricStartEpochMs: number | null;
      countedReps: number;
      transitionCount: number;
      transitions: import("../../../gold-grey/src/lib/imu/replay/squatRepCycle.ts").SquatRepCycleTransition[];
      eccentricEvents: import("../../../gold-grey/src/lib/imu/replay/squatEccentricStart.ts").SquatEccentricStartEvent[];
      phaseEvents: import("../../../gold-grey/src/lib/imu/replay/squatRepCycle.ts").SquatPhaseMarkerEvent[];
      repCompleteEvents: import("../../../gold-grey/src/lib/imu/replay/squatRepCycle.ts").SquatRepCompleteEvent[];
      reps: import("../../../gold-grey/src/lib/imu/replay/squatRepCycle.ts").SquatRepDetail[];
      rejectedCandidateCount: number;
      timeline: import("./squatReadyGateTimelineModel").SquatReadyGateTimelinePayload;
      tracePathA: string;
    }
  | { status: "failure"; message: string }
  | { status: "unavailable"; message: string };

export function fetchSquatReadyGate(
  exerciseId: string,
  baseName: string
): Promise<SquatReadyGateApiResult> {
  return getJson(
    `/api/squat-ready-gate/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

export type RepGroundTruthEditorApiResult =
  | {
      status: "success";
      exerciseId: string;
      baseName: string;
      sidecar: import("../../../gold-grey/src/lib/boise/repGroundTruth.ts").RepGroundTruthSidecarV1;
      createdNew: boolean;
      sampleEpochMs: number[];
      captureEpochStartMs: number;
      captureEpochEndMs: number;
      bodyZSeries: { sampleIndex: number; epochMs: number; bodyZVelocity: number | null }[];
      sampleJsonBytesShaPreview: string;
    }
  | { status: "failure"; message: string };

export function fetchRepGroundTruthEditor(
  exerciseId: string,
  baseName: string
): Promise<RepGroundTruthEditorApiResult> {
  return getJson(
    `/api/rep-ground-truth/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`
  );
}

export type RepGroundTruthSaveApiResult =
  | {
      status: "success";
      sidecar: import("../../../gold-grey/src/lib/boise/repGroundTruth.ts").RepGroundTruthSidecarV1;
      sampleUntouched: true;
    }
  | { status: "failure"; message: string };

export function saveRepGroundTruthEditor(
  exerciseId: string,
  baseName: string,
  truth: import("../../../gold-grey/src/lib/boise/repGroundTruth.ts").RepGroundTruthSidecarV1,
  opts?: { explicitReapprove?: boolean }
): Promise<RepGroundTruthSaveApiResult> {
  return getJson(
    `/api/rep-ground-truth/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ truth, explicitReapprove: opts?.explicitReapprove ?? false }),
    }
  );
}

export type RepCounterScoreApiResult =
  | {
      status: "success";
      report: import("../../../gold-grey/src/lib/boise/repCounterScoring.ts").RepCounterScoreReport;
      selectedCounterId: string | null;
      selectedPredictions: import("../../../gold-grey/src/lib/boise/repCounterScoring.ts").PredictedRep[];
      sampleEpochStartMs: number;
      sampleEpochEndMs: number;
    }
  | { status: "failure"; message: string };

export function fetchRepCounterScore(
  exerciseId: string,
  baseName: string,
  body: {
    config?: import("../../../gold-grey/src/lib/boise/repCounterScoringConfig.ts").RepCounterScoringConfigOverrides;
    selectedCounterId?: string;
    counters?: import("../../../gold-grey/src/lib/boise/repCounterScoring.ts").CounterPredictionSet[];
  } = {}
): Promise<RepCounterScoreApiResult> {
  return getJson(
    `/api/rep-counter-score/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export type GenericVsSquatCompareApiResult =
  | import("../server/genericVsSquatCompare.ts").GenericVsSquatCompareResult
  | {
      status: "failure";
      error: string;
      exerciseId: string;
      baseName: string;
      message: string;
    };

/** Exact path used by the Workbench UI — keep in sync with Express registration. */
export function genericVsSquatComparePath(exerciseId: string, baseName: string): string {
  return `/api/generic-vs-squat-compare/${encodeURIComponent(exerciseId)}/${encodeURIComponent(baseName)}`;
}

export function fetchGenericVsSquatCompare(
  exerciseId: string,
  baseName: string,
  body: {
    config?: import("../../../gold-grey/src/lib/boise/repCounterScoringConfig.ts").RepCounterScoringConfigOverrides;
  } = {}
): Promise<GenericVsSquatCompareApiResult> {
  return getJson(genericVsSquatComparePath(exerciseId, baseName), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
