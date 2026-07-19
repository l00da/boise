import { useCallback, useEffect, useState } from "react";
import { fetchCausalSquatBottomCompare, type CausalSquatBottomApiResult } from "./api";
import { CausalSquatBottomChart } from "./CausalSquatBottomChart";
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

function fmtMs(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)} ms`;
}

export function CausalSquatBottomPanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CausalSquatBottomApiResult | null>(null);
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
      const res = await fetchCausalSquatBottomCompare(exerciseId, baseName);
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
        <h3 style={{ margin: "0 0 8px" }}>Causal squat-bottom detector</h3>
        <p style={noticeStyle}>Squat captures only.</p>
      </section>
    );
  }

  const summary = result?.status === "success" ? result.summary : null;
  const timeline = result?.status === "success" ? result.timeline : null;

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Causal squat-bottom detector</h3>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        Minimal causal bottom detector via the shared SquatPhaseEvent seam. Compares against the
        offline oracle — analysis only, no production velocity resets.
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
        {busy ? "Running causal compare…" : "Run causal bottom compare"}
      </button>

      {error && <p style={{ color: "#ef9a9a", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {summary && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
              margin: "14px 0",
            }}
          >
            {[
              ["Oracle bottoms", summary.oracleCount],
              ["Causal bottoms", summary.candidateCount],
              ["Matches", summary.matchCount],
              ["Misses", summary.missCount],
              ["False positives", summary.falsePositiveCount],
              ["Mean |Δt|", fmtMs(summary.meanAbsTimingErrorMs)],
              ["Max |Δt|", fmtMs(summary.maxAbsTimingErrorMs)],
            ].map(([label, value]) => (
              <div key={label as string} style={{ background: "#252a38", padding: 10, borderRadius: 4 }}>
                <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {result?.status === "success" && result.matches.length > 0 && (
            <>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Timing matches</h4>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 16 }}>
                <thead>
                  <tr style={{ color: "#888", textAlign: "left" }}>
                    <th>Oracle (ms)</th>
                    <th>Causal (ms)</th>
                    <th>Δt (causal − oracle)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m) => (
                    <tr key={`${m.oracle.epochMs}-${m.candidate.epochMs}`}>
                      <td>{m.oracle.epochMs}</td>
                      <td>{m.candidate.epochMs}</td>
                      <td>{m.timingErrorMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {result?.status === "success" && result.misses.length > 0 && (
            <p style={{ fontSize: 12, color: "#ef9a9a", marginBottom: 12 }}>
              Misses: {result.misses.map((m) => `${m.epochMs} ms`).join(", ")}
            </p>
          )}

          {result?.status === "success" && result.falsePositives.length > 0 && (
            <p style={{ fontSize: 12, color: "#ffcc80", marginBottom: 12 }}>
              False positives: {result.falsePositives.map((c) => `${c.epochMs} ms`).join(", ")}
            </p>
          )}

          {timeline && <CausalSquatBottomChart timeline={timeline} />}
        </>
      )}
    </section>
  );
}
