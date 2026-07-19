/**
 * Client-side validation/sanitization for A/B clamp timeline payloads.
 * Keeps Recharts from receiving non-finite or malformed structures.
 */

import {
  CLAMP_TIMELINE_DISCLAIMER,
  type AbClampTimelinePayload,
  type AbVelocityChartPoint,
  type ClampEpisode,
  type ClampOverlayKind,
  type ClampOverlayPoint,
} from "./abClampTimelineModel";

export type TimelinePrepareResult =
  | { ok: true; timeline: AbClampTimelinePayload }
  | { ok: false; reason: string };

const OVERLAY_KINDS = new Set<ClampOverlayKind>([
  "a_final_clamp",
  "b_final_clamp",
  "b_suppressed_a_clamp",
  "oracle_bottom_reversal",
]);

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function finiteNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function sanitizeVelocityPoint(raw: unknown): AbVelocityChartPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<AbVelocityChartPoint>;
  const epochMs = finiteOrNull(row.epochMs);
  if (epochMs === null) return null;
  return {
    sampleIndex: finiteNumber(row.sampleIndex, 0),
    epochMs,
    bodyZA: finiteOrNull(row.bodyZA),
    bodyZB: finiteOrNull(row.bodyZB),
  };
}

function sanitizeOverlay(raw: unknown): ClampOverlayPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<ClampOverlayPoint>;
  const kind = row.kind;
  if (!kind || !OVERLAY_KINDS.has(kind)) return null;
  const epochMs = finiteOrNull(row.epochMs);
  if (epochMs === null) return null;
  const markerY = finiteOrNull(row.markerY);
  if (markerY === null) return null;
  return {
    kind,
    trace: row.trace === "A" || row.trace === "B" || row.trace === "oracle" ? row.trace : "A",
    sampleIndex: finiteNumber(row.sampleIndex, 0),
    epochMs,
    bodyZVelocityBefore: finiteOrNull(row.bodyZVelocityBefore),
    bodyZVelocityAfter: finiteOrNull(row.bodyZVelocityAfter),
    stationaryZvu: typeof row.stationaryZvu === "boolean" ? row.stationaryZvu : null,
    genericWouldClamp: typeof row.genericWouldClamp === "boolean" ? row.genericWouldClamp : null,
    finalClampDecision:
      typeof row.finalClampDecision === "boolean" ? row.finalClampDecision : null,
    oracleZvuSuppressed:
      typeof row.oracleZvuSuppressed === "boolean" ? row.oracleZvuSuppressed : null,
    oracleReason: typeof row.oracleReason === "string" ? row.oracleReason : null,
    markerY,
  };
}

function sanitizeEpisode(raw: unknown): ClampEpisode | null {
  if (!raw || typeof raw !== "object") return null;
  const ep = raw as Partial<ClampEpisode>;
  const representative = sanitizeOverlay(ep.representative);
  if (!representative) return null;

  let startEpochMs = finiteOrNull(ep.startEpochMs);
  let endEpochMs = finiteOrNull(ep.endEpochMs);
  if (startEpochMs === null || endEpochMs === null) return null;
  if (startEpochMs > endEpochMs) {
    [startEpochMs, endEpochMs] = [endEpochMs, startEpochMs];
  }

  return {
    kind: representative.kind,
    trace: representative.trace,
    startEpochMs,
    endEpochMs,
    startSampleIndex: finiteNumber(ep.startSampleIndex, representative.sampleIndex),
    endSampleIndex: finiteNumber(ep.endSampleIndex, representative.sampleIndex),
    sampleCount: Math.max(1, finiteNumber(ep.sampleCount, 1)),
    representative,
  };
}

export function prepareTimelineForUi(input: unknown): TimelinePrepareResult {
  if (input == null) {
    return { ok: false, reason: "Compare response did not include a timeline payload" };
  }
  if (typeof input !== "object") {
    return { ok: false, reason: "Timeline payload is not an object" };
  }

  const raw = input as Partial<AbClampTimelinePayload>;
  const rowSource = Array.isArray(raw.velocitySeries)
    ? raw.velocitySeries
    : Array.isArray(raw.rows)
      ? raw.rows
      : [];
  const velocitySeries = rowSource
    .map(sanitizeVelocityPoint)
    .filter((p): p is AbVelocityChartPoint => p !== null);

  if (velocitySeries.length === 0) {
    return { ok: false, reason: "Timeline has no chartable velocity samples with finite epochMs" };
  }

  const individualOverlays = Array.isArray(raw.individualOverlays)
    ? raw.individualOverlays.map(sanitizeOverlay).filter((p): p is ClampOverlayPoint => p !== null)
    : [];

  const episodeSource = Array.isArray(raw.groupedEpisodes)
    ? raw.groupedEpisodes
    : Array.isArray(raw.episodes)
      ? raw.episodes
      : [];
  const groupedEpisodes = episodeSource
    .map(sanitizeEpisode)
    .filter((p): p is ClampEpisode => p !== null);

  const oracleBottomReversalCount = finiteNumber(
    raw.oracleBottomReversalCount,
    individualOverlays.filter((o) => o.kind === "oracle_bottom_reversal").length
  );

  return {
    ok: true,
    timeline: {
      velocitySeries,
      rows: velocitySeries,
      individualOverlays,
      groupedEpisodes,
      episodes: groupedEpisodes,
      oracleBottomReversalCount,
      disclaimer:
        typeof raw.disclaimer === "string" && raw.disclaimer.length > 0
          ? raw.disclaimer
          : CLAMP_TIMELINE_DISCLAIMER,
    },
  };
}
