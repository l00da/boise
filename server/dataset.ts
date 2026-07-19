import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  BOISE_DATA_ROOT,
  BOISE_REGISTRY_REL_PATH,
  BoiseContractError,
  serializeSampleMeta,
  validateExerciseRegistry,
  validateSampleMeta,
  type BoiseExerciseRegistry,
  type BoiseSampleMeta,
} from "../../../gold-grey/src/lib/boise/contracts.ts";
import type { ImuFixtureFile } from "../../../gold-grey/src/lib/imu/replay/fixturePlayer.ts";
import type { StagedBoiseSample } from "../../../gold-grey/src/lib/boise/sampleStaging.ts";
import {
  applyReviewTransition,
  type ReviewTransition,
} from "../../../gold-grey/src/lib/boise/sampleTransitions.ts";
import type { BoiseCollector } from "../../../gold-grey/src/lib/boise/contracts.ts";
import { resolveUnderRoot, assertValidId, PathTraversalError } from "./pathGuard.ts";
import {
  parseRepGroundTruth,
  type RepGroundTruthSidecarV1,
  REP_GROUND_TRUTH_FILENAME,
} from "../../../gold-grey/src/lib/boise/repGroundTruth.ts";

export type IntegrityIssue = {
  kind:
    | "orphan_sample"
    | "orphan_meta"
    | "filename_binding"
    | "schema_invalid"
    | "missing_pair";
  exerciseId: string;
  baseName: string;
  message: string;
};

export type SampleListItem = {
  exerciseId: string;
  baseName: string;
  status: BoiseSampleMeta["status"] | "integrity_error";
  triggerId: string;
  durationSec: number | null;
  collectorId: string;
  collectorName: string;
  capturedAtIso: string;
  integrityIssues: IntegrityIssue[];
};

export type DatasetOverview = {
  dataRoot: string;
  manifest: Record<string, unknown> | null;
  registry: BoiseExerciseRegistry | null;
  countsByExercise: Record<string, { kept: number; rejected: number; unreviewed: number; error: number }>;
  totalSamples: number;
  integrityIssues: IntegrityIssue[];
};

export type SampleDetail = {
  exerciseId: string;
  baseName: string;
  meta: BoiseSampleMeta | null;
  sample: ImuFixtureFile | null;
  /** Optional Pass 3A sidecar — null when absent; integrity issue when malformed. */
  repGroundTruth: RepGroundTruthSidecarV1 | null;
  integrityIssues: IntegrityIssue[];
};

/** Top-level folders under data root that are not exercise ids. */
const RESERVED_ROOT_DIRS = new Set(["boise-data"]);

function isSampleDirName(name: string): boolean {
  return !name.startsWith("_") && !name.startsWith(".");
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function sampleDurationSec(fixture: ImuFixtureFile): number | null {
  if (fixture.samples.length < 2) return fixture.samples.length > 0 ? 0 : null;
  const first = fixture.samples[0]!.epochMs;
  const last = fixture.samples[fixture.samples.length - 1]!.epochMs;
  return (last - first) / 1000;
}

function validateFixture(input: unknown): ImuFixtureFile {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new BoiseContractError("sample.json must be a JSON object");
  }
  const o = input as Record<string, unknown>;
  if (o.schema !== "reptile.imu.fixture.v1") {
    throw new BoiseContractError("Invalid sample schema");
  }
  if (typeof o.sampleRateHz !== "number" || !Array.isArray(o.samples)) {
    throw new BoiseContractError("Invalid fixture fields");
  }
  return o as unknown as ImuFixtureFile;
}

export class BoiseDatasetReader {
  constructor(readonly dataRoot: string) {}

  private exerciseDir(exerciseId: string): string {
    assertValidId(exerciseId, "exerciseId");
    return resolveUnderRoot(this.dataRoot, exerciseId);
  }

  private sampleDir(exerciseId: string, baseName: string): string {
    assertValidId(baseName, "baseName");
    return resolveUnderRoot(this.dataRoot, exerciseId, baseName);
  }

  readManifest(): Record<string, unknown> | null {
    const manifestPath = resolveUnderRoot(this.dataRoot, "export-manifest.json");
    if (!existsSync(manifestPath)) return null;
    return readJsonFile(manifestPath);
  }

  readRegistry(): BoiseExerciseRegistry | null {
    const registryPath = resolveUnderRoot(this.dataRoot, BOISE_REGISTRY_REL_PATH);
    if (!existsSync(registryPath)) return null;
    try {
      return validateExerciseRegistry(readJsonFile(registryPath));
    } catch {
      return null;
    }
  }

  listExerciseIds(): string[] {
    const root = path.resolve(this.dataRoot);
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          !d.name.startsWith("_") &&
          !d.name.startsWith(".") &&
          !RESERVED_ROOT_DIRS.has(d.name)
      )
      .map((d) => d.name)
      .sort();
  }

  listSamples(): SampleListItem[] {
    const items: SampleListItem[] = [];
    for (const exerciseId of this.listExerciseIds()) {
      const dir = this.exerciseDir(exerciseId);
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !isSampleDirName(entry.name)) continue;
        const baseName = entry.name;
        let detail: SampleDetail;
        try {
          detail = this.getSample(exerciseId, baseName);
        } catch (err) {
          if (err instanceof PathTraversalError) {
            items.push({
              exerciseId,
              baseName,
              status: "integrity_error",
              triggerId: "unknown",
              durationSec: null,
              collectorId: "unknown",
              collectorName: "unknown",
              capturedAtIso: "",
              integrityIssues: [
                {
                  kind: "schema_invalid",
                  exerciseId,
                  baseName,
                  message: (err as Error).message,
                },
              ],
            });
            continue;
          }
          throw err;
        }
        const issues = detail.integrityIssues;
        const meta = detail.meta;
        const sample = detail.sample;
        items.push({
          exerciseId,
          baseName,
          status: meta?.status ?? "integrity_error",
          triggerId: meta?.captureTrigger.triggerId ?? "unknown",
          durationSec: sample ? sampleDurationSec(sample) : null,
          collectorId: meta?.collector.id ?? "unknown",
          collectorName: meta?.collector.displayName ?? "unknown",
          capturedAtIso: meta?.capturedAtIso ?? "",
          integrityIssues: issues,
        });
      }
    }
    return items.sort((a, b) => a.capturedAtIso.localeCompare(b.capturedAtIso));
  }

  getOverview(): DatasetOverview {
    const samples = this.listSamples();
    const countsByExercise: DatasetOverview["countsByExercise"] = {};
    const allIssues: IntegrityIssue[] = [];

    for (const row of samples) {
      if (!countsByExercise[row.exerciseId]) {
        countsByExercise[row.exerciseId] = { kept: 0, rejected: 0, unreviewed: 0, error: 0 };
      }
      const bucket = countsByExercise[row.exerciseId]!;
      if (row.status === "kept") bucket.kept++;
      else if (row.status === "rejected") bucket.rejected++;
      else if (row.status === "unreviewed") bucket.unreviewed++;
      else bucket.error++;
      allIssues.push(...row.integrityIssues);
    }

    return {
      dataRoot: this.dataRoot,
      manifest: this.readManifest(),
      registry: this.readRegistry(),
      countsByExercise,
      totalSamples: samples.length,
      integrityIssues: allIssues,
    };
  }

  getSample(exerciseId: string, baseName: string): SampleDetail {
    const issues: IntegrityIssue[] = [];
    const dir = this.sampleDir(exerciseId, baseName);
    const samplePath = path.join(dir, "sample.json");
    const metaPath = path.join(dir, "meta.json");
    const hasSample = existsSync(samplePath);
    const hasMeta = existsSync(metaPath);

    if (hasSample && !hasMeta) {
      issues.push({
        kind: "orphan_sample",
        exerciseId,
        baseName,
        message: "sample.json exists without meta.json",
      });
    }
    if (hasMeta && !hasSample) {
      issues.push({
        kind: "orphan_meta",
        exerciseId,
        baseName,
        message: "meta.json exists without sample.json",
      });
    }
    if (!hasSample && !hasMeta) {
      issues.push({
        kind: "missing_pair",
        exerciseId,
        baseName,
        message: "Neither sample.json nor meta.json found",
      });
      return { exerciseId, baseName, meta: null, sample: null, repGroundTruth: null, integrityIssues: issues };
    }

    let meta: BoiseSampleMeta | null = null;
    let sample: ImuFixtureFile | null = null;
    let repGroundTruth: RepGroundTruthSidecarV1 | null = null;

    if (hasMeta) {
      try {
        meta = validateSampleMeta(readJsonFile(metaPath));
      } catch (err) {
        issues.push({
          kind: "schema_invalid",
          exerciseId,
          baseName,
          message: `meta.json invalid: ${(err as Error).message}`,
        });
      }
    }

    if (hasSample) {
      try {
        sample = validateFixture(readJsonFile(samplePath));
      } catch (err) {
        issues.push({
          kind: "schema_invalid",
          exerciseId,
          baseName,
          message: `sample.json invalid: ${(err as Error).message}`,
        });
      }
    }

    if (meta && sample && meta.imuSessionFile !== "sample.json") {
      issues.push({
        kind: "filename_binding",
        exerciseId,
        baseName,
        message: `meta.imuSessionFile=${meta.imuSessionFile} but expected sample.json`,
      });
    }

    const gtPath = path.join(dir, REP_GROUND_TRUTH_FILENAME);
    if (existsSync(gtPath)) {
      try {
        repGroundTruth = parseRepGroundTruth(readJsonFile(gtPath));
      } catch (err) {
        issues.push({
          kind: "schema_invalid",
          exerciseId,
          baseName,
          message: `${REP_GROUND_TRUTH_FILENAME} invalid: ${(err as Error).message}`,
        });
        repGroundTruth = null;
      }
    }

    return { exerciseId, baseName, meta, sample, repGroundTruth, integrityIssues: issues };
  }

  toStagedSample(detail: SampleDetail): StagedBoiseSample {
    if (!detail.meta || !detail.sample) {
      throw new Error("Cannot stage sample with missing meta or sample");
    }
    return {
      stagingId: detail.baseName,
      exerciseId: detail.exerciseId,
      sampleBaseName: detail.baseName,
      capturedAtIso: detail.meta.capturedAtIso,
      sample: detail.sample,
      meta: detail.meta,
      repGroundTruth: detail.repGroundTruth,
    };
  }

  applyTransition(
    exerciseId: string,
    baseName: string,
    transition: ReviewTransition,
    actor: BoiseCollector
  ): SampleDetail {
    const detail = this.getSample(exerciseId, baseName);
    if (!detail.meta || !detail.sample) {
      throw new Error("Cannot transition sample with integrity errors");
    }
    const staged = this.toStagedSample(detail);
    const updated = applyReviewTransition(staged, transition, actor);
    const metaPath = path.join(this.sampleDir(exerciseId, baseName), "meta.json");
    writeFileSync(metaPath, serializeSampleMeta(updated.meta), "utf8");
    return this.getSample(updated.exerciseId, baseName);
  }
}

export { BOISE_DATA_ROOT };
