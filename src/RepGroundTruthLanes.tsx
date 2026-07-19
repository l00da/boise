import {
  GT_PROVENANCE_COLORS,
  type GtTimelineMarker,
  type RepGroundTruthTimelinePayload,
} from "./repGroundTruthTimelineModel";

type Props = {
  timeline: RepGroundTruthTimelinePayload;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onDragEvent?: (eventId: string, targetEpochMs: number) => void;
};

function MarkerLane({
  label,
  markers,
  color,
  domainStart,
  domainEnd,
  selectedEventId,
  onSelectEvent,
  onDragEvent,
}: {
  label: string;
  markers: GtTimelineMarker[];
  color: string;
  domainStart: number;
  domainEnd: number;
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  onDragEvent?: (eventId: string, targetEpochMs: number) => void;
}) {
  const span = Math.max(domainEnd - domainStart, 1);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color, marginBottom: 3, fontFamily: "ui-monospace, monospace" }}>
        {label} ({markers.length})
      </div>
      <div
        style={{ position: "relative", height: 20, background: "#1a1d27", borderRadius: 3 }}
        onDragOver={(e) => e.preventDefault()}
      >
        {markers.map((m) => {
          const left = ((m.epochMs - domainStart) / span) * 100;
          const selected = m.eventId === selectedEventId;
          return (
            <div
              key={m.eventId}
              draggable={Boolean(onDragEvent)}
              title={`${m.eventType} ${m.repId} @ ${m.relativeMs}ms`}
              onClick={() => onSelectEvent(m.eventId)}
              onDragEnd={(e) => {
                if (!onDragEvent) return;
                const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                const epoch = domainStart + frac * span;
                onDragEvent(m.eventId, epoch);
              }}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: 2,
                bottom: 2,
                width: selected ? 6 : 4,
                marginLeft: selected ? -3 : -2,
                background: color,
                borderRadius: 1,
                cursor: onDragEvent ? "grab" : "pointer",
                outline: selected ? "1px solid #fff59d" : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function RepGroundTruthLanes({
  timeline,
  selectedEventId,
  onSelectEvent,
  onDragEvent,
}: Props) {
  const { captureEpochStartMs, captureEpochEndMs } = timeline;
  const span = Math.max(captureEpochEndMs - captureEpochStartMs, 1);

  const lanes: { label: string; markers: GtTimelineMarker[]; color: string }[] = [
    {
      label: "voice markers",
      markers: timeline.voiceMarkers,
      color: GT_PROVENANCE_COLORS.voice_draft,
    },
    {
      label: "manual timeline edits",
      markers: timeline.manualMarkers,
      color: GT_PROVENANCE_COLORS.manually_corrected,
    },
    {
      label: "video-derived labels",
      markers: timeline.videoMarkers,
      color: GT_PROVENANCE_COLORS.video_derived,
    },
    {
      label: "approved truth",
      markers: timeline.approvedMarkers,
      color: GT_PROVENANCE_COLORS.approved_truth,
    },
    {
      label: "phase boundaries",
      markers: timeline.phaseBoundaries,
      color: "#ffd54f",
    },
  ];

  return (
    <div style={{ marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Ground-truth lanes</h4>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>
        Drag markers to snap onto canonical IMU samples. Approval statuses are independent of Boise
        keep/reject.
      </p>
      {lanes.map((lane) => (
        <MarkerLane
          key={lane.label}
          {...lane}
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
          selectedEventId={selectedEventId}
          onSelectEvent={onSelectEvent}
          onDragEvent={onDragEvent}
        />
      ))}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 3 }}>
          rep grouping ({timeline.repSpans.length})
        </div>
        <div style={{ position: "relative", height: 18, background: "#1a1d27", borderRadius: 3 }}>
          {timeline.repSpans.map((r) => {
            const left = ((r.startEpochMs - captureEpochStartMs) / span) * 100;
            const width = ((r.endEpochMs - r.startEpochMs) / span) * 100;
            return (
              <div
                key={r.repId}
                title={r.repId}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  width: `${Math.max(width, 0.6)}%`,
                  top: 3,
                  bottom: 3,
                  background: "rgba(66, 165, 245, 0.25)",
                  border: "1px solid #42a5f5",
                  borderRadius: 2,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
