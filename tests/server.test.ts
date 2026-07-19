import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";
import { BoiseDatasetReader } from "../server/dataset.ts";
import { ReplayService } from "../server/replay.ts";
import {
  runEstimatorReplay,
  tracesNumericallyEqual,
} from "../../../gold-grey/src/lib/imu/replay/replayRunner.ts";
import { serializeReplayTrace } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import { ALLOWED_ACTIONS } from "../server/actions.ts";
import { runAbCompareForSample } from "../server/abCompare.ts";
import { vi } from "vitest";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("Boise Workbench server", () => {
  const app = createApp(FIXTURE_ROOT);

  it("GET /api/overview tolerates nested boise-data export folder without crashing", async () => {
    const res = await request(app).get("/api/overview").expect(200);
    expect(res.body.totalSamples).toBeGreaterThanOrEqual(2);
    expect(res.body.countsByExercise["boise-data"]).toBeUndefined();
  });

  it("GET /api/samples returns validated sample rows", async () => {
    const res = await request(app).get("/api/samples").expect(200);
    expect(res.body.samples.length).toBeGreaterThanOrEqual(2);
    const squat = res.body.samples.find((s: { exerciseId: string }) => s.exerciseId === "squat");
    expect(squat.status).toBe("kept");
    expect(squat.integrityIssues).toHaveLength(0);
  });

  it("GET /api/samples/:exerciseId/:baseName returns sample pair", async () => {
    const res = await request(app).get("/api/samples/squat/squat_2026").expect(200);
    expect(res.body.sample.schema).toBe("reptile.imu.fixture.v1");
    expect(res.body.meta.status).toBe("kept");
    expect(res.body.sample.samples.length).toBeGreaterThan(0);
  });

  it("rejects path traversal in sample fetch", async () => {
    const res = await request(app).get("/api/samples/squat/..%2F..%2Fetc").expect(400);
    expect(res.body.error).toBeTruthy();
  });

  it("rejects path traversal in replay endpoint", async () => {
    const res = await request(app)
      .post("/api/replay/squat/..%2F_registry%2Fexercises")
      .send({})
      .expect(400);
    expect(res.body.error).toBeTruthy();
  });

  it("POST transition keep updates meta with history", async () => {
    const res = await request(app)
      .post("/api/samples/squat/squat_2026/transition")
      .send({
        transition: { type: "keep", note: "test keep" },
        actor: { id: "wb-op", displayName: "Operator" },
      })
      .expect(200);
    expect(res.body.meta.status).toBe("kept");
    expect(res.body.meta.history.length).toBeGreaterThan(0);
  });

  it("replay endpoint matches direct runEstimatorReplay and is deterministic", async () => {
    const reader = new BoiseDatasetReader(FIXTURE_ROOT);
    const detail = reader.getSample("squat", "squat_2026");
    expect(detail.sample).not.toBeNull();

    const direct = runEstimatorReplay(detail.sample!.samples, { insideVBTWindow: false });
    const direct2 = runEstimatorReplay(detail.sample!.samples, { insideVBTWindow: false });
    expect(tracesNumericallyEqual(direct.rows, direct2.rows)).toBe(true);

    const replaySvc = new ReplayService(FIXTURE_ROOT);
    const result = await replaySvc.replaySample("squat_2026", detail.sample!, {
      recompute: true,
    });
    expect(result.determinismVerified).toBe(true);
    expect(result.traceKey).toBe("A-novbt");

    const cachedJsonl = await import("node:fs").then((fs) =>
      fs.readFileSync(result.tracePath, "utf8")
    );
    expect(cachedJsonl).toBe(serializeReplayTrace(direct.rows));

    const apiRes = await request(app)
      .post("/api/replay/squat/squat_2026")
      .send({ recompute: true })
      .expect(200);
    expect(apiRes.body.stats.samples).toBe(direct.rows.length);
    expect(apiRes.body.determinismVerified).toBe(true);
  });

  it("GET /api/capabilities returns audit matrix", async () => {
    const res = await request(app).get("/api/capabilities").expect(200);
    expect(res.body.audit.schema).toBe("reptile.boise.capability-audit.v1");
    expect(res.body.audit.entries.length).toBeGreaterThan(0);
    const classifier = res.body.audit.entries.find(
      (e: { capability: string }) => e.capability === "classifier_desktop"
    );
    expect(classifier.state).toBe("UNAVAILABLE");
  });

  it("rejects unknown actions", async () => {
    const res = await request(app)
      .post("/api/actions/evil_shell")
      .send({ cmd: "rm -rf /" })
      .expect(400);
    expect(res.body.error).toMatch(/Unknown action/);
  });

  it("allowlisted copy_path action succeeds", async () => {
    expect(ALLOWED_ACTIONS).toContain("copy_path");
    const res = await request(app)
      .post("/api/actions/copy_path")
      .send({ target: "sample", exerciseId: "squat", baseName: "squat_2026" })
      .expect(200);
    expect(res.body.status).toBe("success");
    expect(res.body.artifacts[0]).toContain("squat_2026");
  });

  it("run_classifier_preview reports unavailable", async () => {
    const res = await request(app)
      .post("/api/actions/run_classifier_preview")
      .send({ exerciseId: "squat", baseName: "squat_2026" })
      .expect(200);
    expect(res.body.status).toBe("unavailable");
  });

  it("POST /api/ab-compare runs A/B for squat sample via ReplayService.runAbCompare", async () => {
    const replaySvc = new ReplayService(FIXTURE_ROOT);
    const spy = vi.spyOn(replaySvc, "runAbCompare");

    const reader = new BoiseDatasetReader(FIXTURE_ROOT);
    const detail = reader.getSample("squat", "squat_2026");
    expect(detail.sample).not.toBeNull();

    const direct = await runAbCompareForSample(reader, replaySvc, "squat", "squat_2026");
    expect(spy).toHaveBeenCalledOnce();
    expect(direct.status).toBe("success");
    if (direct.status !== "success") return;

    expect(direct.summary.sampleCount).toBeGreaterThan(0);
    expect(direct.summary.aPreservationVerified).toBe(true);
    expect(direct.tracePathA).toContain("A-novbt.jsonl");
    expect(direct.tracePathB).toContain("B-squat.jsonl");
    expect(direct.summaryPath).toContain("ab-summary.json");
    expect(direct.timeline.velocitySeries.length).toBeGreaterThan(0);

    const apiRes = await request(app)
      .post("/api/ab-compare/squat/squat_2026")
      .send({})
      .expect(200);
    expect(apiRes.body.status).toBe("success");
    expect(apiRes.body.summary.clampCountA).toBe(direct.summary.clampCountA);
    expect(apiRes.body.timeline.velocitySeries.length).toBe(direct.timeline.velocitySeries.length);
    expect(apiRes.body.timeline.rows.length).toBeGreaterThan(0);
    expect(Array.isArray(apiRes.body.timeline.episodes)).toBe(true);
    expect(apiRes.body.estimatorA).toBe("Generic estimator");
    expect(apiRes.body.estimatorB).toBe("Oracle squat estimator");

    spy.mockRestore();
  });

  it("POST then GET timeline loads traces from runAbCompare artifact paths (UI integration)", async () => {
    const post = await request(app)
      .post("/api/ab-compare/squat/squat_2026")
      .send({})
      .expect(200);

    expect(post.body.status).toBe("success");
    expect(post.body.tracePathA).toContain("A-novbt.jsonl");
    expect(post.body.tracePathB).toContain("B-squat.jsonl");
    expect(post.body.timeline.velocitySeries.length).toBeGreaterThan(0);
    expect(post.body.timeline.rows.length).toBe(post.body.timeline.velocitySeries.length);
    expect(Array.isArray(post.body.timeline.episodes)).toBe(true);

    const get = await request(app)
      .get("/api/ab-compare/squat/squat_2026/timeline")
      .expect(200);

    expect(get.body.status).toBe("success");
    expect(get.body.timeline.velocitySeries.length).toBe(
      post.body.timeline.velocitySeries.length
    );
    expect(
      get.body.timeline.groupedEpisodes.some(
        (e: { kind: string }) =>
          e.kind === "a_final_clamp" ||
          e.kind === "b_final_clamp" ||
          e.kind === "b_suppressed_a_clamp"
      ) || get.body.timeline.individualOverlays.length >= 0
    ).toBe(true);
  });

  it("POST /api/ab-compare returns unavailable for non-squat label", async () => {
    const res = await request(app)
      .post("/api/ab-compare/bench/bench_2026")
      .send({})
      .expect(200);
    expect(res.body.status).toBe("unavailable");
    expect(res.body.message).toMatch(/squat only/i);
    expect(res.body.sampleExerciseId).toBe("bench");
  });

  it("run_abc action uses allowlisted path and returns artifacts for squat", async () => {
    const res = await request(app)
      .post("/api/actions/run_abc")
      .send({ exerciseId: "squat", baseName: "squat_2026" })
      .expect(200);
    expect(res.body.status).toBe("success");
    expect(res.body.artifacts.length).toBe(3);
  });

  it("copy_path ab_artifact returns trace paths under data root", async () => {
    await request(app)
      .post("/api/ab-compare/squat/squat_2026")
      .send({})
      .expect(200);

    const res = await request(app)
      .post("/api/actions/copy_path")
      .send({
        target: "ab_artifact",
        exerciseId: "squat",
        baseName: "squat_2026",
        which: "summary",
      })
      .expect(200);
    expect(res.body.artifacts[0]).toContain("ab-summary.json");
  });

  it("GET /api/ab-compare timeline returns clamp overlay payload from cached traces", async () => {
    await request(app).post("/api/ab-compare/squat/squat_2026").send({}).expect(200);

    const res = await request(app)
      .get("/api/ab-compare/squat/squat_2026/timeline")
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.timeline.velocitySeries.length).toBeGreaterThan(0);
    expect(res.body.timeline.individualOverlays).toBeInstanceOf(Array);
    expect(res.body.timeline.groupedEpisodes).toBeInstanceOf(Array);
    expect(res.body.timeline.disclaimer).toMatch(/not ground-truth rest/i);
  });

  it("GET /api/ab-compare timeline returns not_found when traces missing", async () => {
    const res = await request(app)
      .get("/api/ab-compare/squat/missing_sample_xyz/timeline")
      .expect(404);
    expect(res.body.status).toBe("not_found");
    expect(res.body.message).toMatch(/A\/B trace artifacts not found/i);
  });
});
