import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assertTimestampDomainCompatible,
  compareReplayToFlex,
  parseReplayTraceJsonl,
} from "../../../gold-grey/src/lib/imu/replay/flexCompare.ts";
import { parseFlexReference } from "../../../gold-grey/src/lib/imu/replay/flexReference.ts";
import type { BoiseDatasetReader } from "./dataset.ts";
import type { ReplayService } from "./replay.ts";
import { runCapabilityAudit, type CapabilityAudit } from "./capabilities.ts";
import { resolveUnderRoot, assertValidId } from "./pathGuard.ts";
import { runAbCompareForSample } from "./abCompare.ts";

export const ALLOWED_ACTIONS = [
  "copy_path",
  "open_exercise_folder",
  "open_sample_folder",
  "run_replay",
  "run_classifier_preview",
  "run_sm_comparison",
  "run_abc",
  "run_flex_comparison",
] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

export type ActionLogEntry = {
  action: AllowedAction;
  args: Record<string, unknown>;
  startedAt: string;
  result: "success" | "failure" | "unavailable";
  message: string;
  artifacts: string[];
};

export type ActionResult = {
  action: AllowedAction;
  status: "success" | "failure" | "unavailable" | "running";
  message: string;
  artifacts: string[];
};

function appendActionLog(dataRoot: string, entry: ActionLogEntry): void {
  const auditDir = resolveUnderRoot(dataRoot, "_audit");
  mkdirSync(auditDir, { recursive: true });
  const logPath = path.join(auditDir, "actions.log.jsonl");
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}

function gateFor(
  audit: CapabilityAudit,
  capability: string
): { ok: boolean; reason: string } {
  const entry = audit.entries.find((e) => e.capability === capability);
  if (!entry) return { ok: false, reason: `Unknown capability: ${capability}` };
  if (entry.state === "FUNCTIONAL") return { ok: true, reason: "" };
  return { ok: false, reason: entry.reason };
}

export class ActionRegistry {
  constructor(
    private readonly dataRoot: string,
    private readonly dataset: BoiseDatasetReader,
    private readonly replay: ReplayService
  ) {}

  async execute(
    actionId: string,
    args: Record<string, unknown>
  ): Promise<ActionResult> {
    if (!ALLOWED_ACTIONS.includes(actionId as AllowedAction)) {
      throw new Error(`Unknown action: ${actionId}`);
    }
    const action = actionId as AllowedAction;
    const startedAt = new Date().toISOString();
    const audit = runCapabilityAudit();

    try {
      const result = await this.dispatch(action, args, audit);
      appendActionLog(this.dataRoot, {
        action,
        args,
        startedAt,
        result: result.status === "success" ? "success" : result.status === "unavailable" ? "unavailable" : "failure",
        message: result.message,
        artifacts: result.artifacts,
      });
      return result;
    } catch (err) {
      const message = (err as Error).message;
      appendActionLog(this.dataRoot, {
        action,
        args,
        startedAt,
        result: "failure",
        message,
        artifacts: [],
      });
      return { action, status: "failure", message, artifacts: [] };
    }
  }

  private async dispatch(
    action: AllowedAction,
    args: Record<string, unknown>,
    audit: CapabilityAudit
  ): Promise<ActionResult> {
    switch (action) {
      case "copy_path":
        return this.copyPath(args);
      case "open_exercise_folder":
        return this.openFolder("exercise", args);
      case "open_sample_folder":
        return this.openFolder("sample", args);
      case "run_replay":
        return this.runReplay(args, audit);
      case "run_classifier_preview":
        return this.unavailableAction(action, audit, "classifier_desktop");
      case "run_sm_comparison":
        return {
          action,
          status: "unavailable",
          message: "SM comparison harness not yet wired (Pass 18)",
          artifacts: [],
        };
      case "run_abc":
        return this.runAbCompare(args, audit);
      case "run_flex_comparison":
        return this.runFlexComparison(args, audit);
      default:
        throw new Error(`Unhandled action: ${action}`);
    }
  }

  private unavailableAction(
    action: AllowedAction,
    audit: CapabilityAudit,
    capability: string
  ): ActionResult {
    const gate = gateFor(audit, capability);
    return {
      action,
      status: "unavailable",
      message: gate.reason,
      artifacts: [],
    };
  }

  private requireIds(args: Record<string, unknown>): { exerciseId: string; baseName: string } {
    const exerciseId = String(args.exerciseId ?? "");
    const baseName = String(args.baseName ?? "");
    assertValidId(exerciseId, "exerciseId");
    assertValidId(baseName, "baseName");
    return { exerciseId, baseName };
  }

  private copyPath(args: Record<string, unknown>): ActionResult {
    const target = String(args.target ?? "");
    if (target === "ab_artifact" && args.exerciseId && args.baseName && args.which) {
      const { exerciseId, baseName } = this.requireIds(args);
      const which = String(args.which);
      const traceDir = resolveUnderRoot(this.dataRoot, "_traces", baseName);
      const file =
        which === "A"
          ? path.join(traceDir, "A-novbt.jsonl")
          : which === "B"
            ? path.join(traceDir, "B-squat.jsonl")
            : which === "summary"
              ? path.join(traceDir, "ab-summary.json")
              : null;
      if (!file) throw new Error("ab_artifact which must be A, B, or summary");
      return {
        action: "copy_path",
        status: "success",
        message: file,
        artifacts: [file],
      };
    }
    if (target === "sample" && args.exerciseId && args.baseName) {
      const { exerciseId, baseName } = this.requireIds(args);
      const p = resolveUnderRoot(this.dataRoot, exerciseId, baseName);
      return {
        action: "copy_path",
        status: "success",
        message: p,
        artifacts: [p],
      };
    }
    if (target === "exercise" && args.exerciseId) {
      const exerciseId = String(args.exerciseId);
      assertValidId(exerciseId, "exerciseId");
      const p = resolveUnderRoot(this.dataRoot, exerciseId);
      return {
        action: "copy_path",
        status: "success",
        message: p,
        artifacts: [p],
      };
    }
    throw new Error("copy_path requires target + valid ids");
  }

  private openFolder(kind: "exercise" | "sample", args: Record<string, unknown>): ActionResult {
    const result = kind === "exercise"
      ? this.copyPath({ ...args, target: "exercise" })
      : this.copyPath({ ...args, target: "sample" });
    return {
      action: kind === "exercise" ? "open_exercise_folder" : "open_sample_folder",
      status: "success",
      message: `Stub: would open ${result.artifacts[0]}`,
      artifacts: result.artifacts,
    };
  }

  private async runReplay(
    args: Record<string, unknown>,
    audit: CapabilityAudit
  ): Promise<ActionResult> {
    const gate = gateFor(audit, "estimator_replay");
    if (!gate.ok) {
      return { action: "run_replay", status: "unavailable", message: gate.reason, artifacts: [] };
    }
    const { exerciseId, baseName } = this.requireIds(args);
    const detail = this.dataset.getSample(exerciseId, baseName);
    if (!detail.sample) {
      throw new Error("Sample fixture missing or invalid");
    }
    const replayResult = await this.replay.replaySample(baseName, detail.sample, {
      insideVBTWindow: Boolean(args.insideVBTWindow),
      recompute: Boolean(args.recompute),
    });
    return {
      action: "run_replay",
      status: "success",
      message: `Replay ${replayResult.cached ? "cache hit" : "computed"} (${replayResult.traceKey})`,
      artifacts: [replayResult.tracePath],
    };
  }

  private async runAbCompare(
    args: Record<string, unknown>,
    audit: CapabilityAudit
  ): Promise<ActionResult> {
    const gate = gateFor(audit, "abc_replay");
    const entry = audit.entries.find((e) => e.capability === "abc_replay");
    if (!entry || entry.state === "UNAVAILABLE") {
      return {
        action: "run_abc",
        status: "unavailable",
        message: gate.reason || "A/B replay unavailable",
        artifacts: [],
      };
    }
    const { exerciseId, baseName } = this.requireIds(args);
    const result = await runAbCompareForSample(this.dataset, this.replay, exerciseId, baseName);
    if (result.status === "unavailable") {
      return {
        action: "run_abc",
        status: "unavailable",
        message: result.message,
        artifacts: [],
      };
    }
    if (result.status === "failure") {
      return {
        action: "run_abc",
        status: "failure",
        message: result.message,
        artifacts: [],
      };
    }
    return {
      action: "run_abc",
      status: "success",
      message: `A/B compare: ${result.summary.samplesWhereBSuppressedAClamp} oracle suppressions`,
      artifacts: [result.tracePathA, result.tracePathB, result.summaryPath],
    };
  }

  private async runFlexComparison(
    args: Record<string, unknown>,
    audit: CapabilityAudit
  ): Promise<ActionResult> {
    const gate = gateFor(audit, "flex_scoring");
    if (!gate.ok) {
      return {
        action: "run_flex_comparison",
        status: "unavailable",
        message: gate.reason,
        artifacts: [],
      };
    }
    const { exerciseId, baseName } = this.requireIds(args);
    const detail = this.dataset.getSample(exerciseId, baseName);
    if (!detail.sample) throw new Error("Sample fixture missing");

    const replayResult = await this.replay.replaySample(baseName, detail.sample);
    const traceJsonl = readFileSync(replayResult.tracePath, "utf8");
    const rows = parseReplayTraceJsonl(traceJsonl);

    const sidecarPath = resolveUnderRoot(
      this.dataRoot,
      exerciseId,
      baseName,
      "flex-reference.json"
    );
    if (!existsSync(sidecarPath)) {
      return {
        action: "run_flex_comparison",
        status: "failure",
        message: `Missing flex reference sidecar: ${sidecarPath}`,
        artifacts: [],
      };
    }

    const reference = parseFlexReference(
      JSON.parse(readFileSync(sidecarPath, "utf8"))
    );
    assertTimestampDomainCompatible(rows, reference);
    const report = compareReplayToFlex(rows, reference);

    const scoreDir = resolveUnderRoot(this.dataRoot, "_scores", baseName);
    mkdirSync(scoreDir, { recursive: true });
    const scorePath = path.join(scoreDir, `${replayResult.traceKey}.scorecard.json`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(scorePath, JSON.stringify(report, null, 2) + "\n", "utf8");

    return {
      action: "run_flex_comparison",
      status: "success",
      message: `MAE=${report.summary.mae.toFixed(4)} bias=${report.summary.bias.toFixed(4)}`,
      artifacts: [scorePath, replayResult.tracePath],
    };
  }
}
