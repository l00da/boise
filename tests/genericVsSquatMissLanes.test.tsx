/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  assertNoPooledMissLabel,
  buildPerCounterMissLanes,
  buildSelectedCounterMatchLinks,
  visibleMissTotal,
} from "../src/genericVsSquatCompareTimelineModel.ts";
import type {
  DualCounterTimeline,
  PrimaryCompareRow,
} from "../server/genericVsSquatCompare.ts";
import {
  GENERIC_VBT_LIVE_COUNTER_ID,
  GENERIC_VBT_REPLAY_COUNTER_ID,
} from "../../../gold-grey/src/lib/boise/genericVbtReplay.ts";
import { SQUAT_REP_CYCLE_COUNTER_ID } from "../../../gold-grey/src/lib/boise/squatCounterPredictions.ts";
import { GenericVsSquatComparePanel } from "../src/GenericVsSquatComparePanel.tsx";
import * as api from "../src/api.ts";
import { vi, afterEach } from "vitest";
import type { SampleDetail } from "../src/api.ts";

function row(
  partial: Partial<PrimaryCompareRow> & Pick<PrimaryCompareRow, "counterId" | "counterName" | "available">
): PrimaryCompareRow {
  return {
    mode: partial.available ? "replay" : "unavailable",
    statusLabels: partial.available ? ["REPLAY_SAMPLE_CLOCK"] : ["LIVE_HISTORY_UNAVAILABLE"],
    claimsLiveParity: false,
    unavailableReason: partial.available ? null : "missing",
    predictedReps: 0,
    truePositives: 0,
    misses: partial.misses ?? 0,
    extras: 0,
    precision: null,
    recall: null,
    f1: null,
    scoreMode: partial.available ? "official" : "unavailable",
    absoluteQuality: partial.available ? "yellow" : "gray",
    ...partial,
  };
}

function timelineFixture(): DualCounterTimeline {
  // Pooled unmatched would misleadingly look like 11 (= 4+3+4) if UI summed all.
  return {
    captureEpochStartMs: 0,
    captureEpochEndMs: 10_000,
    approvedGroundTruth: [
      { repId: "r1", epochMs: 1000 },
      { repId: "r2", epochMs: 2000 },
      { repId: "r3", epochMs: 3000 },
      { repId: "r4", epochMs: 4000 },
    ],
    genericLive: [],
    genericReplay: [{ predId: "g1", epochMs: 1050 }],
    squat: [],
    unmatchedTruths: [
      // live unavailable still appears in raw timeline from scorer
      { counterId: GENERIC_VBT_LIVE_COUNTER_ID, repId: "r1", epochMs: 1000 },
      { counterId: GENERIC_VBT_LIVE_COUNTER_ID, repId: "r2", epochMs: 2000 },
      { counterId: GENERIC_VBT_LIVE_COUNTER_ID, repId: "r3", epochMs: 3000 },
      { counterId: GENERIC_VBT_LIVE_COUNTER_ID, repId: "r4", epochMs: 4000 },
      { counterId: GENERIC_VBT_REPLAY_COUNTER_ID, repId: "r2", epochMs: 2000 },
      { counterId: GENERIC_VBT_REPLAY_COUNTER_ID, repId: "r3", epochMs: 3000 },
      { counterId: GENERIC_VBT_REPLAY_COUNTER_ID, repId: "r4", epochMs: 4000 },
      { counterId: SQUAT_REP_CYCLE_COUNTER_ID, repId: "r1", epochMs: 1000 },
      { counterId: SQUAT_REP_CYCLE_COUNTER_ID, repId: "r2", epochMs: 2000 },
      { counterId: SQUAT_REP_CYCLE_COUNTER_ID, repId: "r3", epochMs: 3000 },
      { counterId: SQUAT_REP_CYCLE_COUNTER_ID, repId: "r4", epochMs: 4000 },
    ],
    unmatchedPredictions: [],
    matchLinks: [
      {
        counterId: GENERIC_VBT_REPLAY_COUNTER_ID,
        truthRepId: "r1",
        predId: "g1",
        absErrorMs: 50,
        midEpochMs: 1025,
      },
      {
        counterId: SQUAT_REP_CYCLE_COUNTER_ID,
        truthRepId: "r1",
        predId: "s1",
        absErrorMs: 10,
        midEpochMs: 1005,
      },
    ],
  };
}

const primaryRows: PrimaryCompareRow[] = [
  row({
    counterId: GENERIC_VBT_LIVE_COUNTER_ID,
    counterName: "Generic VBT — live",
    available: false,
    mode: "unavailable",
  }),
  row({
    counterId: GENERIC_VBT_REPLAY_COUNTER_ID,
    counterName: "Generic VBT — replay",
    available: true,
    misses: 3,
  }),
  row({
    counterId: SQUAT_REP_CYCLE_COUNTER_ID,
    counterName: "Squat lifecycle SM — replay",
    available: true,
    misses: 4,
  }),
];

describe("per-counter miss lanes", () => {
  it("never presents cross-counter pooled misses as one result", () => {
    const timeline = timelineFixture();
    expect(timeline.unmatchedTruths).toHaveLength(11);

    const lanes = buildPerCounterMissLanes(timeline, primaryRows);
    const labels = lanes.map((l) => l.label);
    assertNoPooledMissLabel(labels);

    expect(labels).toEqual([
      "Generic VBT — live: unavailable",
      "Generic VBT — replay: 3 misses",
      "Squat lifecycle SM — replay: 4 misses",
    ]);

    // Unavailable live's 4 scorer "misses" are excluded from visible total.
    expect(visibleMissTotal(lanes)).toBe(7);
    expect(visibleMissTotal(lanes)).not.toBe(11);
    expect(lanes.find((l) => l.counterId === GENERIC_VBT_LIVE_COUNTER_ID)!.marks).toHaveLength(0);
    expect(lanes.find((l) => l.counterId === GENERIC_VBT_REPLAY_COUNTER_ID)!.missCount).toBe(3);
    expect(lanes.find((l) => l.counterId === SQUAT_REP_CYCLE_COUNTER_ID)!.missCount).toBe(4);

    // Forbidden pooled presentation
    expect(labels.some((l) => /misses \(unmatched truths\)/i.test(l))).toBe(false);
  });

  it("scopes match links to the selected counter only", () => {
    const timeline = timelineFixture();
    const replayLinks = buildSelectedCounterMatchLinks(
      timeline,
      primaryRows,
      GENERIC_VBT_REPLAY_COUNTER_ID
    );
    expect(replayLinks.marks).toHaveLength(1);
    expect(replayLinks.marks[0]!.title).toContain("Generic VBT — replay");
    expect(replayLinks.marks.every((m) => m.key.includes(GENERIC_VBT_REPLAY_COUNTER_ID))).toBe(
      true
    );

    const squatLinks = buildSelectedCounterMatchLinks(
      timeline,
      primaryRows,
      SQUAT_REP_CYCLE_COUNTER_ID
    );
    expect(squatLinks.marks).toHaveLength(1);
    expect(squatLinks.marks[0]!.key).toContain(SQUAT_REP_CYCLE_COUNTER_ID);
  });
});

describe("GenericVsSquatComparePanel miss lanes UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders per-counter miss labels and not a pooled miss total", async () => {
    const detail: SampleDetail = {
      exerciseId: "squat",
      baseName: "squat_2026-07-14T14-57-05-742Z",
      meta: {
        status: "kept",
        collector: { id: "c1", displayName: "Collector" },
        captureTrigger: { triggerId: "manual" },
        capturedAtIso: "2026-01-01T00:00:00.000Z",
        label: { exerciseId: "squat" },
      },
      sample: { samples: [{ epochMs: 0, accG: [0, 0, 1], gyroDps: [0, 0, 0] }], sampleRateHz: 100 },
      integrityIssues: [],
    };

    vi.spyOn(api, "fetchGenericVsSquatCompare").mockResolvedValue({
      status: "success",
      sampleId: detail.baseName,
      truthApprovalStatus: "approved",
      truthSource: "voice",
      primaryRows,
      demoExcluded: true,
      report: {
        schema: "reptile.rep-counter-score.v1",
        sampleId: detail.baseName,
        truthApprovalStatus: "approved",
        mode: "official",
        provisionalBanner: null,
        config: {} as never,
        truthReps: [],
        counters: [],
        algorithm: { name: "test", version: 1 },
      } as never,
      timeline: timelineFixture(),
      summary: {
        hasApprovedTruth: true,
        truthRepCount: 4,
        text: "Generic counted 1 of 4 true reps with 0 extras. Squat SM counted 0 of 4 true reps with 0 extras.",
      },
      notes: [],
      conditionCodes: ["live_history_unavailable"],
    });

    render(
      <GenericVsSquatComparePanel
        exerciseId={detail.exerciseId}
        baseName={detail.baseName}
        detail={detail}
      />
    );

    screen.getByRole("button", { name: /Run primary comparison/i }).click();

    expect((await screen.findByTestId("miss-lane-generic-vbt-live-label")).textContent).toBe(
      "Generic VBT — live: unavailable"
    );
    expect(screen.getByTestId("miss-lane-generic-vbt-replay-label").textContent).toBe(
      "Generic VBT — replay: 3 misses"
    );
    expect(screen.getByTestId("miss-lane-squat-rep-cycle-v1-label").textContent).toBe(
      "Squat lifecycle SM — replay: 4 misses"
    );

    // Must not show pooled "misses (unmatched truths) (11)"
    expect(screen.queryByText(/misses \(unmatched truths\)/i)).toBeNull();
    const allText = document.body.textContent ?? "";
    expect(allText).not.toMatch(/misses \(unmatched truths\) \(11\)/i);
  });
});
