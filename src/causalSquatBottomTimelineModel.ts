/**
 * Boise Workbench — causal vs oracle bottom timeline model.
 */

import type { ReplayTraceRow } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import type { TimedSquatPhaseEvent } from "../../../gold-grey/src/vbt/squatPhaseSeam.ts";

export type CausalVelocityChartPoint = {
  sampleIndex: number;
  epochMs: number;
  bodyZVelocity: number | null;
};

export type CausalBottomOverlay = {
  sampleIndex: number;
  epochMs: number;
  markerY: number;
  provenance: "offline_oracle_trace" | "causal_squat_bottom";
};

export type CausalSquatBottomTimelinePayload = {
  velocitySeries: CausalVelocityChartPoint[];
  oracleOverlays: CausalBottomOverlay[];
  causalOverlays: CausalBottomOverlay[];
};

function peakMarkerY(values: (number | null)[]): number {
  const vals = values.filter((v): v is number => v !== null);
  if (vals.length === 0) return 0;
  return Math.max(...vals.map(Math.abs)) * 1.08 + 0.02;
}

function overlayForEvent(
  event: TimedSquatPhaseEvent,
  velocitySeries: CausalVelocityChartPoint[],
  peakY: number
): CausalBottomOverlay {
  const pt =
    velocitySeries.find((p) => p.sampleIndex === event.sampleIndex) ??
    velocitySeries.find((p) => Math.abs(p.epochMs - event.epochMs) < 50) ??
    velocitySeries[0]!;
  return {
    sampleIndex: event.sampleIndex,
    epochMs: event.epochMs,
    markerY: peakY,
    provenance: event.provenance as CausalBottomOverlay["provenance"],
  };
}

export function buildCausalSquatBottomTimeline(
  rows: ReplayTraceRow[],
  oracleEvents: TimedSquatPhaseEvent[],
  causalEvents: TimedSquatPhaseEvent[]
): CausalSquatBottomTimelinePayload {
  const velocitySeries: CausalVelocityChartPoint[] = rows
    .filter((r) => r.pipelineReady)
    .map((r) => ({
      sampleIndex: r.sampleIndex,
      epochMs: r.epochMs,
      bodyZVelocity: r.bodyZVelocity,
    }));

  const peakY = peakMarkerY(velocitySeries.map((p) => p.bodyZVelocity));

  return {
    velocitySeries,
    oracleOverlays: oracleEvents.map((e) => overlayForEvent(e, velocitySeries, peakY)),
    causalOverlays: causalEvents.map((e) => overlayForEvent(e, velocitySeries, peakY * 0.92)),
  };
}
