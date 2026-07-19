import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import type { RepGroundTruthTimelinePayload } from "./repGroundTruthTimelineModel";
import { GT_PROVENANCE_COLORS } from "./repGroundTruthTimelineModel";

type Props = {
  timeline: RepGroundTruthTimelinePayload;
  selectedEventId: string | null;
  onSelectRelativeMs?: (relativeMs: number) => void;
};

export function RepGroundTruthChart({ timeline, selectedEventId, onSelectRelativeMs }: Props) {
  const data = timeline.bodyZSeries.map((p) => ({
    relativeMs: p.relativeMs,
    bodyZVelocity: p.bodyZVelocity,
    sampleIndex: p.sampleIndex,
  }));

  const selected = timeline.markers.find((m) => m.eventId === selectedEventId);

  return (
    <div style={{ width: "100%", height: 220, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>body-Z velocity</div>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          onClick={(state) => {
            const x = state?.activeLabel;
            if (typeof x === "number" && onSelectRelativeMs) onSelectRelativeMs(x);
          }}
        >
          <XAxis
            dataKey="relativeMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#888", fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}s`}
          />
          <YAxis tick={{ fill: "#888", fontSize: 11 }} width={48} />
          <Tooltip
            contentStyle={{ background: "#1a1d27", border: "1px solid #2a2f3d", fontSize: 12 }}
            labelFormatter={(v) => `t=${Number(v).toFixed(0)} ms`}
          />
          <Line
            type="monotone"
            dataKey="bodyZVelocity"
            stroke="#4fc3f7"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          {timeline.markers.map((m) => (
            <ReferenceLine
              key={m.eventId}
              x={m.relativeMs}
              stroke={GT_PROVENANCE_COLORS[m.provenance]}
              strokeDasharray={m.eventId === selectedEventId ? undefined : "3 3"}
              strokeWidth={m.eventId === selectedEventId ? 2 : 1}
            />
          ))}
          {selected && (
            <ReferenceLine x={selected.relativeMs} stroke="#fff59d" strokeWidth={1} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
