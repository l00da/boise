import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("Pass 3C rep ground-truth editor API", () => {
  const app = createApp(FIXTURE_ROOT);

  it("loads sidecar or creates draft when missing", async () => {
    const res = await request(app)
      .get("/api/rep-ground-truth/squat/squat_2026-07-10T15-45-15-212Z")
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.sidecar.schema).toBe("reptile.rep-ground-truth.v1");
    expect(["draft", "reviewed", "approved"]).toContain(res.body.sidecar.approvalStatus);
    expect(Array.isArray(res.body.sampleEpochMs)).toBe(true);
    expect(res.body.sampleEpochMs.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.bodyZSeries)).toBe(true);
  });

  it("saves without mutating sample.json and demotes approved on edit", async () => {
    const load = await request(app)
      .get("/api/rep-ground-truth/squat/squat_2026-07-10T15-45-15-212Z")
      .expect(200);

    const start = load.body.captureEpochStartMs;
    const truth = {
      ...load.body.sidecar,
      approvalStatus: "approved",
      events: [
        {
          id: "e-test-1",
          repId: "rep-001",
          eventType: "rep_complete",
          sampleIndex: 0,
          epochMs: start,
          relativeMs: 0,
          timingMethod: "timeline_edit",
          originalInteractionEpochMs: start,
        },
      ],
    };

    const save1 = await request(app)
      .post("/api/rep-ground-truth/squat/squat_2026-07-10T15-45-15-212Z")
      .send({ truth, explicitReapprove: true })
      .expect(200);

    expect(save1.body.status).toBe("success");
    expect(save1.body.sampleUntouched).toBe(true);
    expect(save1.body.sidecar.approvalStatus).toBe("approved");

    const edited = {
      ...save1.body.sidecar,
      events: [
        {
          ...save1.body.sidecar.events[0],
          epochMs: start + 10,
          sampleIndex: 1,
          relativeMs: 10,
        },
      ],
    };

    // Client already demotes via editor ops; server also runs applyRepGroundTruthEdit.
    const save2 = await request(app)
      .post("/api/rep-ground-truth/squat/squat_2026-07-10T15-45-15-212Z")
      .send({ truth: { ...edited, approvalStatus: "approved" } })
      .expect(200);

    expect(save2.body.sampleUntouched).toBe(true);
    // Without explicitReapprove, science change demotes.
    expect(save2.body.sidecar.approvalStatus).toBe("reviewed");
  });
});
