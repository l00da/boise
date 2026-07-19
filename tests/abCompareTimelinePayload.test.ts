import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/index.ts";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/boise-data"
);

describe("POST /api/ab-compare timeline payload", () => {
  const app = createApp(FIXTURE_ROOT);

  it("includes timeline.rows and timeline.episodes on successful squat compare", async () => {
    const res = await request(app)
      .post("/api/ab-compare/squat/squat_2026")
      .send({})
      .expect(200);

    expect(res.body.status).toBe("success");
    expect(res.body.timeline).toBeDefined();

    const timeline = res.body.timeline;
    expect(Array.isArray(timeline.rows)).toBe(true);
    expect(timeline.rows.length).toBeGreaterThan(0);
    expect(Array.isArray(timeline.episodes)).toBe(true);
    expect(timeline.velocitySeries.length).toBe(timeline.rows.length);
    expect(timeline.groupedEpisodes.length).toBe(timeline.episodes.length);

    const shapeSnapshot = {
      topLevelKeys: Object.keys(res.body).sort(),
      timelineKeys: Object.keys(timeline).sort(),
      rowCount: timeline.rows.length,
      episodeCount: timeline.episodes.length,
      overlayCount: timeline.individualOverlays.length,
      firstRow: timeline.rows[0],
      firstEpisode: timeline.episodes[0]
        ? {
            kind: timeline.episodes[0].kind,
            trace: timeline.episodes[0].trace,
            sampleCount: timeline.episodes[0].sampleCount,
          }
        : null,
    };

    expect(shapeSnapshot).toMatchInlineSnapshot(`
      {
        "episodeCount": 0,
        "firstEpisode": null,
        "firstRow": {
          "bodyZA": null,
          "bodyZB": null,
          "epochMs": 0,
          "sampleIndex": 0,
        },
        "overlayCount": 0,
        "rowCount": 120,
        "timelineKeys": [
          "disclaimer",
          "episodes",
          "groupedEpisodes",
          "individualOverlays",
          "oracleBottomReversalCount",
          "rows",
          "velocitySeries",
        ],
        "topLevelKeys": [
          "estimatorA",
          "estimatorB",
          "status",
          "summary",
          "summaryPath",
          "timeline",
          "traceKeyA",
          "traceKeyB",
          "tracePathA",
          "tracePathB",
        ],
      }
    `);
  });
});
