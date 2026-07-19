import { useCallback, useEffect, useState } from "react";
import {
  fetchMotionAccountingReport,
  type MotionAccountingApiResult,
  type SampleDetail,
} from "./api";
import { MotionAccountingChart } from "./MotionAccountingChart";
import { MotionAccountingRegionLanes } from "./MotionAccountingRegionLanes";

const noticeStyle = {
  fontSize: 13,
  color: "#b0bec5",
  margin: "12px 0",
  padding: "8px 12px",
  background: "#252a38",
  borderRadius: 4,
  borderLeft: "3px solid #5c6bc0",
} as const;

const LOSS_LOCUS_LABELS: Record<string, string> = {
  none: "None",
  raw_capture: "Raw capture",
  estimator_A: "Estimator (A)",
  estimator_B: "Estimator (B)",
  bottom_detector: "Bottom detector only",
};

type Props = {
  exerciseId: string;
  baseName: string;
  detail: SampleDetail;
};

function yesNo(v: boolean): string {
  return v ? "yes" : "no";
}

export function MotionAccountingPanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MotionAccountingApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const labelId = detail.meta?.label?.exerciseId ?? null;
  const squatSupported = labelId === "squat";

  useEffect(() => {
    setResult(null);
    setError(null);
    setBusy(false);
    setExpanded(false);
  }, [exerciseId, baseName]);

  const handleRun = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (result?.status === "success") {
      setExpanded(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetchMotionAccountingReport(exerciseId, baseName);
      setResult(res);
      if (res.status === "failure") setError(res.message);
      if (res.status === "success") setExpanded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [exerciseId, baseName, expanded, result]);

  if (!squatSupported) {
    return (
      <section style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 8px" }}>Motion accounting</h3>
        <p style={noticeStyle}>Squat captures only.</p>
      </section>
    );
  }

  const report = result?.status === "success" ? result.report : null;
  const timeline = result?.status === "success" ? result.timeline : null;

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Motion accounting</h3>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        Compare raw IMU, A/B body-Z velocity motion regions, and oracle bottom detections per
        expected motion. Identifies whether missing motions were lost in the estimator or only in
        the bottom detector. Diagnostic only — thresholds not tuned.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleRun()}
        style={{
          padding: "8px 14px",
          background: "#3949ab",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: busy ? "wait" : "pointer",
        }}
      >
        {busy
          ? "Building motion accounting…"
          : expanded
            ? "Hide motion accounting"
            : "Run motion accounting report"}
      </button>

      {error && <p style={{ color: "#ef9a9a", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {expanded && report && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 8,
              margin: "14px 0",
            }}
          >
            {[
              ["Expected", report.summary.expectedMotionCount],
              ["Raw regions", report.detectedRegions.rawAccelGyro.length],
              ["A vel regions", report.detectedRegions.velocityA.length],
              ["B vel regions", report.detectedRegions.velocityB.length],
              ["Oracle bottoms", report.detectedRegions.oracleBottoms.length],
              ["Estimator A loss", report.summary.estimatorALossCount],
              ["Bottom det. only", report.summary.bottomDetectorOnlyLossCount],
            ].map(([label, value]) => (
              <div key={label as string} style={{ background: "#252a38", padding: 10, borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          <p style={noticeStyle}>
            <strong>Diagnosis:</strong> Velocity graph shows ~
            {report.summary.estimatedVelocityCyclesA} clear A cycles vs{" "}
            {report.summary.expectedMotionCount} expected motions.
            {report.summary.estimatorALossCount > 0 && (
              <>
                {" "}
                <strong>{report.summary.estimatorALossCount}</strong> motion(s) lost in the{" "}
                <strong>A estimator</strong> (raw present, no velocity cycle).
              </>
            )}
            {report.summary.bottomDetectorOnlyLossCount > 0 && (
              <>
                {" "}
                <strong>{report.summary.bottomDetectorOnlyLossCount}</strong> motion(s) have A
                velocity but <strong>no bottom detection</strong>.
              </>
            )}
            {report.summary.estimatorALossCount === 0 &&
              report.summary.bottomDetectorOnlyLossCount === 0 &&
              report.summary.estimatorBLossCount > 0 && (
                <>
                  {" "}
                  All expected motions show A velocity cycles; B velocity is weaker on{" "}
                  <strong>{report.summary.estimatorBLossCount}</strong> motion(s).
                </>
              )}
            {report.summary.estimatorALossCount === 0 &&
              report.summary.bottomDetectorOnlyLossCount === 0 &&
              report.summary.estimatorBLossCount === 0 && (
                <> All expected motions visible through oracle bottom on A trace.</>
              )}
          </p>

          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ color: "#888", textAlign: "left" }}>
                <th>Motion</th>
                <th>Raw IMU</th>
                <th>A velocity</th>
                <th>B velocity</th>
                <th>Bottom</th>
                <th>Loss locus</th>
                <th>Failure stage</th>
              </tr>
            </thead>
            <tbody>
              {report.motions.map((m) => (
                <tr key={m.window.id}>
                  <td>{m.window.label}</td>
                  <td>{yesNo(m.visibility.rawAccelGyro)}</td>
                  <td>{yesNo(m.visibility.bodyZVelocityA)}</td>
                  <td>{yesNo(m.visibility.bodyZVelocityB)}</td>
                  <td>{yesNo(m.visibility.oracleBottom)}</td>
                  <td>{LOSS_LOCUS_LABELS[m.lossLocus] ?? m.lossLocus}</td>
                  <td title={m.failureDetail}>{m.failureStage.replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {timeline && (
            <>
              <MotionAccountingRegionLanes timeline={timeline} />
              <MotionAccountingChart timeline={timeline} />
            </>
          )}

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, color: "#aaa" }}>
              Visibility thresholds (not tuned)
            </summary>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginTop: 8 }}>
              <tbody>
                {Object.entries(report.thresholds).map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ fontFamily: "monospace", color: "#888" }}>{k}</td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
