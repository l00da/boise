import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("POST /api/motion-accounting", () => {
  const app = createApp(FIXTURE_ROOT);

  it("returns per-motion accounting for 5-motion up-down capture", async () => {
    const res = await request(app)
      .post("/api/motion-accounting/squat/squat_2026-07-12T06-14-16-507Z")
      .send({})
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.report.summary.expectedMotionCount).toBe(5);
    expect(res.body.report.motions).toHaveLength(5);
    expect(res.body.report.summary.estimatedVelocityCyclesA).toBeLessThan(5);
    expect(res.body.timeline.chartSeries.length).toBeGreaterThan(0);
    expect(res.body.timeline.motionRegions).toHaveLength(5);
    expect(res.body.report.motions[0]).toHaveProperty("failureStage");
    expect(res.body.report.motions[0].visibility).toHaveProperty("rawAccelGyro");
    expect(res.body.report.motions[0].visibility).toHaveProperty("bodyZVelocityA");
    expect(res.body.report.motions[0]).toHaveProperty("lossLocus");
    expect(res.body.timeline.detectedRegions.velocityA.length).toBeLessThan(5);
    expect(res.body.timeline.detectedRegions.rawAccelGyro.length).toBeGreaterThan(0);
  });
});
