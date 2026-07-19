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
  ReferenceArea,
} from "recharts";
import {
  motionRegionFill,
  type MotionAccountingTimelinePayload,
} from "./motionAccountingTimelineModel";

type Props = {
  timeline: MotionAccountingTimelinePayload;
};

export function MotionAccountingChart({ timeline }: Props) {
  return (
    <div style={{ width: "100%", height: 420 }}>
      <ResponsiveContainer>
        <ComposedChart
          data={timeline.chartSeries}
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
        >
          <CartesianGrid stroke="#333" strokeDasharray="3 3" />
          <XAxis
            dataKey="epochMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#aaa", fontSize: 11 }}
          />
          <YAxis
            yAxisId="vel"
            tick={{ fill: "#aaa", fontSize: 11 }}
            label={{
              value: "body-Z velocity (m/s)",
              angle: -90,
              position: "insideLeft",
              fill: "#888",
            }}
          />
          <YAxis
            yAxisId="raw"
            orientation="right"
            tick={{ fill: "#aaa", fontSize: 11 }}
            label={{
              value: "raw dynamic (g / dps scale)",
              angle: 90,
              position: "insideRight",
              fill: "#888",
            }}
          />
          <Tooltip
            contentStyle={{ background: "#1a1d27", border: "1px solid #444", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine yAxisId="vel" y={0} stroke="#666" strokeDasharray="4 4" />

          {timeline.motionRegions.map((region) => (
            <ReferenceArea
              key={region.id}
              yAxisId="vel"
              x1={region.startEpochMs}
              x2={region.endEpochMs}
              fill={motionRegionFill(region.failureStage)}
              stroke={region.oracleVisible ? "#66bb6a" : "#ef5350"}
              strokeOpacity={0.35}
            />
          ))}

          <Line
            yAxisId="raw"
            type="monotone"
            dataKey="accDynamicG"
            name="|acc|-1g"
            stroke="#ab47bc"
            dot={false}
            strokeWidth={1.5}
            connectNulls={false}
          />
          <Line
            yAxisId="raw"
            type="monotone"
            dataKey="gyroMagDps"
            name="|gyro| dps"
            stroke="#8d6e63"
            dot={false}
            strokeWidth={1}
            connectNulls={false}
          />
          <Line
            yAxisId="vel"
            type="monotone"
            dataKey="bodyZA"
            name="A body-Z"
            stroke="#4fc3f7"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            yAxisId="vel"
            type="monotone"
            dataKey="bodyZB"
            name="B body-Z"
            stroke="#ff9800"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
          <Scatter
            yAxisId="vel"
            name="Oracle bottom"
            data={timeline.oracleMarkers.map((m) => ({ x: m.epochMs, y: m.markerY }))}
            fill="#66bb6a"
            shape="star"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
