import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";
import {
  GENERIC_VBT_LIVE_COUNTER_ID,
  GENERIC_VBT_REPLAY_COUNTER_ID,
} from "../../../gold-grey/src/lib/boise/genericVbtReplay.ts";
import { SQUAT_REP_CYCLE_COUNTER_ID } from "../../../gold-grey/src/lib/boise/squatCounterPredictions.ts";
import { genericVsSquatComparePath } from "../src/api.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

/** Exact sample selected in Workbench UI for this regression. */
const SELECTED_EXERCISE = "squat";
const SELECTED_BASE =
  "squat_2026-07-14T14-57-05-742Z";

describe("POST /api/generic-vs-squat-compare", () => {
  const app = createApp(FIXTURE_ROOT);

  it("matches the exact frontend URL/method for the selected sample", async () => {
    const url = genericVsSquatComparePath(SELECTED_EXERCISE, SELECTED_BASE);
    expect(url).toBe(
      `/api/generic-vs-squat-compare/${encodeURIComponent(SELECTED_EXERCISE)}/${encodeURIComponent(SELECTED_BASE)}`
    );

    const res = await request(app).post(url).send({}).expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.sampleId).toBe(SELECTED_BASE);
    expect(res.body.demoExcluded).toBe(true);
    expect(Array.isArray(res.body.conditionCodes)).toBe(true);

    const ids = res.body.primaryRows.map((r: { counterId: string }) => r.counterId);
    expect(ids).toEqual([
      GENERIC_VBT_LIVE_COUNTER_ID,
      GENERIC_VBT_REPLAY_COUNTER_ID,
      SQUAT_REP_CYCLE_COUNTER_ID,
    ]);

    const live = res.body.primaryRows.find(
      (r: { counterId: string }) => r.counterId === GENERIC_VBT_LIVE_COUNTER_ID
    );
    expect(live.statusLabels).toContain("LIVE_HISTORY_UNAVAILABLE");
    expect(res.body.conditionCodes).toContain("live_history_unavailable");

    const replay = res.body.primaryRows.find(
      (r: { counterId: string }) => r.counterId === GENERIC_VBT_REPLAY_COUNTER_ID
    );
    expect(replay.available).toBe(true);
    expect(replay.statusLabels).toEqual(
      expect.arrayContaining(["REPLAY_SAMPLE_CLOCK", "PARITY_UNPROVEN"])
    );
  }, 60_000);

  it("returns structured sample_not_found (not plain Not Found)", async () => {
    const url = genericVsSquatComparePath("squat", "does-not-exist-sample");
    const res = await request(app).post(url).send({}).expect(404);
    expect(res.body).toMatchObject({
      error: "sample_not_found",
      exerciseId: "squat",
      baseName: "does-not-exist-sample",
    });
    expect(typeof res.body).toBe("object");
    expect(res.text).not.toMatch(/^Not Found$/i);
  });

  it("returns structured route_not_found for unregistered API paths", async () => {
    const res = await request(app)
      .post("/api/generic-vs-squat-compare-TYPO/squat/x")
      .send({})
      .expect(404);
    expect(res.body.error).toBe("route_not_found");
    expect(res.body.error).not.toBe("sample_not_found");
  });

  it("keeps URL encoding consistent with encodeURIComponent", async () => {
    // Same chars the UI encodes; baseName has no reserved chars beyond alnum/_/-.
    const encoded = genericVsSquatComparePath(SELECTED_EXERCISE, SELECTED_BASE);
    const res = await request(app).post(encoded).send({}).expect(200);
    expect(res.body.sampleId).toBe(SELECTED_BASE);
  }, 60_000);
});
