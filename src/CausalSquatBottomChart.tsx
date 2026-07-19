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
  ReferenceLine,
} from "recharts";
import type { CausalSquatBottomTimelinePayload } from "./causalSquatBottomTimelineModel";

type Props = {
  timeline: CausalSquatBottomTimelinePayload;
};

export function CausalSquatBottomChart({ timeline }: Props) {
  const chartData = timeline.velocitySeries;

  const oracleMarkers = timeline.oracleOverlays.map((o) => ({
    x: o.epochMs,
    y: o.markerY,
  }));

  const causalMarkers = timeline.causalOverlays.map((o) => ({
    x: o.epochMs,
    y: o.markerY,
  }));

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="#333" strokeDasharray="3 3" />
          <XAxis
            dataKey="epochMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#aaa", fontSize: 11 }}
          />
          <YAxis
            tick={{ fill: "#aaa", fontSize: 11 }}
            label={{
              value: "body-Z velocity (m/s)",
              angle: -90,
              position: "insideLeft",
              fill: "#888",
            }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1d27", border: "1px solid #444", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#666" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="bodyZVelocity"
            name="body-Z velocity"
            stroke="#4fc3f7"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
          <Scatter
            name="Oracle bottom (offline)"
            data={oracleMarkers}
            fill="#66bb6a"
            shape="star"
          />
          <Scatter
            name="Causal bottom"
            data={causalMarkers}
            fill="#ef5350"
            shape="diamond"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
