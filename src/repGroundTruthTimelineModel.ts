/**
 * Pass 3C timeline payload helpers.
 */

import type { RepGroundTruthEventV1, RepGroundTruthSidecarV1 } from "../../../gold-grey/src/lib/boise/repGroundTruth.ts";
import {
  eventProvenance,
  type EventProvenanceKind,
} from "../../../gold-grey/src/lib/boise/repGroundTruthEditor.ts";

export type GtBodyZPoint = {
  sampleIndex: number;
  epochMs: number;
  relativeMs: number;
  bodyZVelocity: number | null;
};

export type GtTimelineMarker = {
  eventId: string;
  repId: string;
  eventType: RepGroundTruthEventV1["eventType"];
  epochMs: number;
  relativeMs: number;
  sampleIndex: number;
  timingMethod: RepGroundTruthEventV1["timingMethod"];
  provenance: EventProvenanceKind;
};

export type GtRepSpan = {
  repId: string;
  startEpochMs: number;
  endEpochMs: number;
};

export type RepGroundTruthTimelinePayload = {
  bodyZSeries: GtBodyZPoint[];
  markers: GtTimelineMarker[];
  voiceMarkers: GtTimelineMarker[];
  manualMarkers: GtTimelineMarker[];
  videoMarkers: GtTimelineMarker[];
  approvedMarkers: GtTimelineMarker[];
  phaseBoundaries: GtTimelineMarker[];
  repSpans: GtRepSpan[];
  captureEpochStartMs: number;
  captureEpochEndMs: number;
};

export const GT_PROVENANCE_COLORS: Record<EventProvenanceKind, string> = {
  voice_draft: "#ab47bc",
  manually_corrected: "#42a5f5",
  video_derived: "#ff7043",
  approved_truth: "#66bb6a",
  other: "#78909c",
};

export function buildRepGroundTruthTimeline(input: {
  sidecar: RepGroundTruthSidecarV1;
  bodyZSeries: { sampleIndex: number; epochMs: number; bodyZVelocity: number | null }[];
  captureEpochStartMs: number;
  captureEpochEndMs: number;
}): RepGroundTruthTimelinePayload {
  const { sidecar, captureEpochStartMs, captureEpochEndMs } = input;
  const bodyZSeries: GtBodyZPoint[] = input.bodyZSeries.map((p) => ({
    ...p,
    relativeMs: p.epochMs - captureEpochStartMs,
  }));

  const markers: GtTimelineMarker[] = sidecar.events.map((e) => ({
    eventId: e.id,
    repId: e.repId,
    eventType: e.eventType,
    epochMs: e.epochMs,
    relativeMs: e.relativeMs,
    sampleIndex: e.sampleIndex,
    timingMethod: e.timingMethod,
    provenance: eventProvenance(e, sidecar.approvalStatus),
  }));

  const voiceMarkers = markers.filter((m) => m.timingMethod === "voice");
  const manualMarkers = markers.filter(
    (m) => m.timingMethod === "timeline_edit" || m.timingMethod === "live_tap"
  );
  const videoMarkers = markers.filter((m) => m.timingMethod === "video");
  const approvedMarkers =
    sidecar.approvalStatus === "approved" ? markers : [];
  const phaseBoundaries = markers.filter((m) => m.eventType !== "rep_complete");

  const byRep = new Map<string, number[]>();
  for (const e of sidecar.events) {
    const epochs = byRep.get(e.repId) ?? [];
    epochs.push(e.epochMs);
    byRep.set(e.repId, epochs);
  }
  const repSpans: GtRepSpan[] = [...byRep.entries()].map(([repId, epochs]) => ({
    repId,
    startEpochMs: Math.min(...epochs),
    endEpochMs: Math.max(...epochs),
  }));

  return {
    bodyZSeries,
    markers,
    voiceMarkers,
    manualMarkers,
    videoMarkers,
    approvedMarkers,
    phaseBoundaries,
    repSpans,
    captureEpochStartMs,
    captureEpochEndMs,
  };
}
