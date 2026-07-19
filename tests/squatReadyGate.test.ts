import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";
import {
  resolveSquatEccentricHover,
  SQUAT_READY_GATE_M1_LANES,
  SQUAT_REP_CYCLE_LANES,
} from "../src/squatReadyGateTimelineModel.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("POST /api/squat-ready-gate (M1–M3 squat rep cycle)", () => {
  const app = createApp(FIXTURE_ROOT);

  it("returns M1–M3 lanes, phase events, and body-Z series", async () => {
    const res = await request(app)
      .post("/api/squat-ready-gate/squat/squat_2026-07-10T15-45-15-212Z")
      .send({})
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.countedReps).toBe(res.body.repCompleteEvents.length);
    expect(res.body.timeline.m1LaneStates).toEqual([...SQUAT_READY_GATE_M1_LANES]);
    expect(res.body.timeline.chartSeries.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.timeline.eccentricEvents)).toBe(true);
    expect(Array.isArray(res.body.timeline.rejectedCandidates)).toBe(true);
    expect(Array.isArray(res.body.timeline.repCompleteEvents)).toBe(true);
    expect(Array.isArray(res.body.timeline.phaseEvents)).toBe(true);
    expect(res.body.timeline.countedReps).toBe(res.body.countedReps);
    expect(res.body.rejectedCandidateCount).toBe(res.body.timeline.rejectedCandidates.length);
    expect(SQUAT_REP_CYCLE_LANES).toContain("between_reps");
    expect(SQUAT_REP_CYCLE_LANES).toContain("lockout");

    // Regions should cover cycle vocabulary when present
    const states = new Set(res.body.timeline.regions.map((r: { state: string }) => r.state));
    expect(states.has("rack_rest") || states.has("pre_rep_setup") || states.has("ready")).toBe(
      true
    );

    if (res.body.eccentricEvents.length >= 1) {
      const ev = res.body.eccentricEvents[0];
      expect(ev.eventType).toBe("eccentric_start");
      expect(ev.priorState).toBe("ready");
      expect(ev.nextState).toBe("eccentric");
      expect(ev.evidence.signedVelocity).toBeLessThan(0);
      const hover = resolveSquatEccentricHover(res.body.timeline, ev.sampleIndex);
      expect(hover?.accepted).toBe(true);
      expect(hover?.epochMs).toBe(ev.epochMs);
    }

    for (const rc of res.body.repCompleteEvents) {
      expect(rc.eventType).toBe("rep_complete");
      expect(typeof rc.sampleIndex).toBe("number");
      expect(typeof rc.epochMs).toBe("number");
      expect(rc.relativeMs).toBe(rc.epochMs - res.body.timeline.captureEpochStartMs);
    }
  });
});
