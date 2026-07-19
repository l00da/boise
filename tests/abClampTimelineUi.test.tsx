/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { buildAbClampTimelineFromTraces } from "../server/abClampTimeline.ts";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import { AbClampTimeline } from "../src/AbClampTimeline.tsx";
import { AbComparePanel } from "../src/AbComparePanel.tsx";
import { prepareTimelineForUi } from "../src/abClampTimelineSanitize.ts";
import type { SampleDetail } from "../src/api.ts";
import * as api from "../src/api.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

const detail: SampleDetail = {
  exerciseId: "squat",
  baseName: "squat_2026",
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

describe("AbClampTimeline UI", () => {
  it("renders valid real trace timeline", () => {
    const a = parseReplayTraceJsonl(
      readFileSync(path.join(FIXTURE_ROOT, "_traces/squat_2026/A-novbt.jsonl"), "utf8")
    );
    const b = parseReplayTraceJsonl(
      readFileSync(path.join(FIXTURE_ROOT, "_traces/squat_2026/B-squat.jsonl"), "utf8")
    );
    const prepared = prepareTimelineForUi(buildAbClampTimelineFromTraces(a, b));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    render(<AbClampTimeline timeline={prepared.timeline} />);
    expect(screen.getByLabelText("A/B clamp timeline")).toBeTruthy();
    expect(screen.getByText(/Clamp timeline — body-Z velocity/i)).toBeTruthy();
  });

  it("does not throw on empty sanitized timeline", () => {
    render(
      <AbClampTimeline
        timeline={{
          velocitySeries: [],
          individualOverlays: [],
          groupedEpisodes: [],
          oracleBottomReversalCount: 0,
          disclaimer: "x",
        }}
      />
    );
    expect(screen.getByText(/Timeline unavailable: no chartable velocity samples/i)).toBeTruthy();
  });
});

describe("AbComparePanel timeline failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps summary visible when timeline payload is missing", async () => {
    vi.spyOn(api, "runAbCompare").mockResolvedValue({
      status: "success",
      traceKeyA: "A-novbt",
      traceKeyB: "B-squat",
      tracePathA: "/tmp/A-novbt.jsonl",
      tracePathB: "/tmp/B-squat.jsonl",
      summaryPath: "/tmp/ab-summary.json",
      summary: {
        sampleCount: 10,
        clampCountA: 1,
        clampCountB: 1,
        samplesWhereBSuppressedAClamp: 0,
        maxAbsBodyZVelocityDiff: 0,
        meanAbsBodyZVelocityDiff: 0,
        finalBodyZVelocityA: 0,
        finalBodyZVelocityB: 0,
        aPreservationVerified: true,
        inputTimestampsMatch: true,
      },
      timeline: undefined as never,
      estimatorA: "Generic estimator",
      estimatorB: "Oracle squat estimator",
    });

    render(<AbComparePanel exerciseId="squat" baseName="squat_2026" detail={detail} />);
    fireEvent.click(screen.getByRole("button", { name: /Run A\/B Compare/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Generic A preserved/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("10")).toBeTruthy();
    expect(
      screen.getByText(/Timeline unavailable: Compare response did not include a timeline payload/i)
    ).toBeTruthy();
    expect(screen.getByText(/A JSONL/i)).toBeTruthy();
  });
});
