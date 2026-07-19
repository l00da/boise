import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import type { SquatReadyGateTimelinePayload } from "./squatReadyGateTimelineModel";
import { SQUAT_READY_GATE_LANE_COLORS } from "./squatReadyGateTimelineModel";

type Props = {
  timeline: SquatReadyGateTimelinePayload;
  selectedSampleIndex: number | null;
  onSelectSample: (sampleIndex: number | null) => void;
};

export function SquatReadyGateChart({ timeline, selectedSampleIndex, onSelectSample }: Props) {
  const data = timeline.chartSeries.map((p) => ({
    epochMs: p.epochMs,
    relativeMs: p.epochMs - timeline.captureEpochStartMs,
    bodyZVelocity: p.bodyZVelocity,
    state: p.state,
    sampleIndex: p.sampleIndex,
  }));

  return (
    <div style={{ width: "100%", height: 240, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>body-Z velocity</div>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          onClick={(state) => {
            const idx = (state?.activePayload?.[0]?.payload as { sampleIndex?: number } | undefined)
              ?.sampleIndex;
            if (typeof idx === "number") onSelectSample(idx);
          }}
        >
          <XAxis
            dataKey="relativeMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#888", fontSize: 11 }}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}s`}
          />
          <YAxis
            tick={{ fill: "#888", fontSize: 11 }}
            width={48}
            label={{
              value: "bodyZ v",
              angle: -90,
              position: "insideLeft",
              fill: "#666",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1d27", border: "1px solid #2a2f3d", fontSize: 12 }}
            labelFormatter={(v) => `t=${Number(v).toFixed(0)} ms`}
            formatter={(value: number | null, _name, item) => {
              const payload = item?.payload as
                | { state?: string; sampleIndex?: number }
                | undefined;
              return [
                `${value ?? "—"} (${payload?.state ?? ""}) #${payload?.sampleIndex ?? ""}`,
                "bodyZ",
              ];
            }}
          />
          <Line
            type="monotone"
            dataKey="bodyZVelocity"
            stroke="#4fc3f7"
            dot={false}
            strokeWidth={1.5}
            isAnimationActive={false}
            activeDot={{ r: 4 }}
          />
          {timeline.readyEpochMs !== null && (
            <ReferenceLine
              x={timeline.readyEpochMs - timeline.captureEpochStartMs}
              stroke={SQUAT_READY_GATE_LANE_COLORS.ready}
              strokeDasharray="4 4"
              label={{ value: "ready", fill: SQUAT_READY_GATE_LANE_COLORS.ready, fontSize: 11 }}
            />
          )}
          {timeline.eccentricStartEpochMs !== null && (
            <ReferenceLine
              x={timeline.eccentricStartEpochMs - timeline.captureEpochStartMs}
              stroke={SQUAT_READY_GATE_LANE_COLORS.eccentric}
              strokeDasharray="3 3"
              label={{
                value: "ecc_start",
                fill: SQUAT_READY_GATE_LANE_COLORS.eccentric,
                fontSize: 11,
              }}
            />
          )}
          {selectedSampleIndex !== null &&
            (() => {
              const pt = timeline.chartSeries.find((p) => p.sampleIndex === selectedSampleIndex);
              if (!pt) return null;
              return (
                <ReferenceLine
                  x={pt.epochMs - timeline.captureEpochStartMs}
                  stroke="#fff59d"
                  strokeWidth={1}
                />
              );
            })()}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
