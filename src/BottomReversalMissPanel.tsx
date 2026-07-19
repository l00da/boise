import { useCallback, useEffect, useState } from "react";
import {
  fetchBottomReversalMissAnalysis,
  type BottomReversalMissApiResult,
  type BottomReversalMissReport,
  type SampleDetail,
} from "./api";
import { BottomReversalMissChart } from "./BottomReversalMissChart";
import {
  loadExpectedRegions,
  nearestVelocityPoint,
  REJECTION_REASON_LABELS,
  saveExpectedRegions,
  type ExpectedReversalRegion,
} from "./bottomReversalMissModel";

const panelNotice = {
  fontSize: 13,
  color: "#b0bec5",
  margin: "12px 0",
  padding: "8px 12px",
  background: "#252a38",
  borderRadius: 4,
  borderLeft: "3px solid #5c6bc0",
} as const;

type Props = {
  exerciseId: string;
  baseName: string;
  detail: SampleDetail;
};

function ThresholdTable({ thresholds }: { thresholds: BottomReversalMissReport["thresholds"] }) {
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr style={{ color: "#888", textAlign: "left" }}>
          <th>Threshold</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(thresholds).map(([key, value]) => (
          <tr key={key}>
            <td style={{ padding: "4px 8px 4px 0", fontFamily: "monospace" }}>{key}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BottomReversalMissPanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BottomReversalMissApiResult | null>(null);
  const [expectedRegions, setExpectedRegions] = useState<ExpectedReversalRegion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const labelId = detail.meta?.label?.exerciseId ?? null;
  const squatSupported = labelId === "squat";

  useEffect(() => {
    setExpectedRegions(loadExpectedRegions(exerciseId, baseName));
    setResult(null);
    setError(null);
  }, [exerciseId, baseName]);

  const runAnalysis = useCallback(
    async (regions: ExpectedReversalRegion[]) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetchBottomReversalMissAnalysis(exerciseId, baseName, regions);
        setResult(res);
        if (res.status === "failure") setError(res.message);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [exerciseId, baseName]
  );

  useEffect(() => {
    if (!squatSupported) return;
    void runAnalysis(expectedRegions);
  }, [squatSupported, expectedRegions, runAnalysis]);

  function addExpectedRegion(epochMs: number) {
    if (!result || result.status !== "success") return;
    const nearest = nearestVelocityPoint(result.report.velocitySeries, epochMs);
    const next: ExpectedReversalRegion = {
      id: `exp-${Date.now()}`,
      centerEpochMs: nearest.epochMs,
      centerSampleIndex: nearest.sampleIndex,
      label: `Expected ${expectedRegions.length + 1}`,
    };
    const updated = [...expectedRegions, next];
    setExpectedRegions(updated);
    saveExpectedRegions(exerciseId, baseName, updated);
  }

  function removeExpectedRegion(id: string) {
    const updated = expectedRegions.filter((r) => r.id !== id);
    setExpectedRegions(updated);
    saveExpectedRegions(exerciseId, baseName, updated);
  }

  function clearExpectedRegions() {
    setExpectedRegions([]);
    saveExpectedRegions(exerciseId, baseName, []);
  }

  if (!squatSupported) {
    return (
      <section style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 8px" }}>Bottom-reversal miss analysis</h3>
        <p style={panelNotice}>Squat captures only (label: {labelId ?? "unknown"}).</p>
      </section>
    );
  }

  const report = result?.status === "success" ? result.report : null;

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Bottom-reversal miss analysis</h3>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        Offline oracle pass — compares detections vs your manually marked expected reversals.
        Thresholds are fixed and visible; no silent tuning.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAnalysis(expectedRegions)}
          style={{
            padding: "8px 14px",
            background: "#3949ab",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Analyzing…" : "Run miss analysis"}
        </button>
        <button
          type="button"
          disabled={expectedRegions.length === 0}
          onClick={clearExpectedRegions}
          style={{
            padding: "8px 14px",
            background: "#37474f",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Clear expected regions ({expectedRegions.length})
        </button>
      </div>

      {error && <p style={{ color: "#ef9a9a", fontSize: 13 }}>{error}</p>}

      {report && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 16 }}>
            {[
              ["Oracle detections", report.summary.oracleDetectionCount],
              ["Rejected candidates", report.summary.rejectedCandidateCount],
              ["Expected regions", report.summary.expectedRegionCount],
              ["Detected", report.summary.detectedCount],
              ["Missed", report.summary.missedCount],
              ["False positives", report.summary.falsePositiveCount],
              ["Precision", `${(report.summary.precision * 100).toFixed(0)}%`],
              ["Recall", `${(report.summary.recall * 100).toFixed(0)}%`],
            ].map(([label, value]) => (
              <div key={label as string} style={{ background: "#252a38", padding: 10, borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          <BottomReversalMissChart
            report={report}
            expectedRegions={expectedRegions}
            onChartClick={addExpectedRegion}
          />

          <h4 style={{ margin: "20px 0 8px", fontSize: 14 }}>Centralized thresholds</h4>
          <ThresholdTable thresholds={report.thresholds} />
          <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
            Descent/ascent: {report.thresholds.oracleMinDescentSamples} samples (×
            {report.thresholds.oracleDescentWindowFactor} window) /{" "}
            {report.thresholds.oracleMinAscentSamples} samples (×
            {report.thresholds.oracleAscentWindowFactor} window) at ±
            {report.thresholds.oracleVelocityEpsilonMps} m/s · ready samples:{" "}
            {report.readySampleCount}
          </p>

          <h4 style={{ margin: "20px 0 8px", fontSize: 14 }}>Oracle detections</h4>
          {report.oracleDetections.length === 0 ? (
            <p style={{ fontSize: 13, color: "#888" }}>None</p>
          ) : (
            <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
              {report.oracleDetections.map((d) => (
                <li key={`${d.sampleIndex}-${d.epochMs}`}>
                  sample {d.sampleIndex} @ {d.epochMs} ms
                </li>
              ))}
            </ul>
          )}

          <h4 style={{ margin: "20px 0 8px", fontSize: 14 }}>Expected regions</h4>
          {expectedRegions.length === 0 ? (
            <p style={panelNotice}>Click the velocity chart to mark your 5 expected bottom-reversal regions.</p>
          ) : (
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#888", textAlign: "left" }}>
                  <th>Label</th>
                  <th>epochMs</th>
                  <th>Status</th>
                  <th>Miss cause</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.expectedOutcomes.map((outcome) => (
                  <tr key={outcome.region.id}>
                    <td>{outcome.region.label ?? outcome.region.id}</td>
                    <td>{outcome.region.centerEpochMs}</td>
                    <td style={{ color: outcome.status === "detected" ? "#a5d6a7" : "#ef9a9a" }}>
                      {outcome.status}
                    </td>
                    <td>
                      {outcome.missCause
                        ? REJECTION_REASON_LABELS[outcome.missCause]
                        : outcome.matchedOracle
                          ? `matched @ ${outcome.matchedOracle.epochMs} ms`
                          : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => removeExpectedRegion(outcome.region.id)}
                        style={{ fontSize: 11, cursor: "pointer" }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {report.extraDetections.length > 0 && (
            <>
              <h4 style={{ margin: "20px 0 8px", fontSize: 14 }}>Extra detections (no expected region)</h4>
              <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
                {report.extraDetections.map((d) => (
                  <li key={`extra-${d.sampleIndex}`}>
                    sample {d.sampleIndex} @ {d.epochMs} ms
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 style={{ margin: "20px 0 8px", fontSize: 14 }}>
            Rejected candidates ({report.rejectedCandidates.length})
          </h4>
          <div style={{ maxHeight: 220, overflow: "auto", fontSize: 12, background: "#1e2230", borderRadius: 4, padding: 8 }}>
            {report.rejectedCandidates.slice(0, 100).map((r) => (
              <div key={`rej-${r.sampleIndex}-${r.epochMs}`} style={{ marginBottom: 6 }}>
                <strong>
                  sample {r.sampleIndex} @ {r.epochMs} ms
                </strong>
                {r.rejectionReason && (
                  <span style={{ color: "#ffab91" }}>
                    {" "}
                    — {REJECTION_REASON_LABELS[r.rejectionReason]}
                  </span>
                )}
                <div style={{ color: "#888" }}>
                  descent {r.descentSamplesBelowEpsilon}/{r.descentSampleCount}, ascent{" "}
                  {r.ascentSamplesAboveEpsilon}/{r.ascentSampleCount} · {r.detail}
                </div>
              </div>
            ))}
            {report.rejectedCandidates.length > 100 && (
              <p style={{ color: "#888" }}>…and {report.rejectedCandidates.length - 100} more</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
