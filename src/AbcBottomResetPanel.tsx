import { useCallback, useEffect, useState } from "react";
import { fetchAbcBottomResetCompare, type AbcBottomResetApiResult } from "./api";
import { AbcBottomResetChart } from "./AbcBottomResetChart";
import type { SampleDetail } from "./api";

const noticeStyle = {
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

function fmt(v: number | null): string {
  if (v === null) return "—";
  return v.toExponential(3);
}

export function AbcBottomResetPanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AbcBottomResetApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelId = detail.meta?.label?.exerciseId ?? null;
  const squatSupported = labelId === "squat";

  useEffect(() => {
    setResult(null);
    setError(null);
    setBusy(false);
  }, [exerciseId, baseName]);

  const handleRun = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchAbcBottomResetCompare(exerciseId, baseName);
      setResult(res);
      if (res.status === "failure") setError(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [exerciseId, baseName]);

  if (!squatSupported) {
    return (
      <section style={{ marginTop: 24 }}>
        <h3 style={{ margin: "0 0 8px" }}>Oracle bottom-reset counterfactual (A / B1 / B2)</h3>
        <p style={noticeStyle}>Squat captures only.</p>
      </section>
    );
  }

  const summary = result?.status === "success" ? result.summary : null;
  const timeline = result?.status === "success" ? result.timeline : null;

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Oracle bottom-reset counterfactual (A / B1 / B2)</h3>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        A = generic · B1 = oracle clamp-suppression · B2 = generic + one deliberate velocity reset
        at each offline-oracle bottom. B2 is not live production behavior.
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
        {busy ? "Running ABC compare…" : "Run ABC bottom-reset compare"}
      </button>

      {error && <p style={{ color: "#ef9a9a", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {summary && (
        <>
          <p style={{ ...noticeStyle, marginTop: 14 }}>{summary.disclaimer}</p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 8,
              margin: "14px 0",
            }}
          >
            {[
              ["Oracle bottoms", summary.oracleBottomCount],
              ["B2 resets", summary.deliberateResetCount],
              ["Confirmed motions", summary.confirmedMotionCount],
              ["One reset / motion", summary.oneResetPerConfirmedMotion ? "yes" : "no"],
              ["Final-rest drift A", fmt(summary.finalRestDriftA)],
              ["Final-rest drift B1", fmt(summary.finalRestDriftB1)],
              ["Final-rest drift B2", fmt(summary.finalRestDriftB2)],
            ].map(([label, value]) => (
              <div key={label as string} style={{ background: "#252a38", padding: 10, borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ color: "#888", textAlign: "left" }}>
                <th>Pair</th>
                <th>Mean |Δv|</th>
                <th>Max |Δv|</th>
                <th>Final bodyZ</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["A vs B1", summary.diffA_B1],
                  ["A vs B2", summary.diffA_B2],
                  ["B1 vs B2", summary.diffB1_B2],
                ] as const
              ).map(([label, diff]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{fmt(diff.meanAbsBodyZVelocityDiff)}</td>
                  <td>{fmt(diff.maxAbsBodyZVelocityDiff)}</td>
                  <td>
                    {fmt(diff.finalBodyZVelocityA)} / {fmt(diff.finalBodyZVelocityB)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {result?.status === "success" && result.deliberateResetEvents.length > 0 && (
            <>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Deliberate reset events</h4>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 16 }}>
                <thead>
                  <tr style={{ color: "#888", textAlign: "left" }}>
                    <th>Oracle bottom (ms)</th>
                    <th>Reset sample</th>
                    <th>v before</th>
                    <th>v after</th>
                  </tr>
                </thead>
                <tbody>
                  {result.deliberateResetEvents.map((e) => (
                    <tr key={`${e.sampleIndex}-${e.oracleBottomEpochMs}`}>
                      <td>{e.oracleBottomEpochMs}</td>
                      <td>
                        {e.sampleIndex} @ {e.epochMs}
                      </td>
                      <td>{fmt(e.velocityBeforeResetZ)}</td>
                      <td>{fmt(e.velocityAfterResetZ)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {timeline && <AbcBottomResetChart timeline={timeline} />}
        </>
      )}
    </section>
  );
}
