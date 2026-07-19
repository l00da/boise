import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CapabilityState = "FUNCTIONAL" | "CONDITIONAL" | "UNAVAILABLE";

export type CapabilityEntry = {
  capability: string;
  state: CapabilityState;
  evidencePaths: string[];
  reason: string;
  checkedAt: string;
};

export type CapabilityAudit = {
  schema: "reptile.boise.capability-audit.v1";
  checkedAt: string;
  entries: CapabilityEntry[];
};

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);
const GOLD_GREY = path.join(REPO_ROOT, "gold-grey");

function fileExists(relFromRepo: string): boolean {
  return existsSync(path.join(REPO_ROOT, relFromRepo));
}

function readGoldGreyPackage(): Record<string, string> {
  const pkg = JSON.parse(
    readFileSync(path.join(GOLD_GREY, "package.json"), "utf8")
  ) as { scripts?: Record<string, string> };
  return pkg.scripts ?? {};
}

export function runCapabilityAudit(): CapabilityAudit {
  const checkedAt = new Date().toISOString();
  const scripts = readGoldGreyPackage();
  const entries: CapabilityEntry[] = [];

  const replayPresent = fileExists("gold-grey/src/lib/imu/replay/replayRunner.ts");
  entries.push({
    capability: "estimator_replay",
    state: replayPresent ? "FUNCTIONAL" : "UNAVAILABLE",
    evidencePaths: ["gold-grey/src/lib/imu/replay/replayRunner.ts"],
    reason: replayPresent ? "runEstimatorReplay importable" : "replayRunner missing",
    checkedAt,
  });

  const flexPresent =
    fileExists("gold-grey/src/lib/imu/replay/flexCompare.ts") &&
    typeof scripts["compare:flex"] === "string";
  entries.push({
    capability: "flex_scoring",
    state: flexPresent ? "CONDITIONAL" : "UNAVAILABLE",
    evidencePaths: [
      "gold-grey/src/lib/imu/replay/flexCompare.ts",
      "gold-grey/src/lib/imu/replay/compareFlexCli.ts",
    ],
    reason: flexPresent
      ? "compare:flex CLI present; requires flex reference sidecar per sample"
      : "flexCompare module or compare:flex script missing",
    checkedAt,
  });

  const classifierDesktop =
    fileExists("gold-grey/docs/boise/PASS0-EVIDENCE.md") &&
    readFileSync(path.join(GOLD_GREY, "docs/boise/PASS0-EVIDENCE.md"), "utf8").includes(
      "NOT EXECUTABLE"
    );
  entries.push({
    capability: "classifier_desktop",
    state: "UNAVAILABLE",
    evidencePaths: [
      "gold-grey/docs/boise/PASS0-EVIDENCE.md",
      "e2e/san francisco/src/online/predict_csv.py",
    ],
    reason: classifierDesktop
      ? "Pass 0 DESKTOP VERDICT: NOT EXECUTABLE (numpy/sklearn pickle mismatch)"
      : "Classifier desktop path not verified",
    checkedAt,
  });

  entries.push({
    capability: "projection_scatter",
    state: "UNAVAILABLE",
    evidencePaths: ["gold-grey/docs/boise/PASS0-EVIDENCE.md"],
    reason: "Pass 1 FEATURE-TRANSFORM VERDICT: NOT AVAILABLE (no saved pipeline artifact)",
    checkedAt,
  });

  const m3Seam = fileExists("gold-grey/src/lib/imu/exerciseContext.ts");
  const abReplayPresent =
    m3Seam && fileExists("gold-grey/src/lib/imu/replay/abReplayCompare.ts");
  entries.push({
    capability: "abc_replay",
    state: abReplayPresent ? "CONDITIONAL" : "UNAVAILABLE",
    evidencePaths: [
      "gold-grey/src/lib/imu/exerciseContext.ts",
      "gold-grey/src/lib/imu/replay/abReplayCompare.ts",
      "gold-grey/src/lib/imu/replay/compareAbCli.ts",
    ],
    reason: abReplayPresent
      ? "M3 A/B compare + clamp timeline overlay (GET /api/ab-compare/.../timeline)"
      : "ExerciseContext seam or A/B replay helper missing",
    checkedAt,
  });

  entries.push({
    capability: "bulk_transitions",
    state: fileExists("gold-grey/src/lib/boise/sampleTransitions.ts")
      ? "FUNCTIONAL"
      : "UNAVAILABLE",
    evidencePaths: ["gold-grey/src/lib/boise/sampleTransitions.ts"],
    reason: "Shared transition helper from gold-grey",
    checkedAt,
  });

  return {
    schema: "reptile.boise.capability-audit.v1",
    checkedAt,
    entries,
  };
}

export function persistCapabilityAudit(dataRoot: string, audit: CapabilityAudit): string {
  const auditDir = path.join(dataRoot, "_audit");
  mkdirSync(auditDir, { recursive: true });
  const auditPath = path.join(auditDir, "capability-audit.json");
  writeFileSync(auditPath, JSON.stringify(audit, null, 2) + "\n", "utf8");
  return auditPath;
}
