/**
 * Node filesystem adapter for {@link BoiseSampleRepository}.
 * Used by Boise Workbench — does not mutate sample.json when writing GT.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  validateSampleMeta,
  type BoiseSampleMeta,
} from "../../../gold-grey/src/lib/boise/contracts.ts";
import type { ImuFixtureFile } from "../../../gold-grey/src/lib/imu/replay/fixturePlayer.ts";
import {
  parseRepGroundTruth,
  serializeRepGroundTruth,
  REP_GROUND_TRUTH_FILENAME,
  type RepGroundTruthSidecarV1,
} from "../../../gold-grey/src/lib/boise/repGroundTruth.ts";
import type {
  BoiseSampleBundle,
  BoiseSampleRepository,
} from "../../../gold-grey/src/lib/boise/sampleRepository.ts";
import { resolveUnderRoot, assertValidId } from "./pathGuard.ts";

function validateFixture(input: unknown): ImuFixtureFile {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("sample.json must be a JSON object");
  }
  const o = input as Record<string, unknown>;
  if (o.schema !== "reptile.imu.fixture.v1") {
    throw new Error("Invalid sample schema");
  }
  if (typeof o.sampleRateHz !== "number" || !Array.isArray(o.samples)) {
    throw new Error("Invalid fixture fields");
  }
  return o as unknown as ImuFixtureFile;
}

export function createFsBoiseSampleRepository(dataRoot: string): BoiseSampleRepository {
  const sampleDir = (exerciseId: string, sampleBaseName: string) => {
    assertValidId(exerciseId, "exerciseId");
    assertValidId(sampleBaseName, "sampleBaseName");
    return resolveUnderRoot(dataRoot, exerciseId, sampleBaseName);
  };

  return {
    getBundle(exerciseId, sampleBaseName) {
      const dir = sampleDir(exerciseId, sampleBaseName);
      const samplePath = path.join(dir, "sample.json");
      const metaPath = path.join(dir, "meta.json");
      const gtPath = path.join(dir, REP_GROUND_TRUTH_FILENAME);
      if (!existsSync(samplePath) || !existsSync(metaPath)) return null;

      const sampleBytes = new Uint8Array(readFileSync(samplePath));
      const sample = validateFixture(JSON.parse(new TextDecoder().decode(sampleBytes)));
      const meta = validateSampleMeta(
        JSON.parse(readFileSync(metaPath, "utf8"))
      ) as BoiseSampleMeta;

      let repGroundTruth: RepGroundTruthSidecarV1 | null = null;
      if (existsSync(gtPath)) {
        // Malformed → throw (honest failure).
        repGroundTruth = parseRepGroundTruth(JSON.parse(readFileSync(gtPath, "utf8")));
      }

      return {
        exerciseId,
        sampleBaseName,
        sample,
        meta,
        repGroundTruth,
        sampleJsonBytes: sampleBytes,
      } satisfies BoiseSampleBundle;
    },

    putRepGroundTruth(exerciseId, sampleBaseName, truth) {
      const dir = sampleDir(exerciseId, sampleBaseName);
      const samplePath = path.join(dir, "sample.json");
      const gtPath = path.join(dir, REP_GROUND_TRUTH_FILENAME);
      if (!existsSync(samplePath)) {
        throw new Error(`sample.json missing for ${exerciseId}/${sampleBaseName}`);
      }
      const before = readFileSync(samplePath);
      const validated = parseRepGroundTruth(truth);
      writeFileSync(gtPath, serializeRepGroundTruth(validated), "utf8");
      const after = readFileSync(samplePath);
      if (before.compare(after) !== 0) {
        throw new Error("Invariant violated: sample.json mutated by putRepGroundTruth");
      }
    },

    listSampleKeys() {
      // Workbench uses BoiseDatasetReader for listing; keep minimal.
      return [];
    },
  };
}
