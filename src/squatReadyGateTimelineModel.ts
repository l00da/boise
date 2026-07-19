/**
 * Boise Workbench — squat ready + eccentric + full rep-cycle timeline (M1–M3).
 */

import type { ReplayTraceRow } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import type {
  SquatState,
} from "../../../gold-grey/src/lib/imu/replay/squatReadyGate.ts";
import type {
  SquatEccentricRejectedCandidate,
  SquatEccentricStartEvent,
} from "../../../gold-grey/src/lib/imu/replay/squatEccentricStart.ts";
import {
  squatRepCycleRegions,
  type SquatPhaseMarkerEvent,
  type SquatRepCompleteEvent,
  type SquatRepCycleRejectedCandidate,
  type SquatRepCycleResult,
  type SquatRepCycleTransition,
  type SquatRepDetail,
} from "../../../gold-grey/src/lib/imu/replay/squatRepCycle.ts";

export type SquatReadyGateChartPoint = {
  sampleIndex: number;
  epochMs: number;
  bodyZVelocity: number | null;
  state: SquatState;
};

export type SquatReadyGateRegion = {
  state: SquatState;
  startEpochMs: number;
  endEpochMs: number;
  startSampleIndex: number;
  endSampleIndex: number;
};

export type SquatEccentricHoverDetail = {
  kind: "accepted" | "rejected" | "state" | "velocity" | "rep_complete" | "phase";
  accepted: boolean | null;
  reason: string | null;
  signedVelocity: number | null;
  descentConfirmSamples: number | null;
  readyDurationMs: number | null;
  linearAccelerationMagnitude: number | null;
  correctedGyroMagnitude: number | null;
  sampleIndex: number;
  epochMs: number;
  relativeMs: number;
  state: SquatState | null;
  repId: number | null;
  phase: string | null;
};

export type SquatReadyGateTimelinePayload = {
  chartSeries: SquatReadyGateChartPoint[];
  regions: SquatReadyGateRegion[];
  transitions: SquatRepCycleTransition[];
  captureEpochStartMs: number;
  captureEpochEndMs: number;
  readyEpochMs: number | null;
  eccentricStartEpochMs: number | null;
  eccentricEvents: SquatEccentricStartEvent[];
  rejectedCandidates: Array<
    | (SquatEccentricRejectedCandidate & { phase?: string })
    | SquatRepCycleRejectedCandidate
  >;
  m1LaneStates: readonly ("rack_rest" | "pre_rep_setup" | "ready")[];
  hasEccentric: boolean;
  /** M3 */
  phaseEvents: SquatPhaseMarkerEvent[];
  repCompleteEvents: SquatRepCompleteEvent[];
  reps: SquatRepDetail[];
  countedReps: number;
  turnaroundMarkers: { sampleIndex: number; epochMs: number; repId: number }[];
  concentricMarkers: { sampleIndex: number; epochMs: number; repId: number }[];
  lockoutMarkers: { sampleIndex: number; epochMs: number; repId: number }[];
};

export const SQUAT_READY_GATE_M1_LANES = ["rack_rest", "pre_rep_setup", "ready"] as const;

export const SQUAT_REP_CYCLE_LANES = [
  "rack_rest",
  "pre_rep_setup",
  "ready",
  "eccentric",
  "turnaround",
  "concentric",
  "lockout",
  "between_reps",
] as const;

export const SQUAT_READY_GATE_LANE_COLORS: Record<
  (typeof SQUAT_REP_CYCLE_LANES)[number],
  string
> = {
  rack_rest: "#78909c",
  pre_rep_setup: "#ffa726",
  ready: "#66bb6a",
  eccentric: "#42a5f5",
  turnaround: "#ab47bc",
  concentric: "#26c6da",
  lockout: "#ffee58",
  between_reps: "#8d6e63",
};

export function buildSquatReadyGateTimeline(
  rows: ReplayTraceRow[],
  result: SquatRepCycleResult
): SquatReadyGateTimelinePayload {
  const chartSeries: SquatReadyGateChartPoint[] = result.samples.map((s) => {
    const row = rows[s.sampleIndex] ?? rows.find((r) => r.epochMs === s.epochMs);
    return {
      sampleIndex: s.sampleIndex,
      epochMs: s.epochMs,
      bodyZVelocity: row?.bodyZVelocity ?? s.evidence.bodyZVelocity,
      state: s.state,
    };
  });

  const regions = squatRepCycleRegions(result);
  const captureEpochStartMs = rows[0]?.epochMs ?? result.sessionStartEpochMs ?? 0;
  const captureEpochEndMs =
    rows[rows.length - 1]?.epochMs ??
    result.samples[result.samples.length - 1]?.epochMs ??
    captureEpochStartMs;

  const eccentricEvents: SquatEccentricStartEvent[] = result.phaseEvents
    .filter((e) => e.eventType === "eccentric_start")
    .map((e) => ({
      eventType: "eccentric_start" as const,
      priorState: "ready" as const,
      nextState: "eccentric" as const,
      sampleIndex: e.sampleIndex,
      epochMs: e.epochMs,
      relativeMs: e.relativeMs,
      confidence: e.confidence,
      reason: e.reason,
      evidence: {
        signedVelocity: (e.evidence.signedVelocity as number | null) ?? null,
        descentConfirmSamples: Number(e.evidence.descentConfirmSamples ?? 0),
        readyDurationMs: (e.evidence.readyDurationMs as number | null) ?? null,
        linearAccelerationMagnitude: Number(e.evidence.linearAccelerationMagnitude ?? 0),
        correctedGyroMagnitude: Number(e.evidence.correctedGyroMagnitude ?? 0),
        pipelineReady: true,
        orientationSettled: true,
      },
    }));

  // Prefer M2 first event payload when available for evidence fidelity
  if (result.eccentricStart.events.length > 0 && eccentricEvents.length > 0) {
    eccentricEvents[0] = result.eccentricStart.events[0]!;
  }

  return {
    chartSeries,
    regions,
    transitions: result.transitions,
    captureEpochStartMs,
    captureEpochEndMs,
    readyEpochMs: result.eccentricStart.readyGate.readyEpochMs,
    eccentricStartEpochMs: result.eccentricStartEpochMs,
    eccentricEvents,
    rejectedCandidates: result.allRejectedCandidates,
    m1LaneStates: SQUAT_READY_GATE_M1_LANES,
    hasEccentric: result.reachedEccentric,
    phaseEvents: result.phaseEvents,
    repCompleteEvents: result.repCompleteEvents,
    reps: result.reps,
    countedReps: result.countedReps,
    turnaroundMarkers: result.phaseEvents
      .filter((e) => e.eventType === "turnaround")
      .map((e) => ({ sampleIndex: e.sampleIndex, epochMs: e.epochMs, repId: e.repId })),
    concentricMarkers: result.phaseEvents
      .filter((e) => e.eventType === "concentric_start")
      .map((e) => ({ sampleIndex: e.sampleIndex, epochMs: e.epochMs, repId: e.repId })),
    lockoutMarkers: result.phaseEvents
      .filter((e) => e.eventType === "lockout")
      .map((e) => ({ sampleIndex: e.sampleIndex, epochMs: e.epochMs, repId: e.repId })),
  };
}

/** Resolve hover/selection detail for a sample index on the timeline. */
export function resolveSquatEccentricHover(
  timeline: SquatReadyGateTimelinePayload,
  sampleIndex: number
): SquatEccentricHoverDetail | null {
  const point = timeline.chartSeries.find((p) => p.sampleIndex === sampleIndex);
  if (!point) return null;
  const relativeMs = point.epochMs - timeline.captureEpochStartMs;

  const repComplete = timeline.repCompleteEvents.find((e) => e.sampleIndex === sampleIndex);
  if (repComplete) {
    return {
      kind: "rep_complete",
      accepted: true,
      reason: repComplete.reason,
      signedVelocity: repComplete.evidence.signedVelocity,
      descentConfirmSamples: repComplete.evidence.descentConfirmSamples,
      readyDurationMs: null,
      linearAccelerationMagnitude: null,
      correctedGyroMagnitude: null,
      sampleIndex: repComplete.sampleIndex,
      epochMs: repComplete.epochMs,
      relativeMs: repComplete.relativeMs,
      state: "lockout",
      repId: repComplete.repId,
      phase: "rep_complete",
    };
  }

  const phase = timeline.phaseEvents.find((e) => e.sampleIndex === sampleIndex);
  if (phase) {
    return {
      kind: "phase",
      accepted: true,
      reason: phase.reason,
      signedVelocity: (phase.evidence.signedVelocity as number | null) ?? point.bodyZVelocity,
      descentConfirmSamples:
        typeof phase.evidence.descentConfirmSamples === "number"
          ? phase.evidence.descentConfirmSamples
          : null,
      readyDurationMs:
        typeof phase.evidence.readyDurationMs === "number" ? phase.evidence.readyDurationMs : null,
      linearAccelerationMagnitude: null,
      correctedGyroMagnitude: null,
      sampleIndex: phase.sampleIndex,
      epochMs: phase.epochMs,
      relativeMs: phase.relativeMs,
      state: phase.nextState,
      repId: phase.repId,
      phase: phase.eventType,
    };
  }

  const accepted = timeline.eccentricEvents.find((e) => e.sampleIndex === sampleIndex);
  if (accepted) {
    return {
      kind: "accepted",
      accepted: true,
      reason: accepted.reason,
      signedVelocity: accepted.evidence.signedVelocity,
      descentConfirmSamples: accepted.evidence.descentConfirmSamples,
      readyDurationMs: accepted.evidence.readyDurationMs,
      linearAccelerationMagnitude: accepted.evidence.linearAccelerationMagnitude,
      correctedGyroMagnitude: accepted.evidence.correctedGyroMagnitude,
      sampleIndex: accepted.sampleIndex,
      epochMs: accepted.epochMs,
      relativeMs: accepted.relativeMs,
      state: "eccentric",
      repId: 1,
      phase: "eccentric_start",
    };
  }

  const rejects = timeline.rejectedCandidates.filter((r) => r.sampleIndex === sampleIndex);
  const rejected = rejects[rejects.length - 1];
  if (rejected) {
    const eccReject = rejected as SquatEccentricRejectedCandidate & { phase?: string };
    const cycleReject = rejected as SquatRepCycleRejectedCandidate;
    return {
      kind: "rejected",
      accepted: false,
      reason: rejected.reason,
      signedVelocity: rejected.signedVelocity,
      descentConfirmSamples: "descentConfirmSamples" in eccReject ? eccReject.descentConfirmSamples : null,
      readyDurationMs: "readyDurationMs" in eccReject ? eccReject.readyDurationMs ?? null : null,
      linearAccelerationMagnitude:
        "linearAccelerationMagnitude" in eccReject
          ? eccReject.linearAccelerationMagnitude
          : null,
      correctedGyroMagnitude:
        "correctedGyroMagnitude" in eccReject ? eccReject.correctedGyroMagnitude : null,
      sampleIndex: rejected.sampleIndex,
      epochMs: rejected.epochMs,
      relativeMs: rejected.relativeMs,
      state: "stateAtSample" in eccReject ? eccReject.stateAtSample : point.state,
      repId: "repId" in cycleReject ? cycleReject.repId : null,
      phase: ("phase" in rejected ? String(rejected.phase) : null) ?? null,
    };
  }

  return {
    kind: "velocity",
    accepted: null,
    reason: null,
    signedVelocity: point.bodyZVelocity,
    descentConfirmSamples: null,
    readyDurationMs: null,
    linearAccelerationMagnitude: null,
    correctedGyroMagnitude: null,
    sampleIndex: point.sampleIndex,
    epochMs: point.epochMs,
    relativeMs,
    state: point.state,
    repId: null,
    phase: null,
  };
}

export function resolveRepDetail(
  timeline: SquatReadyGateTimelinePayload,
  repId: number
): SquatRepDetail | null {
  return timeline.reps.find((r) => r.repId === repId) ?? null;
}
