import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("POST /api/causal-squat-bottom-compare", () => {
  const app = createApp(FIXTURE_ROOT);

  it("returns causal vs oracle summary, matches, and timeline", async () => {
    const res = await request(app)
      .post("/api/causal-squat-bottom-compare/squat/squat_2026-07-10T15-45-15-212Z")
      .send({ toleranceMs: 300 })
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.summary.oracleCount).toBeGreaterThan(0);
    expect(res.body.summary.candidateCount).toBeGreaterThan(0);
    expect(res.body.summary.falsePositiveCount).toBe(0);
    expect(res.body.timeline.velocitySeries.length).toBeGreaterThan(0);
    expect(res.body.timeline.oracleOverlays.length).toBe(res.body.summary.oracleCount);
    expect(res.body.timeline.causalOverlays.length).toBe(res.body.summary.candidateCount);
  });

  it("reports misses on challenging multi-rep capture", async () => {
    const res = await request(app)
      .post("/api/causal-squat-bottom-compare/squat/squat_2026-07-12T06-14-16-507Z")
      .send({ toleranceMs: 300 })
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.summary.oracleCount).toBe(5);
    expect(res.body.summary.matchCount).toBeGreaterThanOrEqual(4);
    expect(res.body.summary.missCount).toBeLessThanOrEqual(1);
  });
});
