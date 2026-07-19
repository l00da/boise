import { describe, expect, it } from "vitest";
import { prepareTimelineForUi } from "../src/abClampTimelineSanitize.ts";
import type { AbClampTimelinePayload } from "../src/abClampTimelineModel.ts";

const validTimeline: AbClampTimelinePayload = {
  velocitySeries: [
    { sampleIndex: 0, epochMs: 100, bodyZA: 0.2, bodyZB: 0.15 },
    { sampleIndex: 1, epochMs: 110, bodyZA: -0.1, bodyZB: -0.05 },
  ],
  rows: [
    { sampleIndex: 0, epochMs: 100, bodyZA: 0.2, bodyZB: 0.15 },
    { sampleIndex: 1, epochMs: 110, bodyZA: -0.1, bodyZB: -0.05 },
  ],
  individualOverlays: [
    {
      kind: "a_final_clamp",
      trace: "A",
      sampleIndex: 0,
      epochMs: 100,
      bodyZVelocityBefore: 0.2,
      bodyZVelocityAfter: 0,
      stationaryZvu: true,
      genericWouldClamp: true,
      finalClampDecision: true,
      oracleZvuSuppressed: false,
      oracleReason: null,
      markerY: 0.22,
    },
  ],
  groupedEpisodes: [],
  episodes: [],
  oracleBottomReversalCount: 0,
  disclaimer: "test",
};

describe("prepareTimelineForUi", () => {
  it("accepts valid timeline", () => {
    const result = prepareTimelineForUi(validTimeline);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timeline.velocitySeries).toHaveLength(2);
    }
  });

  it("rejects undefined timeline", () => {
    const result = prepareTimelineForUi(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/did not include a timeline/i);
    }
  });

  it("rejects empty velocity series", () => {
    const result = prepareTimelineForUi({ ...validTimeline, velocitySeries: [] });
    expect(result.ok).toBe(false);
  });

  it("drops non-finite velocity rows instead of crashing", () => {
    const result = prepareTimelineForUi({
      ...validTimeline,
      velocitySeries: [
        { sampleIndex: 0, epochMs: NaN, bodyZA: 0.1, bodyZB: 0.1 },
        { sampleIndex: 1, epochMs: 110, bodyZA: Infinity, bodyZB: 0.1 },
        { sampleIndex: 2, epochMs: 120, bodyZA: 0.2, bodyZB: -0.1 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timeline.velocitySeries).toHaveLength(2);
      expect(result.timeline.velocitySeries[0]!.bodyZA).toBeNull();
      expect(result.timeline.velocitySeries[1]!.epochMs).toBe(120);
    }
  });

  it("filters malformed overlay markers", () => {
    const result = prepareTimelineForUi({
      ...validTimeline,
      individualOverlays: [
        ...(validTimeline.individualOverlays ?? []),
        {
          kind: "b_final_clamp",
          trace: "B",
          sampleIndex: 1,
          epochMs: NaN,
          bodyZVelocityBefore: null,
          bodyZVelocityAfter: null,
          stationaryZvu: null,
          genericWouldClamp: null,
          finalClampDecision: null,
          oracleZvuSuppressed: null,
          oracleReason: null,
          markerY: NaN,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timeline.individualOverlays).toHaveLength(1);
    }
  });

  it("handles missing B velocity as null without failing", () => {
    const result = prepareTimelineForUi({
      ...validTimeline,
      velocitySeries: [{ sampleIndex: 0, epochMs: 100, bodyZA: 0.2, bodyZB: null }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.timeline.velocitySeries[0]!.bodyZB).toBeNull();
    }
  });
});
