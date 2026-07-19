/**
 * Pass 3C — load/save rep ground-truth for Workbench editor.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { BoiseDatasetReader } from "./dataset.ts";
import { createFsBoiseSampleRepository } from "./fsSampleRepository.ts";
import {
  ensureRepGroundTruthSidecar,
} from "../../../gold-grey/src/lib/boise/repGroundTruthEditor.ts";
import {
  applyRepGroundTruthEdit,
  parseRepGroundTruth,
  type RepGroundTruthSidecarV1,
} from "../../../gold-grey/src/lib/boise/repGroundTruth.ts";
import { parseReplayTraceJsonl } from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import type { ReplayService } from "./replay.ts";
import { loadOrBuildTraceA } from "./bottomReversalMissAnalysis.ts";

export type RepGroundTruthEditorPayload = {
  status: "success";
  exerciseId: string;
  baseName: string;
  sidecar: RepGroundTruthSidecarV1;
  createdNew: boolean;
  sampleEpochMs: number[];
  captureEpochStartMs: number;
  captureEpochEndMs: number;
  /** Body-Z series when A-novbt trace is available; else empty. */
  bodyZSeries: { sampleIndex: number; epochMs: number; bodyZVelocity: number | null }[];
  sampleJsonBytesShaPreview: string;
};

export type RepGroundTruthSaveResult =
  | {
      status: "success";
      sidecar: RepGroundTruthSidecarV1;
      sampleUntouched: true;
    }
  | { status: "failure"; message: string };

function shaPreview(bytes: Uint8Array): string {
  let h = 0;
  for (let i = 0; i < bytes.length; i++) {
    h = (h * 31 + bytes[i]!) >>> 0;
  }
  return h.toString(16);
}

export async function loadRepGroundTruthEditor(
  dataset: BoiseDatasetReader,
  replay: ReplayService,
  exerciseId: string,
  baseName: string,
  annotator = "workbench"
): Promise<RepGroundTruthEditorPayload | { status: "failure"; message: string }> {
  const detail = dataset.getSample(exerciseId, baseName);
  if (!detail.sample || !detail.meta) {
    return { status: "failure", message: "Sample or meta missing / invalid" };
  }

  const createdNew = detail.repGroundTruth == null;
  const sidecar = ensureRepGroundTruthSidecar({
    existing: detail.repGroundTruth,
    sampleId: baseName,
    annotator: detail.meta.collector.displayName || annotator,
  });

  const sampleEpochMs = detail.sample.samples.map((s) => s.epochMs);
  const captureEpochStartMs = sampleEpochMs[0] ?? 0;
  const captureEpochEndMs = sampleEpochMs[sampleEpochMs.length - 1] ?? captureEpochStartMs;

  let bodyZSeries: RepGroundTruthEditorPayload["bodyZSeries"] = [];
  try {
    await loadOrBuildTraceA(replay, baseName, detail.sample);
    const tracePath = replay.getAbCompareTracePaths(baseName).tracePathA;
    if (existsSync(tracePath)) {
      const rows = parseReplayTraceJsonl(readFileSync(tracePath, "utf8"));
      bodyZSeries = rows.map((r) => ({
        sampleIndex: r.sampleIndex,
        epochMs: r.epochMs,
        bodyZVelocity: r.bodyZVelocity,
      }));
    }
  } catch {
    // Timeline still works with IMU epoch domain alone.
    bodyZSeries = detail.sample.samples.map((s, sampleIndex) => ({
      sampleIndex,
      epochMs: s.epochMs,
      bodyZVelocity: null,
    }));
  }

  const samplePath = path.join(dataset.dataRoot, exerciseId, baseName, "sample.json");
  const sampleBytes = existsSync(samplePath)
    ? new Uint8Array(readFileSync(samplePath))
    : new Uint8Array();

  return {
    status: "success",
    exerciseId,
    baseName,
    sidecar,
    createdNew,
    sampleEpochMs,
    captureEpochStartMs,
    captureEpochEndMs,
    bodyZSeries,
    sampleJsonBytesShaPreview: shaPreview(sampleBytes),
  };
}

export function saveRepGroundTruthEditor(
  dataRoot: string,
  exerciseId: string,
  baseName: string,
  truth: unknown,
  opts?: { explicitReapprove?: boolean }
): RepGroundTruthSaveResult {
  try {
    const repo = createFsBoiseSampleRepository(dataRoot);
    const bundle = repo.getBundle(exerciseId, baseName);
    if (!bundle) {
      return { status: "failure", message: "Bundle not found" };
    }
    const before = bundle.sampleJsonBytes ? new Uint8Array(bundle.sampleJsonBytes) : null;

    let next = parseRepGroundTruth(truth);
    if (bundle.repGroundTruth) {
      next = applyRepGroundTruthEdit(bundle.repGroundTruth, {
        events: next.events,
        annotator: next.annotator,
        source: next.source,
        explicitReapprove: Boolean(opts?.explicitReapprove),
        // Never force-approved without explicit reapprove — science edits demote.
        forceApprovalStatus: opts?.explicitReapprove
          ? "approved"
          : next.approvalStatus === "approved"
            ? undefined
            : next.approvalStatus,
      });
    } else if (opts?.explicitReapprove) {
      next = applyRepGroundTruthEdit(next, {
        explicitReapprove: true,
        forceApprovalStatus: "approved",
      });
    }

    repo.putRepGroundTruth(exerciseId, baseName, next);

    const afterBundle = repo.getBundle(exerciseId, baseName);
    if (before && afterBundle?.sampleJsonBytes) {
      const after = afterBundle.sampleJsonBytes;
      if (
        before.length !== after.length ||
        !before.every((b, i) => b === after[i])
      ) {
        return { status: "failure", message: "sample.json was mutated" };
      }
    }

    return { status: "success", sidecar: next, sampleUntouched: true };
  } catch (err) {
    return { status: "failure", message: (err as Error).message };
  }
}
