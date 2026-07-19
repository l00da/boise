import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { fetchSquatReadyGate, type SquatReadyGateApiResult } from "./api";
import type { SampleDetail } from "./api";
import { SquatReadyGateChart } from "./SquatReadyGateChart";
import { SquatReadyGateLanes } from "./SquatReadyGateLanes";

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

export function SquatReadyGatePanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SquatReadyGateApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number | null>(null);
  const [selectedRepId, setSelectedRepId] = useState<number | null>(null);

  const labelId = detail.meta?.label?.exerciseId ?? null;
  const squatSupported = labelId === "squat";

  useEffect(() => {
    setResult(null);
    setError(null);
    setBusy(false);
    setExpanded(false);
    setSelectedSampleIndex(null);
    setSelectedRepId(null);
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
    setSelectedSampleIndex(null);
    setSelectedRepId(null);
    try {
      const res = await fetchSquatReadyGate(exerciseId, baseName);
      setResult(res);
      if (res.status === "failure") setError(res.message);
      if (res.status === "unavailable") setError(res.message);
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
        <h3 style={{ margin: "0 0 8px" }}>Squat SM (M1–M3) context-aware rep</h3>
        <p style={noticeStyle}>Squat captures only.</p>
      </section>
    );
  }

  const timeline = result?.status === "success" ? result.timeline : null;
  const readyThresholds = result?.status === "success" ? result.readyThresholds : null;
  const eccentricConfig = result?.status === "success" ? result.eccentricConfig : null;
  const cycleConfig = result?.status === "success" ? result.cycleConfig : null;

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Squat SM (M1–M3) context-aware rep</h3>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        Ready gate → eccentric_start → turnaround (causal bottom) → concentric → lockout →
        rep_complete → between_reps. Counts only after full phase chain. Times from epochMs.
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
          ? "Running squat SM…"
          : expanded
            ? "Hide squat SM"
            : "Run squat SM (M1–M3)"}
      </button>

      {error && <p style={{ color: "#ef9a9a", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {expanded && result?.status === "success" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
              margin: "14px 0",
            }}
          >
            <Stat label="Reached ready" value={String(result.reachedReady)} />
            <Stat label="Reached eccentric" value={String(result.reachedEccentric)} />
            <Stat label="rep_complete" value={String(result.repCompleteEvents?.length ?? 0)} />
            <Stat label="Rejected candidates" value={String(result.rejectedCandidateCount)} />
            <Stat label="Counted reps" value={String(result.countedReps)} />
            {readyThresholds && (
              <Stat label="Ready hold" value={`${readyThresholds.stabilityHoldMs} ms`} />
            )}
            {eccentricConfig && (
              <Stat
                label="Ecc confirm / dwell"
                value={`${eccentricConfig.descentConfirmSamples} / ${eccentricConfig.minimumReadyDurationMs} ms`}
              />
            )}
            {cycleConfig && (
              <Stat
                label="Ascent confirm / lockout hold"
                value={`${cycleConfig.ascentConfirmSamples} / ${cycleConfig.lockoutHoldMs} ms`}
              />
            )}
          </div>

          {timeline && (
            <>
              <SquatReadyGateLanes
                timeline={timeline}
                selectedSampleIndex={selectedSampleIndex}
                selectedRepId={selectedRepId}
                onSelectSample={setSelectedSampleIndex}
                onSelectRep={setSelectedRepId}
              />
              <SquatReadyGateChart
                timeline={timeline}
                selectedSampleIndex={selectedSampleIndex}
                onSelectSample={setSelectedSampleIndex}
              />
            </>
          )}

          {(result.repCompleteEvents?.length ?? 0) > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>rep_complete events</h4>
              <div style={{ overflowX: "auto", fontSize: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: "#888", textAlign: "left" }}>
                      <th style={th}>rep</th>
                      <th style={th}>sample</th>
                      <th style={th}>rel ms</th>
                      <th style={th}>duration</th>
                      <th style={th}>reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.repCompleteEvents!.map((t) => (
                      <tr
                        key={`${t.repId}-${t.epochMs}`}
                        onClick={() => {
                          setSelectedSampleIndex(t.sampleIndex);
                          setSelectedRepId(t.repId);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <td style={td}>{t.repId}</td>
                        <td style={td}>{t.sampleIndex}</td>
                        <td style={td}>{t.relativeMs.toFixed(0)}</td>
                        <td style={td}>{t.durationMs.toFixed(0)}</td>
                        <td style={td}>{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const th: CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #2a2f3d" };
const td: CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #22252f", color: "#ddd" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#252a38", borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 15, color: "#e0e0e0", marginTop: 2 }}>{value}</div>
    </div>
  );
}
