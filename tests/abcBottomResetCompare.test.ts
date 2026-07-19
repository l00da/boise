import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("POST /api/abc-bottom-reset-compare", () => {
  const app = createApp(FIXTURE_ROOT);

  it("returns A/B1/B2 summary, reset events, and three-line timeline", async () => {
    const res = await request(app)
      .post("/api/abc-bottom-reset-compare/squat/squat_2026-07-12T06-14-16-507Z")
      .send({})
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.summary.oracleBottomCount).toBeGreaterThan(0);
    expect(res.body.summary.deliberateResetCount).toBe(res.body.summary.oracleBottomCount);
    expect(res.body.summary.disclaimer).toMatch(/without Flex/i);
    expect(res.body.timeline.velocitySeries.length).toBeGreaterThan(0);
    expect(res.body.timeline.rows[0]).toHaveProperty("bodyZA");
    expect(res.body.timeline.rows[0]).toHaveProperty("bodyZB1");
    expect(res.body.timeline.rows[0]).toHaveProperty("bodyZB2");
    expect(res.body.deliberateResetEvents.length).toBe(res.body.summary.deliberateResetCount);
  });
});
