/**
 * Boise Workbench — motion accounting overlay timeline.
 */

import type {
  DetectedMotionRegions,
  MotionAccountingReport,
} from "../../../gold-grey/src/lib/imu/replay/motionAccountingReport.ts";
import type { ReplayTraceRow } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";

export type MotionAccountingChartPoint = {
  sampleIndex: number;
  epochMs: number;
  accDynamicG: number;
  gyroMagDps: number;
  bodyZA: number | null;
  bodyZB: number | null;
};

export type MotionRegionOverlay = {
  motionIndex: number;
  id: string;
  label: string;
  centerEpochMs: number;
  startEpochMs: number;
  endEpochMs: number;
  failureStage: string;
  rawVisible: boolean;
  velocityAVisible: boolean;
  velocityBVisible: boolean;
  oracleVisible: boolean;
};

export type MotionAccountingTimelinePayload = {
  chartSeries: MotionAccountingChartPoint[];
  motionRegions: MotionRegionOverlay[];
  detectedRegions: DetectedMotionRegions;
  captureEpochStartMs: number;
  captureEpochEndMs: number;
  oracleMarkers: { sampleIndex: number; epochMs: number; markerY: number }[];
};

const REGION_COLORS: Record<string, string> = {
  fully_accounted: "rgba(102, 187, 106, 0.12)",
  raw_motion_absent: "rgba(158, 158, 158, 0.12)",
  pipeline_not_ready: "rgba(120, 144, 156, 0.12)",
  raw_present_velocity_missing: "rgba(239, 83, 80, 0.15)",
  velocity_present_oracle_missed: "rgba(255, 167, 38, 0.15)",
  velocity_B_weaker_than_A: "rgba(171, 71, 188, 0.12)",
};

export function motionRegionFill(stage: string): string {
  return REGION_COLORS[stage] ?? "rgba(92, 107, 192, 0.1)";
}

export function buildMotionAccountingTimeline(
  traceA: ReplayTraceRow[],
  traceB: ReplayTraceRow[],
  report: MotionAccountingReport
): MotionAccountingTimelinePayload {
  const n = Math.min(traceA.length, traceB.length);
  const chartSeries: MotionAccountingChartPoint[] = [];

  for (let i = 0; i < n; i++) {
    const a = traceA[i]!;
    const b = traceB[i]!;
    if (a.epochMs !== b.epochMs) continue;
    const accMag = Math.sqrt(a.ax * a.ax + a.ay * a.ay + a.az * a.az);
    const accDynamicG = Math.abs(accMag - 1);
    const gyroMagDps = Math.sqrt(a.gx * a.gx + a.gy * a.gy + a.gz * a.gz);
    chartSeries.push({
      sampleIndex: a.sampleIndex,
      epochMs: a.epochMs,
      accDynamicG,
      gyroMagDps,
      bodyZA: a.bodyZVelocity,
      bodyZB: b.bodyZVelocity,
    });
  }

  const peakY =
    chartSeries.length > 0
      ? Math.max(
          ...chartSeries.flatMap((p) => [
            Math.abs(p.bodyZA ?? 0),
            Math.abs(p.bodyZB ?? 0),
            p.accDynamicG,
          ])
        ) *
          1.1 +
        0.02
      : 0.1;

  const oracleMarkers = report.oracleDetections.map((d) => ({
    sampleIndex: d.sampleIndex,
    epochMs: d.epochMs,
    markerY: peakY,
  }));

  const motionRegions: MotionRegionOverlay[] = report.motions.map((m) => ({
    motionIndex: m.window.motionIndex,
    id: m.window.id,
    label: m.window.label,
    centerEpochMs: m.window.centerEpochMs,
    startEpochMs: m.window.startEpochMs,
    endEpochMs: m.window.endEpochMs,
    failureStage: m.failureStage,
    rawVisible: m.visibility.rawAccelGyro,
    velocityAVisible: m.visibility.bodyZVelocityA,
    velocityBVisible: m.visibility.bodyZVelocityB,
    oracleVisible: m.visibility.oracleBottom,
  }));

  return {
    chartSeries,
    motionRegions,
    detectedRegions: report.detectedRegions,
    captureEpochStartMs: report.summary.captureEpochStartMs,
    captureEpochEndMs: report.summary.captureEpochEndMs,
    oracleMarkers,
  };
}
