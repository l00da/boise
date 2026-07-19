/**
 * Boise Workbench — A/B1/B2 bottom-reset counterfactual timeline model.
 */

import type { DeliberateResetEvent } from "../../../gold-grey/src/lib/imu/replay/replayRunner.ts";
import type { ReplayTraceRow } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";

export type AbcVelocityChartPoint = {
  sampleIndex: number;
  epochMs: number;
  bodyZA: number | null;
  bodyZB1: number | null;
  bodyZB2: number | null;
};

export type AbcResetOverlayPoint = {
  sampleIndex: number;
  epochMs: number;
  oracleBottomEpochMs: number;
  velocityBeforeResetZ: number;
  velocityAfterResetZ: number | null;
  markerY: number;
};

export type AbcOracleBottomOverlay = {
  sampleIndex: number;
  epochMs: number;
  markerY: number;
};

export type AbcBottomResetTimelinePayload = {
  velocitySeries: AbcVelocityChartPoint[];
  rows: AbcVelocityChartPoint[];
  oracleBottomOverlays: AbcOracleBottomOverlay[];
  deliberateResetOverlays: AbcResetOverlayPoint[];
  deliberateResetEvents: DeliberateResetEvent[];
  disclaimer: string;
};

export const ABC_BOTTOM_RESET_DISCLAIMER =
  "B2 is offline-only: generic estimator with deliberate velocity zero at each oracle bottom. " +
  "Not more accurate without Flex validation.";

function peakMarkerY(...values: (number | null)[]): number {
  const vals = values.filter((v): v is number => v !== null);
  if (vals.length === 0) return 0;
  return Math.max(...vals.map(Math.abs)) * 1.08 + 0.02;
}

export function buildAbcBottomResetTimeline(
  traceA: ReplayTraceRow[],
  traceB1: ReplayTraceRow[],
  traceB2: ReplayTraceRow[],
  oracleBottomEpochMs: number[],
  deliberateResetEvents: DeliberateResetEvent[]
): AbcBottomResetTimelinePayload {
  const n = Math.min(traceA.length, traceB1.length, traceB2.length);
  const velocitySeries: AbcVelocityChartPoint[] = [];

  for (let i = 0; i < n; i++) {
    const a = traceA[i]!;
    const b1 = traceB1[i]!;
    const b2 = traceB2[i]!;
    if (a.epochMs !== b1.epochMs || a.epochMs !== b2.epochMs) continue;
    velocitySeries.push({
      sampleIndex: a.sampleIndex,
      epochMs: a.epochMs,
      bodyZA: a.bodyZVelocity,
      bodyZB1: b1.bodyZVelocity,
      bodyZB2: b2.bodyZVelocity,
    });
  }

  const oracleBottomOverlays: AbcOracleBottomOverlay[] = oracleBottomEpochMs.map((epochMs) => {
    const pt =
      velocitySeries.find((p) => Math.abs(p.epochMs - epochMs) < 50) ??
      (velocitySeries.length > 0
        ? velocitySeries.reduce((best, p) =>
            Math.abs(p.epochMs - epochMs) < Math.abs(best.epochMs - epochMs) ? p : best
          )
        : { sampleIndex: 0, epochMs, bodyZA: 0, bodyZB1: 0, bodyZB2: 0 });
    return {
      sampleIndex: pt.sampleIndex,
      epochMs: pt.epochMs,
      markerY: peakMarkerY(pt.bodyZA, pt.bodyZB1, pt.bodyZB2),
    };
  });

  const deliberateResetOverlays: AbcResetOverlayPoint[] = deliberateResetEvents.map((e) => {
    const pt = velocitySeries.find((p) => p.sampleIndex === e.sampleIndex) ?? velocitySeries[0]!;
    return {
      sampleIndex: e.sampleIndex,
      epochMs: e.epochMs,
      oracleBottomEpochMs: e.oracleBottomEpochMs,
      velocityBeforeResetZ: e.velocityBeforeResetZ,
      velocityAfterResetZ: e.velocityAfterResetZ,
      markerY: peakMarkerY(pt.bodyZA, pt.bodyZB1, pt.bodyZB2),
    };
  });

  return {
    velocitySeries,
    rows: velocitySeries,
    oracleBottomOverlays,
    deliberateResetOverlays,
    deliberateResetEvents,
    disclaimer: ABC_BOTTOM_RESET_DISCLAIMER,
  };
}
