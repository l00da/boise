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
import type { BottomReversalMissReport } from "./api";
import type { ExpectedReversalRegion } from "./bottomReversalMissModel";

type Props = {
  report: BottomReversalMissReport;
  expectedRegions: ExpectedReversalRegion[];
  onChartClick?: (epochMs: number) => void;
};

type ChartPoint = {
  epochMs: number;
  bodyZ: number | null;
  sampleIndex: number;
};

export function BottomReversalMissChart({ report, expectedRegions, onChartClick }: Props) {
  const chartData: ChartPoint[] = report.velocitySeries.map((row) => ({
    epochMs: row.epochMs,
    bodyZ: row.bodyZVelocity,
    sampleIndex: row.sampleIndex,
  }));

  const detections = report.oracleDetections.map((d) => ({
    x: d.epochMs,
    y: chartData.find((p) => p.sampleIndex === d.sampleIndex)?.bodyZ ?? 0,
    label: `Oracle @ ${d.epochMs}`,
  }));

  const expected = expectedRegions.map((r, i) => ({
    x: r.centerEpochMs,
    y: chartData.find((p) => p.sampleIndex === r.centerSampleIndex)?.bodyZ ?? 0,
    label: r.label ?? `Expected ${i + 1}`,
  }));

  const rejectedNearCrossing = report.rejectedCandidates
    .filter((r) => !r.accepted && r.rejectionReason !== "stationary_zvu_exclusion")
    .slice(0, 80)
    .map((r) => ({
      x: r.epochMs,
      y: r.rawVelocity,
      reason: r.rejectionReason,
    }));

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
          onClick={(state) => {
            if (!onChartClick || !state?.activeLabel) return;
            const epochMs = Number(state.activeLabel);
            if (Number.isFinite(epochMs)) onChartClick(epochMs);
          }}
        >
          <CartesianGrid stroke="#333" strokeDasharray="3 3" />
          <XAxis
            dataKey="epochMs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#aaa", fontSize: 11 }}
            label={{ value: "epochMs", position: "insideBottom", fill: "#888", offset: -2 }}
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
            dataKey="bodyZ"
            name="Signed body-Z velocity"
            stroke="#4fc3f7"
            dot={false}
            strokeWidth={2}
            connectNulls={false}
          />
          <Scatter name="Oracle detections" data={detections} fill="#66bb6a" shape="star" />
          <Scatter name="Expected regions" data={expected} fill="#ffca28" shape="triangle" />
          <Scatter
            name="Rejected candidates"
            data={rejectedNearCrossing}
            fill="#ef5350"
            shape="cross"
          />
        </ComposedChart>
      </ResponsiveContainer>
      {onChartClick && (
        <p style={{ fontSize: 12, color: "#888", margin: "6px 0 0" }}>
          Click the chart to mark an expected bottom-reversal region.
        </p>
      )}
    </div>
  );
}
