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
import type { AbcBottomResetTimelinePayload } from "./abcBottomResetTimelineModel";

type Props = {
  timeline: AbcBottomResetTimelinePayload;
};

export function AbcBottomResetChart({ timeline }: Props) {
  const chartData = timeline.velocitySeries;

  const oracleMarkers = timeline.oracleBottomOverlays.map((o) => ({
    x: o.epochMs,
    y: o.markerY,
  }));

  const resetMarkers = timeline.deliberateResetOverlays.map((o) => ({
    x: o.epochMs,
    y: o.markerY,
    before: o.velocityBeforeResetZ,
    after: o.velocityAfterResetZ,
  }));

  return (
    <div style={{ width: "100%", height: 380 }}>
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
            dataKey="bodyZA"
            name="A generic"
            stroke="#4fc3f7"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="bodyZB1"
            name="B1 oracle clamp-suppression"
            stroke="#ff9800"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="bodyZB2"
            name="B2 generic + deliberate reset"
            stroke="#ce93d8"
            dot={false}
            strokeWidth={2}
            strokeDasharray="6 3"
            connectNulls={false}
          />
          <Scatter name="Oracle bottom" data={oracleMarkers} fill="#66bb6a" shape="star" />
          <Scatter name="B2 deliberate reset" data={resetMarkers} fill="#ef5350" shape="diamond" />
        </ComposedChart>
      </ResponsiveContainer>
      <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>{timeline.disclaimer}</p>
    </div>
  );
}
