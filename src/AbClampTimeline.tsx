import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import type {
  AbClampTimelinePayload,
  ClampEpisode,
  ClampOverlayKind,
  ClampOverlayPoint,
  AbVelocityChartPoint,
} from "./abClampTimelineModel";
import { OVERLAY_LABELS, formatOverlayTooltip } from "./abClampTimelineModel";

type Props = {
  timeline: AbClampTimelinePayload;
};

type OverlayMode = "individual" | "grouped";

const OVERLAY_COLORS: Record<ClampOverlayKind, string> = {
  a_final_clamp: "#ef5350",
  b_final_clamp: "#42a5f5",
  b_suppressed_a_clamp: "#ab47bc",
  oracle_bottom_reversal: "#66bb6a",
};

/** Recharts scatter shape names mapped to distinct markers per overlay kind. */
const SHAPE_BY_KIND: Record<ClampOverlayKind, "triangle" | "square" | "diamond" | "star"> = {
  a_final_clamp: "triangle",
  b_final_clamp: "square",
  b_suppressed_a_clamp: "diamond",
  oracle_bottom_reversal: "star",
};

function scatterDataForKind(
  points: Array<ClampOverlayPoint & { x: number; y: number; episode?: ClampEpisode }>,
  kind: ClampOverlayKind
) {
  return points.filter((p) => p.kind === kind);
}

function episodeAreas(episodes: ClampEpisode[], kind: ClampOverlayKind) {
  return episodes.filter((e) => e.kind === kind);
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: ClampOverlayPoint &
      AbVelocityChartPoint & {
        x?: number;
        y?: number;
        episode?: ClampEpisode;
      };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  if (!item) return null;

  if (item.episode) {
    return (
      <div
        style={{
          background: "#1a1d27",
          border: "1px solid #444",
          padding: 10,
          fontSize: 12,
          whiteSpace: "pre-wrap",
          maxWidth: 320,
        }}
      >
        {formatOverlayTooltip(item.episode)}
      </div>
    );
  }

  if (item.kind) {
    return (
      <div
        style={{
          background: "#1a1d27",
          border: "1px solid #444",
          padding: 10,
          fontSize: 12,
          whiteSpace: "pre-wrap",
          maxWidth: 320,
        }}
      >
        {formatOverlayTooltip(item)}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#1a1d27",
        border: "1px solid #444",
        padding: 10,
        fontSize: 12,
        whiteSpace: "pre-wrap",
      }}
    >
      {`epochMs: ${item.epochMs}\nsampleIndex: ${item.sampleIndex}\nA body-Z: ${item.bodyZA ?? "—"}\nB body-Z: ${item.bodyZB ?? "—"}`}
    </div>
  );
}

export function AbClampTimeline({ timeline }: Props) {
  const [mode, setMode] = useState<OverlayMode>("grouped");
  const [selected, setSelected] = useState<ClampOverlayPoint | ClampEpisode | null>(null);

  const chartData = timeline.velocitySeries ?? [];
  const groupedEpisodes = timeline.groupedEpisodes ?? [];
  const individualOverlays = timeline.individualOverlays ?? [];
  const oracleCount = timeline.oracleBottomReversalCount ?? 0;
  const disclaimer = timeline.disclaimer ?? "";

  const scatterPoints = useMemo(() => {
    if (mode === "individual") {
      return individualOverlays
        .filter((p) => Number.isFinite(p.epochMs) && Number.isFinite(p.markerY))
        .map((p) => ({ ...p, x: p.epochMs, y: p.markerY }));
    }
    return groupedEpisodes
      .filter(
        (ep) =>
          ep.representative &&
          Number.isFinite(ep.startEpochMs) &&
          Number.isFinite(ep.endEpochMs) &&
          Number.isFinite(ep.representative.markerY)
      )
      .map((ep) => ({
        ...ep.representative,
        x: Math.round((ep.startEpochMs + ep.endEpochMs) / 2),
        y: ep.representative.markerY,
        episode: ep,
      }));
  }, [mode, individualOverlays, groupedEpisodes]);

  if (chartData.length === 0) {
    return (
      <section style={{ marginTop: 20 }} aria-label="A/B clamp timeline">
        <p style={{ fontSize: 12, color: "#ef9a9a" }}>
          Timeline unavailable: no chartable velocity samples
        </p>
      </section>
    );
  }

  const kinds: ClampOverlayKind[] = [
    "a_final_clamp",
    "b_final_clamp",
    "b_suppressed_a_clamp",
    "oracle_bottom_reversal",
  ];

  return (
    <section style={{ marginTop: 20 }} aria-label="A/B clamp timeline">
      <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>Clamp timeline — body-Z velocity</h4>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "#b0bec5" }}>{disclaimer}</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, color: "#ccc" }}>
          Overlay density:{" "}
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as OverlayMode)}
            style={{
              marginLeft: 6,
              background: "#252a38",
              color: "#e0e0e0",
              border: "1px solid #444",
              borderRadius: 4,
              padding: "4px 8px",
            }}
          >
            <option value="grouped">Show grouped clamp episodes</option>
            <option value="individual">Show individual samples</option>
          </select>
        </label>
        <span style={{ fontSize: 11, color: "#888" }}>Oracle reversals: {oracleCount}</span>
      </div>

      <div style={{ width: "100%", height: 420 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#333" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="epochMs"
              stroke="#888"
              domain={["auto", "auto"]}
              label={{ value: "epochMs", position: "insideBottom", offset: -4 }}
            />
            <YAxis
              stroke="#888"
              label={{ value: "bodyZ velocity (m/s)", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "#555" }}
            />
            <Legend />

            {mode === "grouped" &&
              kinds.flatMap((kind) =>
                episodeAreas(groupedEpisodes, kind)
                  .filter(
                    (ep) =>
                      Number.isFinite(ep.startEpochMs) &&
                      Number.isFinite(ep.endEpochMs) &&
                      ep.startEpochMs !== ep.endEpochMs
                  )
                  .map((ep) => (
                  <ReferenceArea
                    key={`${kind}-${ep.startSampleIndex}-${ep.endSampleIndex}`}
                    x1={ep.startEpochMs}
                    x2={ep.endEpochMs}
                    strokeOpacity={0.15}
                    fill={OVERLAY_COLORS[kind]}
                    fillOpacity={0.12}
                    ifOverflow="extendDomain"
                  />
                ))
              )}

            <Line
              name="A body-Z velocity"
              type="monotone"
              dataKey="bodyZA"
              stroke="#4fc3f7"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />
            <Line
              name="B body-Z velocity"
              type="monotone"
              dataKey="bodyZB"
              stroke="#ffb74d"
              dot={false}
              strokeWidth={1.5}
              connectNulls
            />

            {kinds.map((kind) => (
              <Scatter
                key={kind}
                name={OVERLAY_LABELS[kind]}
                data={scatterDataForKind(scatterPoints, kind)}
                dataKey="y"
                fill={OVERLAY_COLORS[kind]}
                shape={SHAPE_BY_KIND[kind]}
                onClick={(data) => {
                  const d = data as ClampOverlayPoint & { episode?: ClampEpisode };
                  setSelected(d.episode ?? d);
                }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginTop: 10,
          fontSize: 11,
          color: "#aaa",
        }}
        aria-label="Clamp overlay legend"
      >
        {kinds.map((kind) => (
          <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                background: OVERLAY_COLORS[kind],
                display: "inline-block",
                borderRadius: kind === "b_final_clamp" ? 0 : 2,
                transform: kind === "a_final_clamp" ? "rotate(45deg)" : undefined,
              }}
            />
            {OVERLAY_LABELS[kind]}
          </span>
        ))}
      </div>

      {selected && (
        <pre
          style={{
            marginTop: 12,
            padding: 10,
            background: "#252a38",
            border: "1px solid #444",
            borderRadius: 4,
            fontSize: 11,
            color: "#e0e0e0",
            whiteSpace: "pre-wrap",
          }}
        >
          {formatOverlayTooltip(
            "representative" in selected ? selected : selected
          )}
        </pre>
      )}
    </section>
  );
}
