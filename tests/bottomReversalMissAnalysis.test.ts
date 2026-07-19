import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("POST /api/bottom-reversal-analysis", () => {
  const app = createApp(FIXTURE_ROOT);

  it("returns miss analysis report with thresholds and velocity series", async () => {
    await request(app).post("/api/ab-compare/squat/squat_2026").send({}).expect(200);

    const res = await request(app)
      .post("/api/bottom-reversal-analysis/squat/squat_2026")
      .send({ expectedRegions: [] })
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.report.thresholds.oracleVelocityEpsilonMps).toBe(0.01);
    expect(res.body.report.velocitySeries.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.report.oracleDetections)).toBe(true);
    expect(Array.isArray(res.body.report.rejectedCandidates)).toBe(true);
    expect(res.body.report.summary.rejectedCandidateCount).toBeGreaterThan(0);
  });

  it("evaluates manually marked expected regions", async () => {
    const res = await request(app)
      .post("/api/bottom-reversal-analysis/squat/squat_2026")
      .send({
        expectedRegions: [
          { id: "e1", centerEpochMs: 999999, centerSampleIndex: 0, label: "far miss" },
        ],
      })
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.report.expectedOutcomes).toHaveLength(1);
    expect(res.body.report.expectedOutcomes[0].status).toBe("missed");
    expect(res.body.report.expectedOutcomes[0].missCause).toBeTruthy();
  });
});
