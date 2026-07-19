import express from "express";
import cors from "cors";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BoiseDatasetReader } from "./dataset.ts";
import { ReplayService } from "./replay.ts";
import { PathTraversalError } from "./pathGuard.ts";
import { runCapabilityAudit, persistCapabilityAudit } from "./capabilities.ts";
import { ActionRegistry } from "./actions.ts";
import { runAbCompareForSample } from "./abCompare.ts";
import { toAbCompareHttpBody } from "./abCompareResponse.ts";
import { loadAbClampTimelineForSample } from "./abClampTimeline.ts";
import { runBottomReversalMissAnalysisWithReplay } from "./bottomReversalMissAnalysis.ts";
import { runAbcBottomResetCompareForSample } from "./abcBottomResetCompare.ts";
import { runCausalSquatBottomCompareWithReplay } from "./causalSquatBottomCompare.ts";
import { runMotionAccountingWithReplay } from "./motionAccountingReport.ts";
import { runSquatReadyGateWithReplay } from "./squatReadyGate.ts";
import {
  loadRepGroundTruthEditor,
  saveRepGroundTruthEditor,
} from "./repGroundTruthEditor.ts";
import { runRepCounterScoreForSample } from "./repCounterScore.ts";
import { runGenericVsSquatCompare } from "./genericVsSquatCompare.ts";
import {
  buildLabeledCapturesFromRows,
  evaluateOracleBottomDetectorAcrossCaptures,
} from "../../../gold-grey/src/lib/imu/replay/oracleBottomTuning.ts";
import { runEstimatorReplay } from "../../../gold-grey/src/lib/imu/replay/replayRunner.ts";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import { serializeReplayTrace } from "../../../gold-grey/src/lib/imu/replay/replayTrace.ts";
import { BOTTOM_REVERSAL_LABEL_FIXTURES } from "../../../gold-grey/src/lib/imu/replay/bottomReversalLabelFixtures.ts";
import type { ReviewTransition } from "../../../gold-grey/src/lib/boise/sampleTransitions.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA = path.resolve(__dirname, "../fixtures/boise-data");
const PORT = Number(process.env.BOISE_WORKBENCH_PORT ?? 3847);

function parseDataArg(argv: string[]): string {
  const idx = argv.indexOf("--data");
  if (idx >= 0 && argv[idx + 1]) {
    return path.resolve(argv[idx + 1]!);
  }
  return DEFAULT_DATA;
}

export function createApp(dataRoot: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const dataset = new BoiseDatasetReader(dataRoot);
  const replay = new ReplayService(dataRoot);
  const actions = new ActionRegistry(dataRoot, dataset, replay);

  app.get("/api/overview", (_req, res) => {
    res.json(dataset.getOverview());
  });

  app.get("/api/samples", (_req, res) => {
    res.json({ samples: dataset.listSamples() });
  });

  app.get("/api/samples/:exerciseId/:baseName", (req, res) => {
    try {
      const detail = dataset.getSample(req.params.exerciseId!, req.params.baseName!);
      res.json(detail);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  app.post("/api/samples/:exerciseId/:baseName/transition", (req, res) => {
    try {
      const transition = req.body.transition as ReviewTransition;
      const actor = req.body.actor as { id: string; displayName: string };
      if (!actor?.id || !transition?.type) {
        res.status(400).json({ error: "transition and actor required" });
        return;
      }
      const updated = dataset.applyTransition(
        req.params.exerciseId!,
        req.params.baseName!,
        transition,
        actor
      );
      res.json(updated);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/api/replay/:exerciseId/:baseName", async (req, res) => {
    try {
      const detail = dataset.getSample(req.params.exerciseId!, req.params.baseName!);
      if (!detail.sample) {
        res.status(400).json({ error: "Sample fixture missing or invalid" });
        return;
      }
      const result = await replay.replaySample(detail.baseName, detail.sample, {
        insideVBTWindow: Boolean(req.body?.insideVBTWindow),
        recompute: Boolean(req.body?.recompute),
      });
      res.json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/ab-compare/:exerciseId/:baseName/timeline", (req, res) => {
    try {
      const detail = dataset.getSample(req.params.exerciseId!, req.params.baseName!);
      const result = loadAbClampTimelineForSample(replay, detail.baseName);
      if (result.status === "not_found") {
        res.status(404).json(result);
        return;
      }
      if (result.status === "failure") {
        res.status(500).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/ab-compare/:exerciseId/:baseName", async (req, res) => {
    try {
      const result = await runAbCompareForSample(
        dataset,
        replay,
        req.params.exerciseId!,
        req.params.baseName!
      );
      if (result.status === "failure") {
        res.status(500).json(result);
        return;
      }
      const body = toAbCompareHttpBody(result);
      res.status(200).json(body);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/bottom-reversal-analysis/:exerciseId/:baseName", async (req, res) => {
    try {
      const expectedRegions = Array.isArray(req.body?.expectedRegions)
        ? req.body.expectedRegions
        : [];
      const result = await runBottomReversalMissAnalysisWithReplay(
        dataset,
        replay,
        req.params.exerciseId!,
        req.params.baseName!,
        expectedRegions
      );
      if (result.status === "failure") {
        res.status(500).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/abc-bottom-reset-compare/:exerciseId/:baseName", async (req, res) => {
    try {
      const result = await runAbcBottomResetCompareForSample(
        dataset,
        replay,
        req.params.exerciseId!,
        req.params.baseName!
      );
      if (result.status === "failure") {
        res.status(500).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/causal-squat-bottom-compare/:exerciseId/:baseName", async (req, res) => {
    try {
      const toleranceMs =
        typeof req.body?.toleranceMs === "number" ? req.body.toleranceMs : 300;
      const result = await runCausalSquatBottomCompareWithReplay(
        dataset,
        replay,
        req.params.exerciseId!,
        req.params.baseName!,
        toleranceMs
      );
      if (result.status === "failure") {
        res.status(500).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/motion-accounting/:exerciseId/:baseName", async (req, res) => {
    try {
      const result = await runMotionAccountingWithReplay(
        dataset,
        replay,
        req.params.exerciseId!,
        req.params.baseName!
      );
      if (result.status === "failure") {
        res.status(500).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/squat-ready-gate/:exerciseId/:baseName", async (req, res) => {
    try {
      const result = await runSquatReadyGateWithReplay(
        dataset,
        replay,
        req.params.exerciseId!,
        req.params.baseName!
      );
      if (result.status === "failure") {
        res.status(500).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.get("/api/rep-ground-truth/:exerciseId/:baseName", async (req, res) => {
    try {
      const result = await loadRepGroundTruthEditor(
        dataset,
        replay,
        req.params.exerciseId!,
        req.params.baseName!
      );
      if (result.status === "failure") {
        res.status(400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/rep-ground-truth/:exerciseId/:baseName", (req, res) => {
    try {
      const result = saveRepGroundTruthEditor(
        dataRoot,
        req.params.exerciseId!,
        req.params.baseName!,
        req.body?.truth,
        { explicitReapprove: Boolean(req.body?.explicitReapprove) }
      );
      if (result.status === "failure") {
        res.status(400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/rep-counter-score/:exerciseId/:baseName", (req, res) => {
    try {
      const result = runRepCounterScoreForSample(
        dataset,
        req.params.exerciseId!,
        req.params.baseName!,
        {
          counters: req.body?.counters,
          config: req.body?.config,
          selectedCounterId: req.body?.selectedCounterId,
        }
      );
      if (result.status === "failure") {
        res.status(400).json(result);
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ status: "failure", message: err.message });
        return;
      }
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.post("/api/generic-vs-squat-compare/:exerciseId/:baseName", async (req, res) => {
    try {
      const exerciseId = req.params.exerciseId!;
      const baseName = req.params.baseName!;
      const result = await runGenericVsSquatCompare(
        dataset,
        replay,
        exerciseId,
        baseName,
        req.body?.config
      );
      if (result.status === "failure") {
        const httpStatus = result.error === "sample_not_found" ? 404 : 400;
        // Preserve structured error fields for the UI (and exact sample_not_found shape).
        res.status(httpStatus).json({
          error: result.error,
          exerciseId: result.exerciseId,
          baseName: result.baseName,
          status: result.status,
          message: result.message,
        });
        return;
      }
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({
          error: "compare_failed",
          exerciseId: req.params.exerciseId,
          baseName: req.params.baseName,
          message: err.message,
        });
        return;
      }
      res.status(500).json({
        error: "compare_failed",
        exerciseId: req.params.exerciseId,
        baseName: req.params.baseName,
        message: (err as Error).message,
      });
    }
  });

  app.get("/api/oracle-bottom-tuning", async (_req, res) => {
    try {
      const rowsByCaptureId: Record<string, import("../../../gold-grey/src/lib/imu/replay/replayTrace.ts").ReplayTraceRow[]> = {};

      for (const entry of BOTTOM_REVERSAL_LABEL_FIXTURES) {
        const detail = dataset.getSample(entry.exerciseId, entry.baseName);
        if (!detail.sample) continue;
        await replay.replaySample(detail.baseName, detail.sample, { recompute: false });
        const tracePath = replay.getAbCompareTracePaths(detail.baseName).tracePathA;
        if (!existsSync(tracePath)) {
          const result = runEstimatorReplay(detail.sample.samples);
          writeFileSync(tracePath, serializeReplayTrace(result.rows), "utf8");
        }
        rowsByCaptureId[entry.baseName] = parseReplayTraceJsonl(readFileSync(tracePath, "utf8"));
      }

      const report = evaluateOracleBottomDetectorAcrossCaptures(
        buildLabeledCapturesFromRows(rowsByCaptureId)
      );
      res.status(200).json({ status: "success", report });
    } catch (err) {
      res.status(500).json({ status: "failure", message: (err as Error).message });
    }
  });

  app.get("/api/capabilities", (_req, res) => {
    const audit = runCapabilityAudit();
    const auditPath = persistCapabilityAudit(dataRoot, audit);
    res.json({ audit, auditPath });
  });

  app.post("/api/actions/:actionId", async (req, res) => {
    try {
      const result = await actions.execute(req.params.actionId!, req.body ?? {});
      const status = result.status === "failure" ? 400 : 200;
      res.status(status).json(result);
    } catch (err) {
      if (err instanceof PathTraversalError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Distinguish unregistered API routes from sample_not_found / soft compare codes.
  app.use("/api", (req, res) => {
    res.status(404).json({
      error: "route_not_found",
      method: req.method,
      path: req.originalUrl,
      message: `No handler for ${req.method} ${req.path}`,
    });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof PathTraversalError) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  });

  return app;
}

export function startServer(dataRoot: string, port = PORT) {
  const app = createApp(dataRoot);
  return app.listen(port, () => {
    console.log(`Boise Workbench API on http://127.0.0.1:${port} (data: ${dataRoot})`);
    console.log("Boise Workbench API features: ab-compare-timeline-in-post=true");
  });
}

if (process.argv[1]?.includes("server/index")) {
  const dataRoot = parseDataArg(process.argv.slice(2));
  startServer(dataRoot);
}
