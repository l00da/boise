/**
 * Per-counter miss/extra/match lane labels for Generic vs Squat compare UI.
 * Never present cross-counter pooled misses as a single total.
 */

import type {
  DualCounterTimeline,
  PrimaryCompareRow,
} from "../server/genericVsSquatCompare.ts";
import {
  GENERIC_VBT_LIVE_COUNTER_ID,
  GENERIC_VBT_REPLAY_COUNTER_ID,
} from "../../../gold-grey/src/lib/boise/genericVbtReplay.ts";
import { SQUAT_REP_CYCLE_COUNTER_ID } from "../../../gold-grey/src/lib/boise/squatCounterPredictions.ts";

export type MissLaneView = {
  counterId: string;
  /** Visible label, e.g. "Generic VBT — replay: 3 misses" or "…: unavailable". */
  label: string;
  available: boolean;
  missCount: number;
  marks: { key: string; epochMs: number; title: string }[];
};

export type ExtraLaneView = {
  counterId: string;
  label: string;
  available: boolean;
  extraCount: number;
  marks: { key: string; epochMs: number; title: string }[];
};

export type MatchLinkLaneView = {
  counterId: string;
  label: string;
  marks: {
    key: string;
    epochMs: number;
    title: string;
    widthPx: number;
  }[];
};

const DEFAULT_ORDER = [
  GENERIC_VBT_LIVE_COUNTER_ID,
  GENERIC_VBT_REPLAY_COUNTER_ID,
  SQUAT_REP_CYCLE_COUNTER_ID,
] as const;

/**
 * Build one miss lane per primary counter.
 * Unavailable counters are labeled "unavailable" and contribute 0 marks
 * (their scorer unmatchedTruths are ignored — they are not real misses).
 */
export function buildPerCounterMissLanes(
  timeline: DualCounterTimeline,
  primaryRows: PrimaryCompareRow[]
): MissLaneView[] {
  const byId = new Map(primaryRows.map((r) => [r.counterId, r]));
  const order = primaryRows.length
    ? primaryRows.map((r) => r.counterId)
    : [...DEFAULT_ORDER];

  return order.map((counterId) => {
    const row = byId.get(counterId);
    const name = row?.counterName ?? counterId;
    const available = row?.available === true && row.mode !== "unavailable";

    if (!available) {
      return {
        counterId,
        label: `${name}: unavailable`,
        available: false,
        missCount: 0,
        marks: [],
      };
    }

    const marks = timeline.unmatchedTruths
      .filter((t) => t.counterId === counterId)
      .map((t, i) => ({
        key: `miss-${counterId}-${t.repId}-${i}`,
        epochMs: t.epochMs,
        title: `${name}: ${t.repId}`,
      }));

    return {
      counterId,
      label: `${name}: ${marks.length} misses`,
      available: true,
      missCount: marks.length,
      marks,
    };
  });
}

/** Visible miss total excluding unavailable counters (never a cross-counter pool). */
export function visibleMissTotal(lanes: MissLaneView[]): number {
  return lanes.filter((l) => l.available).reduce((sum, l) => sum + l.missCount, 0);
}

/**
 * Prove we never surface a pooled "misses (unmatched truths) (N)" style label
 * where N sums across counters (including unavailable).
 */
export function assertNoPooledMissLabel(labels: string[]): void {
  for (const label of labels) {
    if (/^misses\s*\(unmatched truths\)/i.test(label.trim())) {
      throw new Error(`Pooled miss label is forbidden: "${label}"`);
    }
  }
}

export function buildPerCounterExtraLanes(
  timeline: DualCounterTimeline,
  primaryRows: PrimaryCompareRow[]
): ExtraLaneView[] {
  const byId = new Map(primaryRows.map((r) => [r.counterId, r]));
  const order = primaryRows.length
    ? primaryRows.map((r) => r.counterId)
    : [...DEFAULT_ORDER];

  return order.map((counterId) => {
    const row = byId.get(counterId);
    const name = row?.counterName ?? counterId;
    const available = row?.available === true && row.mode !== "unavailable";

    if (!available) {
      return {
        counterId,
        label: `${name}: extras unavailable`,
        available: false,
        extraCount: 0,
        marks: [],
      };
    }

    const marks = timeline.unmatchedPredictions
      .filter((p) => p.counterId === counterId)
      .map((p, i) => ({
        key: `extra-${counterId}-${p.predId}-${i}`,
        epochMs: p.epochMs,
        title: `${name}: ${p.predId}`,
      }));

    return {
      counterId,
      label: `${name}: ${marks.length} extras`,
      available: true,
      extraCount: marks.length,
      marks,
    };
  });
}

/** Match links for one selected counter only. */
export function buildSelectedCounterMatchLinks(
  timeline: DualCounterTimeline,
  primaryRows: PrimaryCompareRow[],
  selectedCounterId: string | null
): MatchLinkLaneView {
  const row =
    primaryRows.find((r) => r.counterId === selectedCounterId) ??
    primaryRows.find((r) => r.available) ??
    null;
  const counterId = row?.counterId ?? selectedCounterId ?? "";
  const name = row?.counterName || counterId || "counter";
  const available = row?.available === true && row.mode !== "unavailable";

  if (!available || !counterId) {
    return {
      counterId,
      label: `one-to-one match links: unavailable`,
      marks: [],
    };
  }

  const marks = timeline.matchLinks
    .filter((m) => m.counterId === counterId)
    .map((m, i) => ({
      key: `link-${counterId}-${m.truthRepId}-${m.predId}-${i}`,
      epochMs: m.midEpochMs,
      title: `${name}: ${m.truthRepId}↔${m.predId} (±${m.absErrorMs}ms)`,
      widthPx: 6,
    }));

  return {
    counterId,
    label: `one-to-one match links (${name}): ${marks.length}`,
    marks,
  };
}

/** Default selection: first available primary row (prefer replay over gray live). */
export function defaultSelectedCounterId(primaryRows: PrimaryCompareRow[]): string | null {
  const replay = primaryRows.find(
    (r) => r.counterId === GENERIC_VBT_REPLAY_COUNTER_ID && r.available
  );
  if (replay) return replay.counterId;
  return primaryRows.find((r) => r.available)?.counterId ?? null;
}
