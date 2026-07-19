import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("POST /api/rep-counter-score", () => {
  const app = createApp(FIXTURE_ROOT);

  it("returns shared score report with config and gray unavailable counter", async () => {
    const res = await request(app)
      .post("/api/rep-counter-score/squat/squat_2026-07-10T15-45-15-212Z")
      .send({
        config: { completionToleranceMs: 250 },
        counters: [
          {
            counterId: "offline",
            counterName: "Offline",
            available: false,
            predictions: [],
          },
          {
            counterId: "poor",
            counterName: "Poor",
            available: true,
            predictions: [{ predId: "p1", completionEpochMs: 0 }],
          },
        ],
      })
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.report.schema).toBe("reptile.rep-counter-score.v1");
    expect(res.body.report.config.completionToleranceMs).toBe(250);
    expect(res.body.report.algorithm.name).toBe("greedy_bipartite_completion_tolerance");

    const offline = res.body.report.counters.find(
      (c: { counterId: string }) => c.counterId === "offline"
    );
    expect(offline.absoluteQuality).toBe("gray");

    if (res.body.report.mode === "provisional") {
      expect(res.body.report.provisionalBanner).toBe("PROVISIONAL SCORE");
    }
  });
});
