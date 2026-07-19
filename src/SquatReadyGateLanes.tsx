import { useMemo, useState, type ReactNode } from "react";
import type { SquatState } from "../../../gold-grey/src/lib/imu/replay/squatReadyGate.ts";
import {
  resolveRepDetail,
  resolveSquatEccentricHover,
  SQUAT_READY_GATE_LANE_COLORS,
  SQUAT_REP_CYCLE_LANES,
  type SquatEccentricHoverDetail,
  type SquatReadyGateRegion,
  type SquatReadyGateTimelinePayload,
} from "./squatReadyGateTimelineModel";

type Props = {
  timeline: SquatReadyGateTimelinePayload;
  selectedSampleIndex: number | null;
  selectedRepId: number | null;
  onSelectSample: (sampleIndex: number | null) => void;
  onSelectRep: (repId: number | null) => void;
};

function LaneBar({
  regions,
  state,
  color,
  domainStart,
  domainEnd,
  onSelectRegion,
}: {
  regions: SquatReadyGateRegion[];
  state: SquatState;
  color: string;
  domainStart: number;
  domainEnd: number;
  onSelectRegion?: (startSampleIndex: number) => void;
}) {
  const span = Math.max(domainEnd - domainStart, 1);
  const matched = regions.filter((r) => r.state === state);
  return (
    <div
      style={{
        position: "relative",
        height: 18,
        background: "#1a1d27",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      {matched.map((r) => {
        const left = ((r.startEpochMs - domainStart) / span) * 100;
        const width = ((r.endEpochMs - r.startEpochMs) / span) * 100;
        return (
          <div
            key={`${state}-${r.startEpochMs}-${r.endEpochMs}`}
            title={`${state}: ${r.startEpochMs}–${r.endEpochMs} ms`}
            onClick={() => onSelectRegion?.(r.startSampleIndex)}
            style={{
              position: "absolute",
              left: `${left}%`,
              width: `${Math.max(width, 0.4)}%`,
              top: 2,
              bottom: 2,
              background: color,
              borderRadius: 2,
              opacity: 0.9,
              cursor: onSelectRegion ? "pointer" : "default",
            }}
          />
        );
      })}
    </div>
  );
}

function MarkerLane({
  markers,
  color,
  domainStart,
  domainEnd,
  onSelect,
  titleFn,
}: {
  markers: { epochMs: number; sampleIndex: number }[];
  color: string;
  domainStart: number;
  domainEnd: number;
  onSelect: (sampleIndex: number) => void;
  titleFn: (m: { epochMs: number; sampleIndex: number }) => string;
}) {
  const span = Math.max(domainEnd - domainStart, 1);
  return (
    <div style={{ position: "relative", height: 18, background: "#1a1d27", borderRadius: 3 }}>
      {markers.map((m) => {
        const left = ((m.epochMs - domainStart) / span) * 100;
        return (
          <div
            key={`${m.sampleIndex}-${m.epochMs}`}
            title={titleFn(m)}
            onClick={() => onSelect(m.sampleIndex)}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: 2,
              bottom: 2,
              width: 4,
              marginLeft: -2,
              background: color,
              borderRadius: 1,
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}

function HoverCard({ detail }: { detail: SquatEccentricHoverDetail }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        background: "#252a38",
        borderRadius: 4,
        borderLeft: `3px solid ${
          detail.accepted === true ? "#66bb6a" : detail.accepted === false ? "#ef5350" : "#78909c"
        }`,
        fontSize: 12,
        color: "#ddd",
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div style={{ marginBottom: 6, color: "#aaa" }}>
        {detail.kind === "rep_complete"
          ? "rep_complete"
          : detail.kind === "phase"
            ? `phase: ${detail.phase}`
            : detail.kind === "accepted"
              ? "accepted eccentric_start"
              : detail.kind === "rejected"
                ? "rejected candidate"
                : "sample"}
      </div>
      <div>accepted: {detail.accepted === null ? "—" : String(detail.accepted)}</div>
      <div>reason: {detail.reason ?? "—"}</div>
      <div>repId: {detail.repId ?? "—"}</div>
      <div>phase: {detail.phase ?? "—"}</div>
      <div>velocity: {detail.signedVelocity ?? "—"}</div>
      <div>confirm: {detail.descentConfirmSamples ?? "—"}</div>
      <div>sampleIndex: {detail.sampleIndex}</div>
      <div>epochMs: {detail.epochMs}</div>
      <div>relativeMs: {detail.relativeMs}</div>
      <div>state: {detail.state ?? "—"}</div>
    </div>
  );
}

export function SquatReadyGateLanes({
  timeline,
  selectedSampleIndex,
  selectedRepId,
  onSelectSample,
  onSelectRep,
}: Props) {
  const { regions, captureEpochStartMs, captureEpochEndMs, readyEpochMs } = timeline;
  const span = Math.max(captureEpochEndMs - captureEpochStartMs, 1);

  const [hoverSample, setHoverSample] = useState<number | null>(null);
  const activeDetail = useMemo(() => {
    const idx = hoverSample ?? selectedSampleIndex;
    if (idx === null) return null;
    return resolveSquatEccentricHover(timeline, idx);
  }, [timeline, hoverSample, selectedSampleIndex]);

  const selectedRep = selectedRepId !== null ? resolveRepDetail(timeline, selectedRepId) : null;

  const lanes: { label: string; color: string; node: ReactNode }[] = [
    ...SQUAT_REP_CYCLE_LANES.map((state) => ({
      label: state,
      color: SQUAT_READY_GATE_LANE_COLORS[state],
      node: (
        <LaneBar
          regions={regions}
          state={state}
          color={SQUAT_READY_GATE_LANE_COLORS[state]}
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
          onSelectRegion={onSelectSample}
        />
      ),
    })),
    {
      label: `rejected candidates (${timeline.rejectedCandidates.length})`,
      color: "#ef5350",
      node: (
        <MarkerLane
          markers={timeline.rejectedCandidates}
          color="#ef5350"
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
          onSelect={onSelectSample}
          titleFn={(m) => {
            const r = timeline.rejectedCandidates.find((c) => c.sampleIndex === m.sampleIndex);
            return `rejected: ${r?.reason ?? "?"} @ ${m.epochMs}`;
          }}
        />
      ),
    },
    {
      label: `rep_complete (${timeline.repCompleteEvents.length})`,
      color: "#fff176",
      node: (
        <MarkerLane
          markers={timeline.repCompleteEvents}
          color="#fff176"
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
          onSelect={(idx) => {
            onSelectSample(idx);
            const ev = timeline.repCompleteEvents.find((e) => e.sampleIndex === idx);
            if (ev) onSelectRep(ev.repId);
          }}
          titleFn={(m) => {
            const ev = timeline.repCompleteEvents.find((e) => e.sampleIndex === m.sampleIndex);
            return `rep_complete #${ev?.repId ?? "?"} @ ${m.epochMs}`;
          }}
        />
      ),
    },
    {
      label: "body-Z velocity (series below)",
      color: "#90caf9",
      node: (
        <div
          style={{
            height: 18,
            background: "#1a1d27",
            borderRadius: 3,
            fontSize: 10,
            color: "#666",
            display: "flex",
            alignItems: "center",
            paddingLeft: 8,
          }}
        >
          see chart · +Z ascent / −Z descent
        </div>
      ),
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Squat SM lanes (M1–M3)</h4>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>
        ready → eccentric → turnaround → concentric → lockout → rep_complete → between_reps.
        Click a marker or rep below. Times use epochMs only.
      </p>
      {lanes.map((lane) => (
        <div key={lane.label} style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 11,
              color: lane.color,
              marginBottom: 3,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            {lane.label}
          </div>
          <div
            onMouseLeave={() => setHoverSample(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              const epoch = captureEpochStartMs + frac * span;
              const nearest = timeline.chartSeries.reduce(
                (best, p) =>
                  Math.abs(p.epochMs - epoch) < Math.abs(best.epochMs - epoch) ? p : best,
                timeline.chartSeries[0]!
              );
              if (nearest) setHoverSample(nearest.sampleIndex);
            }}
          >
            {lane.node}
          </div>
        </div>
      ))}
      {readyEpochMs !== null && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#66bb6a" }}>
          ready @ relative {(readyEpochMs - captureEpochStartMs).toFixed(0)} ms
          {timeline.eccentricStartEpochMs !== null &&
            ` · eccentric_start @ relative ${(timeline.eccentricStartEpochMs - captureEpochStartMs).toFixed(0)} ms`}
          {` · countedReps ${timeline.countedReps}`}
        </div>
      )}

      {timeline.reps.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "#aaa", marginBottom: 6 }}>Select rep</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {timeline.reps.map((r) => (
              <button
                key={r.repId}
                type="button"
                onClick={() => onSelectRep(r.repId)}
                style={{
                  padding: "4px 10px",
                  background: selectedRepId === r.repId ? "#3949ab" : "#252a38",
                  color: "#eee",
                  border: "1px solid #3a4050",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                rep {r.repId}
                {r.completed ? " ✓" : " …"}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedRep && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "#1e2230",
            borderRadius: 4,
            borderLeft: "3px solid #ab47bc",
            fontSize: 12,
            color: "#ddd",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <div style={{ marginBottom: 6, color: "#ce93d8" }}>rep {selectedRep.repId}</div>
          <div>eccentric_start: {selectedRep.eccentricStartEpochMs ?? "—"}</div>
          <div>turnaround: {selectedRep.turnaroundEpochMs ?? "—"}</div>
          <div>concentric_start: {selectedRep.concentricStartEpochMs ?? "—"}</div>
          <div>lockout: {selectedRep.lockoutEpochMs ?? "—"}</div>
          <div>completion: {selectedRep.completionEpochMs ?? "—"}</div>
          <div>
            durations (ecc / turn→conc / conc / total):{" "}
            {selectedRep.phaseDurationsMs.eccentricMs ?? "—"} /{" "}
            {selectedRep.phaseDurationsMs.turnaroundToConcentricMs ?? "—"} /{" "}
            {selectedRep.phaseDurationsMs.concentricMs ?? "—"} /{" "}
            {selectedRep.phaseDurationsMs.totalMs ?? "—"} ms
          </div>
          <div>transitions: {selectedRep.transitions.length}</div>
          <div>rejected for this rep: {selectedRep.rejected.length}</div>
          {selectedRep.rejected.slice(0, 8).map((r, i) => (
            <div key={`${r.epochMs}-${i}`} style={{ color: "#ef9a9a", marginLeft: 8 }}>
              [{r.phase}] {r.reason} @ {r.relativeMs.toFixed(0)} ms
            </div>
          ))}
        </div>
      )}

      {activeDetail && <HoverCard detail={activeDetail} />}
    </div>
  );
}
