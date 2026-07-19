/**
 * Boise Workbench — A/B clamp timeline model (analysis-side only).
 *
 * Merges cached A/B replay traces into a shared velocity axis and derives clamp
 * overlay markers. Grouping collapses consecutive per-frame clamps into episodes.
 */

export type ClampOverlayKind =
  | "a_final_clamp"
  | "b_final_clamp"
  | "b_suppressed_a_clamp"
  | "oracle_bottom_reversal";

export type ClampTraceSide = "A" | "B" | "oracle";

/** Minimal replay row fields required for timeline construction. */
export type AbTraceRow = {
  sampleIndex: number;
  epochMs: number;
  bodyZVelocity: number | null;
  velocityBeforeClampZ: number | null;
  velocityAfterClampZ: number | null;
  stationaryZvu: boolean | null;
  genericWouldClamp: boolean | null;
  finalClampDecision: boolean | null;
  oracleZvuSuppressed: boolean | null;
  oracleReason: string | null;
};

export type AbVelocityChartPoint = {
  sampleIndex: number;
  epochMs: number;
  bodyZA: number | null;
  bodyZB: number | null;
};

export type ClampOverlayPoint = {
  kind: ClampOverlayKind;
  trace: ClampTraceSide;
  sampleIndex: number;
  epochMs: number;
  bodyZVelocityBefore: number | null;
  bodyZVelocityAfter: number | null;
  stationaryZvu: boolean | null;
  genericWouldClamp: boolean | null;
  finalClampDecision: boolean | null;
  oracleZvuSuppressed: boolean | null;
  oracleReason: string | null;
  /** Y-axis hint for scatter placement (max |A|,|B| at this sample). */
  markerY: number;
};

export type ClampEpisode = {
  kind: ClampOverlayKind;
  trace: ClampTraceSide;
  startEpochMs: number;
  endEpochMs: number;
  startSampleIndex: number;
  endSampleIndex: number;
  sampleCount: number;
  /** Mid-episode representative for grouped marker placement. */
  representative: ClampOverlayPoint;
};

export type AbClampTimelinePayload = {
  velocitySeries: AbVelocityChartPoint[];
  /** API alias for velocitySeries (POST /api/ab-compare). */
  rows: AbVelocityChartPoint[];
  individualOverlays: ClampOverlayPoint[];
  groupedEpisodes: ClampEpisode[];
  /** API alias for groupedEpisodes (POST /api/ab-compare). */
  episodes: ClampEpisode[];
  oracleBottomReversalCount: number;
  disclaimer: string;
};

export const CLAMP_TIMELINE_DISCLAIMER =
  "A final clamps reflect generic ZVU decisions — not ground-truth rest. " +
  "Use oracle bottom-reversal markers and velocity drift after B suppressions to judge alignment.";

export const OVERLAY_LABELS: Record<ClampOverlayKind, string> = {
  a_final_clamp: "A final clamp",
  b_final_clamp: "B final clamp",
  b_suppressed_a_clamp: "B suppressed A clamp",
  oracle_bottom_reversal: "Oracle bottom reversal (offline)",
};

export function mergeAbVelocitySeries(
  traceA: AbTraceRow[],
  traceB: AbTraceRow[]
): AbVelocityChartPoint[] {
  const n = Math.min(traceA.length, traceB.length);
  const out: AbVelocityChartPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = traceA[i]!;
    const b = traceB[i]!;
    if (a.epochMs !== b.epochMs) {
      continue;
    }
    out.push({
      sampleIndex: a.sampleIndex,
      epochMs: a.epochMs,
      bodyZA: a.bodyZVelocity,
      bodyZB: b.bodyZVelocity,
    });
  }
  return out;
}

function markerYAt(
  velocitySeries: AbVelocityChartPoint[],
  sampleIndex: number
): number {
  const pt = velocitySeries.find((p) => p.sampleIndex === sampleIndex);
  if (!pt) return 0;
  const vals = [pt.bodyZA, pt.bodyZB].filter((v): v is number => v !== null);
  if (vals.length === 0) return 0;
  const peak = Math.max(...vals.map(Math.abs));
  return peak * 1.08 + 0.02;
}

function rowToOverlay(
  row: AbTraceRow,
  kind: ClampOverlayKind,
  trace: ClampTraceSide,
  markerY: number
): ClampOverlayPoint {
  return {
    kind,
    trace,
    sampleIndex: row.sampleIndex,
    epochMs: row.epochMs,
    bodyZVelocityBefore: row.velocityBeforeClampZ,
    bodyZVelocityAfter: row.velocityAfterClampZ,
    stationaryZvu: row.stationaryZvu,
    genericWouldClamp: row.genericWouldClamp,
    finalClampDecision: row.finalClampDecision,
    oracleZvuSuppressed: row.oracleZvuSuppressed,
    oracleReason: row.oracleReason,
    markerY,
  };
}

export function extractIndividualClampOverlays(
  traceA: AbTraceRow[],
  traceB: AbTraceRow[],
  velocitySeries: AbVelocityChartPoint[],
  oracleBottomReversals: { sampleIndex: number; epochMs: number }[]
): ClampOverlayPoint[] {
  const overlays: ClampOverlayPoint[] = [];

  for (const row of traceA) {
    if (row.finalClampDecision) {
      overlays.push(
        rowToOverlay(row, "a_final_clamp", "A", markerYAt(velocitySeries, row.sampleIndex))
      );
    }
  }

  for (const row of traceB) {
    if (row.finalClampDecision) {
      overlays.push(
        rowToOverlay(row, "b_final_clamp", "B", markerYAt(velocitySeries, row.sampleIndex))
      );
    }
    if (row.genericWouldClamp && !row.finalClampDecision && row.oracleZvuSuppressed) {
      overlays.push(
        rowToOverlay(
          row,
          "b_suppressed_a_clamp",
          "B",
          markerYAt(velocitySeries, row.sampleIndex)
        )
      );
    }
  }

  for (const rev of oracleBottomReversals) {
    const rowA = traceA.find((r) => r.sampleIndex === rev.sampleIndex);
    const base = rowA ?? {
      sampleIndex: rev.sampleIndex,
      epochMs: rev.epochMs,
      bodyZVelocity: null,
      velocityBeforeClampZ: null,
      velocityAfterClampZ: null,
      stationaryZvu: null,
      genericWouldClamp: null,
      finalClampDecision: null,
      oracleZvuSuppressed: null,
      oracleReason: null,
    };
    overlays.push(
      rowToOverlay(
        base,
        "oracle_bottom_reversal",
        "oracle",
        markerYAt(velocitySeries, rev.sampleIndex)
      )
    );
  }

  return overlays.sort((a, b) => a.epochMs - b.epochMs);
}

export function groupClampOverlaysIntoEpisodes(
  overlays: ClampOverlayPoint[]
): ClampEpisode[] {
  const episodes: ClampEpisode[] = [];
  const byKindTrace = new Map<string, ClampOverlayPoint[]>();

  for (const o of overlays) {
    const key = `${o.kind}:${o.trace}`;
    const list = byKindTrace.get(key) ?? [];
    list.push(o);
    byKindTrace.set(key, list);
  }

  for (const points of byKindTrace.values()) {
    const sorted = [...points].sort((a, b) => a.sampleIndex - b.sampleIndex);
    let run: ClampOverlayPoint[] = [];

    const flush = () => {
      if (run.length === 0) return;
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const mid = run[Math.floor(run.length / 2)]!;
      episodes.push({
        kind: first.kind,
        trace: first.trace,
        startEpochMs: first.epochMs,
        endEpochMs: last.epochMs,
        startSampleIndex: first.sampleIndex,
        endSampleIndex: last.sampleIndex,
        sampleCount: run.length,
        representative: { ...mid },
      });
      run = [];
    };

    for (const pt of sorted) {
      if (run.length === 0) {
        run.push(pt);
        continue;
      }
      const prev = run[run.length - 1]!;
      if (pt.sampleIndex === prev.sampleIndex + 1) {
        run.push(pt);
      } else {
        flush();
        run.push(pt);
      }
    }
    flush();
  }

  return episodes.sort((a, b) => a.startEpochMs - b.startEpochMs);
}

export function buildAbClampTimelinePayload(
  traceA: AbTraceRow[],
  traceB: AbTraceRow[],
  oracleBottomReversals: { sampleIndex: number; epochMs: number }[]
): AbClampTimelinePayload {
  const velocitySeries = mergeAbVelocitySeries(traceA, traceB);
  const individualOverlays = extractIndividualClampOverlays(
    traceA,
    traceB,
    velocitySeries,
    oracleBottomReversals
  );
  const groupedEpisodes = groupClampOverlaysIntoEpisodes(individualOverlays);

  return {
    velocitySeries,
    rows: velocitySeries,
    individualOverlays,
    groupedEpisodes,
    episodes: groupedEpisodes,
    oracleBottomReversalCount: oracleBottomReversals.length,
    disclaimer: CLAMP_TIMELINE_DISCLAIMER,
  };
}

export function formatOverlayTooltip(point: ClampOverlayPoint | ClampEpisode): string {
  const p = "representative" in point ? point.representative : point;
  const episode =
    "sampleCount" in point
      ? `\nEpisode: ${point.startEpochMs}–${point.endEpochMs} ms (${point.sampleCount} samples)`
      : "";

  return [
    OVERLAY_LABELS[p.kind],
    `epochMs: ${p.epochMs}`,
    `sampleIndex: ${p.sampleIndex}`,
    `bodyZ before clamp: ${formatNullable(p.bodyZVelocityBefore)}`,
    `bodyZ after clamp: ${formatNullable(p.bodyZVelocityAfter)}`,
    `stationaryZvu: ${formatNullable(p.stationaryZvu)}`,
    `genericWouldClamp: ${formatNullable(p.genericWouldClamp)}`,
    `finalClampDecision: ${formatNullable(p.finalClampDecision)}`,
    `oracleZvuSuppressed: ${formatNullable(p.oracleZvuSuppressed)}`,
    `oracleReason: ${p.oracleReason ?? "—"}`,
    episode,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatNullable(v: boolean | number | null): string {
  if (v === null) return "—";
  if (typeof v === "number") return v.toExponential(4);
  return String(v);
}
