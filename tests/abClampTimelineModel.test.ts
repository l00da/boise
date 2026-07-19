import { describe, expect, it } from "vitest";
import {
  buildAbClampTimelinePayload,
  extractIndividualClampOverlays,
  groupClampOverlaysIntoEpisodes,
  mergeAbVelocitySeries,
  type AbTraceRow,
} from "../src/abClampTimelineModel.ts";

function row(
  sampleIndex: number,
  epochMs: number,
  overrides: Partial<AbTraceRow> = {}
): AbTraceRow {
  return {
    sampleIndex,
    epochMs,
    bodyZVelocity: 0.1,
    velocityBeforeClampZ: 0.1,
    velocityAfterClampZ: 0,
    stationaryZvu: true,
    genericWouldClamp: true,
    finalClampDecision: true,
    oracleZvuSuppressed: false,
    oracleReason: null,
    ...overrides,
  };
}

describe("abClampTimelineModel", () => {
  it("merges A/B velocity on shared epochMs axis", () => {
    const traceA = [row(0, 100, { bodyZVelocity: 0.2 }), row(1, 110, { bodyZVelocity: -0.1 })];
    const traceB = [row(0, 100, { bodyZVelocity: 0.25 }), row(1, 110, { bodyZVelocity: -0.05 })];
    const merged = mergeAbVelocitySeries(traceA, traceB);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ sampleIndex: 0, epochMs: 100, bodyZA: 0.2, bodyZB: 0.25 });
  });

  it("extracts A clamp, B clamp, suppression, and oracle reversal overlays", () => {
    const traceA = [
      row(0, 100, { finalClampDecision: false, genericWouldClamp: false }),
      row(1, 110, { finalClampDecision: true }),
      row(2, 120, { finalClampDecision: false, bodyZVelocity: -0.2 }),
    ];
    const traceB = [
      row(0, 100, {
        finalClampDecision: false,
        genericWouldClamp: true,
        oracleZvuSuppressed: true,
        oracleReason: "squat_bottom_brief_pause",
      }),
      row(1, 110, { finalClampDecision: true }),
      row(2, 120, { finalClampDecision: false, bodyZVelocity: -0.15 }),
    ];
    const velocitySeries = mergeAbVelocitySeries(traceA, traceB);
    const overlays = extractIndividualClampOverlays(traceA, traceB, velocitySeries, [
      { sampleIndex: 2, epochMs: 120 },
    ]);

    expect(overlays.some((o) => o.kind === "a_final_clamp")).toBe(true);
    expect(overlays.some((o) => o.kind === "b_final_clamp")).toBe(true);
    expect(overlays.some((o) => o.kind === "b_suppressed_a_clamp")).toBe(true);
    expect(overlays.some((o) => o.kind === "oracle_bottom_reversal")).toBe(true);
  });

  it("groups consecutive clamp samples into one episode", () => {
    const overlays = [
      {
        kind: "a_final_clamp" as const,
        trace: "A" as const,
        sampleIndex: 10,
        epochMs: 1000,
        bodyZVelocityBefore: 0.1,
        bodyZVelocityAfter: 0,
        stationaryZvu: true,
        genericWouldClamp: true,
        finalClampDecision: true,
        oracleZvuSuppressed: false,
        oracleReason: null,
        markerY: 0.12,
      },
      {
        kind: "a_final_clamp" as const,
        trace: "A" as const,
        sampleIndex: 11,
        epochMs: 1010,
        bodyZVelocityBefore: 0.1,
        bodyZVelocityAfter: 0,
        stationaryZvu: true,
        genericWouldClamp: true,
        finalClampDecision: true,
        oracleZvuSuppressed: false,
        oracleReason: null,
        markerY: 0.12,
      },
      {
        kind: "a_final_clamp" as const,
        trace: "A" as const,
        sampleIndex: 20,
        epochMs: 2000,
        bodyZVelocityBefore: 0.1,
        bodyZVelocityAfter: 0,
        stationaryZvu: true,
        genericWouldClamp: true,
        finalClampDecision: true,
        oracleZvuSuppressed: false,
        oracleReason: null,
        markerY: 0.12,
      },
    ];

    const episodes = groupClampOverlaysIntoEpisodes(overlays);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]!.sampleCount).toBe(2);
    expect(episodes[0]!.startEpochMs).toBe(1000);
    expect(episodes[0]!.endEpochMs).toBe(1010);
  });

  it("builds full timeline payload with disclaimer", () => {
    const traceA = [row(0, 100), row(1, 110, { finalClampDecision: false })];
    const traceB = [row(0, 100), row(1, 110, { finalClampDecision: false })];
    const payload = buildAbClampTimelinePayload(traceA, traceB, []);
    expect(payload.velocitySeries.length).toBe(2);
    expect(payload.disclaimer).toMatch(/not ground-truth rest/i);
  });
});
