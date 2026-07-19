import type { ReactNode } from "react";
import type { DetectedMotionRegion } from "../../../gold-grey/src/lib/imu/replay/motionAccountingReport.ts";
import type { MotionAccountingTimelinePayload } from "./motionAccountingTimelineModel";

type Props = {
  timeline: MotionAccountingTimelinePayload;
};

const LANE_COLORS = {
  raw: "#ab47bc",
  velocityA: "#4fc3f7",
  velocityB: "#ff9800",
  oracle: "#66bb6a",
  expected: "rgba(92, 107, 192, 0.25)",
} as const;

function RegionBar({
  regions,
  color,
  domainStart,
  domainEnd,
}: {
  regions: DetectedMotionRegion[];
  color: string;
  domainStart: number;
  domainEnd: number;
}) {
  const span = Math.max(domainEnd - domainStart, 1);
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
      {regions.map((r) => {
        const left = ((r.startEpochMs - domainStart) / span) * 100;
        const width = ((r.endEpochMs - r.startEpochMs) / span) * 100;
        return (
          <div
            key={`${r.startEpochMs}-${r.endEpochMs}`}
            title={`${r.startEpochMs}–${r.endEpochMs} ms`}
            style={{
              position: "absolute",
              left: `${left}%`,
              width: `${Math.max(width, 0.4)}%`,
              top: 2,
              bottom: 2,
              background: color,
              borderRadius: 2,
              opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

function OracleTicks({
  epochs,
  domainStart,
  domainEnd,
}: {
  epochs: { epochMs: number }[];
  domainStart: number;
  domainEnd: number;
}) {
  const span = Math.max(domainEnd - domainStart, 1);
  return (
    <div style={{ position: "relative", height: 18, background: "#1a1d27", borderRadius: 3 }}>
      {epochs.map((o) => {
        const left = ((o.epochMs - domainStart) / span) * 100;
        return (
          <div
            key={o.epochMs}
            title={`${o.epochMs} ms`}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: 2,
              bottom: 2,
              width: 3,
              marginLeft: -1,
              background: LANE_COLORS.oracle,
              borderRadius: 1,
            }}
          />
        );
      })}
    </div>
  );
}

export function MotionAccountingRegionLanes({ timeline }: Props) {
  const { detectedRegions, captureEpochStartMs, captureEpochEndMs, motionRegions } = timeline;

  const lanes: { label: string; count: number; node: ReactNode }[] = [
    {
      label: `Raw accel/gyro regions (${detectedRegions.rawAccelGyro.length})`,
      count: detectedRegions.rawAccelGyro.length,
      node: (
        <RegionBar
          regions={detectedRegions.rawAccelGyro}
          color={LANE_COLORS.raw}
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
        />
      ),
    },
    {
      label: `A body-Z velocity regions (${detectedRegions.velocityA.length})`,
      count: detectedRegions.velocityA.length,
      node: (
        <RegionBar
          regions={detectedRegions.velocityA}
          color={LANE_COLORS.velocityA}
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
        />
      ),
    },
    {
      label: `B body-Z velocity regions (${detectedRegions.velocityB.length})`,
      count: detectedRegions.velocityB.length,
      node: (
        <RegionBar
          regions={detectedRegions.velocityB}
          color={LANE_COLORS.velocityB}
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
        />
      ),
    },
    {
      label: `Oracle bottom detections (${detectedRegions.oracleBottoms.length})`,
      count: detectedRegions.oracleBottoms.length,
      node: (
        <OracleTicks
          epochs={detectedRegions.oracleBottoms}
          domainStart={captureEpochStartMs}
          domainEnd={captureEpochEndMs}
        />
      ),
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Motion region comparison</h4>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>
        Horizontal bars show where each layer detects motion on the full trace. Expected motion
        windows are shaded on the velocity chart below.
      </p>
      {lanes.map((lane) => (
        <div key={lane.label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#aaa", marginBottom: 3 }}>{lane.label}</div>
          {lane.node}
        </div>
      ))}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 3 }}>
          Expected motions ({motionRegions.length})
        </div>
        <div style={{ position: "relative", height: 18, background: "#1a1d27", borderRadius: 3 }}>
          {motionRegions.map((m) => {
            const span = Math.max(captureEpochEndMs - captureEpochStartMs, 1);
            const left = ((m.startEpochMs - captureEpochStartMs) / span) * 100;
            const width = ((m.endEpochMs - m.startEpochMs) / span) * 100;
            return (
              <div
                key={m.id}
                title={m.label}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  width: `${Math.max(width, 0.4)}%`,
                  top: 2,
                  bottom: 2,
                  background: LANE_COLORS.expected,
                  border: `1px solid ${m.oracleVisible ? LANE_COLORS.oracle : "#ef5350"}`,
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
