import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SampleDetail } from "./api";
import { fetchRepCounterScore, type RepCounterScoreApiResult } from "./api";
import { RepCounterScoreLanes } from "./RepCounterScoreLanes";
import { buildScoreTimeline } from "./repCounterScoreTimelineModel";
import {
  getRepCounterScoringConfig,
  type RepCounterScoringConfig,
} from "../../../gold-grey/src/lib/boise/repCounterScoringConfig.ts";
import type { AbsoluteQualityColor } from "../../../gold-grey/src/lib/boise/repCounterScoring.ts";

type Props = {
  exerciseId: string;
  baseName: string;
  detail: SampleDetail;
};

const QUALITY_COLORS: Record<AbsoluteQualityColor, string> = {
  green: "#66bb6a",
  yellow: "#ffd54f",
  red: "#ef5350",
  gray: "#90a4ae",
};

export function RepCounterScorePanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<RepCounterScoreApiResult, { status: "success" }> | null>(
    null
  );
  const [config, setConfig] = useState<RepCounterScoringConfig>(() => getRepCounterScoringConfig());
  const [selectedCounterId, setSelectedCounterId] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    setSelectedCounterId(null);
  }, [exerciseId, baseName]);

  const runScore = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchRepCounterScore(exerciseId, baseName, {
        config,
        selectedCounterId: selectedCounterId ?? undefined,
      });
      if (res.status !== "success") {
        setError(res.message);
        return;
      }
      setResult(res);
      setSelectedCounterId(res.selectedCounterId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [exerciseId, baseName, config, selectedCounterId]);

  const selected = useMemo(() => {
    if (!result) return null;
    return result.report.counters.find((c) => c.counterId === selectedCounterId) ?? null;
  }, [result, selectedCounterId]);

  const timeline = useMemo(() => {
    if (!result || !selected) return null;
    return buildScoreTimeline({
      report: result.report,
      selected,
      predictions: result.selectedPredictions,
      captureEpochStartMs: result.sampleEpochStartMs,
      captureEpochEndMs: result.sampleEpochEndMs,
    });
  }, [result, selected]);

  // Re-score when selection changes to refresh prediction set epochs.
  const selectCounter = async (id: string) => {
    setSelectedCounterId(id);
    setBusy(true);
    try {
      const res = await fetchRepCounterScore(exerciseId, baseName, {
        config,
        selectedCounterId: id,
      });
      if (res.status === "success") setResult(res);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <details data-testid="scorer-diagnostics">
        <summary
          style={{
            cursor: "pointer",
            fontSize: 15,
            fontWeight: 600,
            color: "#90a4ae",
            marginBottom: 8,
          }}
        >
          Scorer diagnostics (Pass 3D demos — collapsed)
        </summary>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        Demo / GT-derived counters for scorer plumbing only — excluded from the primary Generic vs
        Squat table above. Official colors require <code>approvalStatus === approved</code>. Sample:{" "}
        {detail.baseName}.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {(
          [
            ["completionToleranceMs", "rep-completion tolerance"],
            ["eccentricStartToleranceMs", "eccentric-start tolerance"],
            ["turnaroundToleranceMs", "turnaround tolerance"],
            ["concentricStartToleranceMs", "concentric-start tolerance"],
            ["lockoutToleranceMs", "lockout tolerance"],
            ["countErrorWeight", "count-error weight"],
            ["timingErrorWeight", "timing-error weight"],
            ["phaseErrorWeight", "phase-error weight"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} style={{ fontSize: 12, color: "#aaa" }}>
            {label}
            <input
              type="number"
              style={inputStyle}
              value={config[key]}
              onChange={(e) =>
                setConfig((c) =>
                  getRepCounterScoringConfig({ ...c, [key]: Number(e.target.value) })
                )
              }
            />
          </label>
        ))}
      </div>

      <button type="button" style={btnPrimary} disabled={busy} onClick={() => void runScore()}>
        {busy ? "Scoring…" : "Score counters"}
      </button>

      {error && <p style={{ color: "#ef9a9a", fontSize: 13, marginTop: 10 }}>{error}</p>}

      {result && (
        <>
          {result.report.provisionalBanner && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                background: "#3e2723",
                borderLeft: "4px solid #ff9800",
                color: "#ffe0b2",
                fontWeight: 600,
              }}
            >
              {result.report.provisionalBanner}
              <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4 }}>
                Truth is {result.report.truthApprovalStatus} — not an official production score.
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: "#888" }}>
            Mode: {result.report.mode} · algorithm: {result.report.algorithm.name} · active config
            embedded in report
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "#888", textAlign: "left" }}>
                  <th style={th}>counter</th>
                  <th style={th}>abs quality</th>
                  <th style={th}>rank</th>
                  <th style={th}>TP</th>
                  <th style={th}>miss</th>
                  <th style={th}>extra</th>
                  <th style={th}>P</th>
                  <th style={th}>R</th>
                  <th style={th}>F1</th>
                  <th style={th}>count err</th>
                  <th style={th}>MAE ms</th>
                </tr>
              </thead>
              <tbody>
                {result.report.counters.map((c) => (
                  <tr
                    key={c.counterId}
                    onClick={() => void selectCounter(c.counterId)}
                    style={{
                      cursor: "pointer",
                      background:
                        c.counterId === selectedCounterId ? "#252a38" : "transparent",
                    }}
                  >
                    <td style={td}>{c.counterName}</td>
                    <td style={td}>
                      <span style={{ color: QUALITY_COLORS[c.absoluteQuality], fontWeight: 600 }}>
                        {c.absoluteQuality}
                      </span>
                      <div style={{ color: "#888", maxWidth: 220 }}>{c.absoluteQualityText}</div>
                    </td>
                    <td style={td}>{c.relativeRankText}</td>
                    <td style={td}>{c.metrics.truePositives}</td>
                    <td style={td}>{c.metrics.misses}</td>
                    <td style={td}>{c.metrics.extras}</td>
                    <td style={td}>{fmt(c.metrics.precision)}</td>
                    <td style={td}>{fmt(c.metrics.recall)}</td>
                    <td style={td}>{fmt(c.metrics.f1)}</td>
                    <td style={td}>{c.metrics.countError}</td>
                    <td style={td}>{fmt(c.metrics.meanAbsCompletionTimingErrorMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#bbb" }}>
              Selected: {selected.counterName}
              {selected.provisionalBanner ? ` · ${selected.provisionalBanner}` : ""}
              <div style={{ marginTop: 4 }}>
                Phase timing:{" "}
                {selected.metrics.phaseTiming
                  .filter((p) => p.labeledPairCount > 0)
                  .map((p) => `${p.phase} MAE=${p.meanAbsErrorMs?.toFixed(1)}ms`)
                  .join(" · ") || "none labeled"}
              </div>
            </div>
          )}

          {timeline && <RepCounterScoreLanes timeline={timeline} />}
        </>
      )}
      </details>
    </section>
  );
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
}

const btnPrimary: CSSProperties = {
  padding: "8px 14px",
  background: "#3949ab",
  color: "#fff",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const inputStyle: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  background: "#1a1d27",
  color: "#eee",
  border: "1px solid #3a4050",
  borderRadius: 4,
  padding: "6px 8px",
};

const th: CSSProperties = { padding: "4px 8px", borderBottom: "1px solid #2a2f3d" };
const td: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #22252f", verticalAlign: "top" };
