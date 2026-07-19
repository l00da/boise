import { useCallback, useEffect, useState } from "react";
import {
  runAbCompare,
  runAction,
  type AbCompareApiResult,
  type AbClampTimelineApiResult,
  type SampleDetail,
} from "./api";
import { buildAbCompareSummaryRows, preservationTone } from "./abCompareUiModel";
import { AbClampTimeline } from "./AbClampTimeline";
import { prepareTimelineForUi } from "./abClampTimelineSanitize";
import { TimelineErrorBoundary } from "./TimelineErrorBoundary";

const noticeStyle = {
  fontSize: 13,
  color: "#b0bec5",
  margin: "12px 0",
  padding: "8px 12px",
  background: "#252a38",
  borderRadius: 4,
  borderLeft: "3px solid #5c6bc0",
} as const;

const badgeOk = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 4,
  fontWeight: 600,
  fontSize: 13,
  background: "#1b5e20",
  color: "#a5d6a7",
} as const;

const badgeBad = {
  ...badgeOk,
  background: "#b71c1c",
  color: "#ef9a9a",
} as const;

type Props = {
  exerciseId: string;
  baseName: string;
  detail: SampleDetail;
};

export function AbComparePanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AbCompareApiResult | null>(null);
  const [timelineResult, setTimelineResult] = useState<AbClampTimelineApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelId = detail.meta?.label?.exerciseId ?? null;
  const squatSupported = labelId === "squat";

  useEffect(() => {
    setResult(null);
    setTimelineResult(null);
    setError(null);
    setBusy(false);
  }, [exerciseId, baseName]);

  const handleRun = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    setTimelineResult(null);
    try {
      const res = await runAbCompare(exerciseId, baseName);
      setResult(res);
      if (res.status === "failure") {
        setError(res.message);
        setTimelineResult(null);
      } else if (res.status === "success") {
        const prepared = prepareTimelineForUi(res.timeline);
        if (prepared.ok) {
          setTimelineResult({ status: "success", timeline: prepared.timeline });
        } else {
          setTimelineResult({ status: "failure", message: prepared.reason });
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [exerciseId, baseName]);

  async function revealArtifact(which: "A" | "B" | "summary") {
    await runAction("copy_path", {
      target: "ab_artifact",
      exerciseId,
      baseName,
      which,
    });
  }

  const unavailableMessage =
    result?.status === "unavailable"
      ? result.message
      : !squatSupported
        ? `Oracle B currently supports squat only. Sample label: ${labelId ?? "unknown"}`
        : null;

  const success = result?.status === "success" ? result : null;
  const summaryRows = success ? buildAbCompareSummaryRows(success.summary) : [];

  return (
    <section
      style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: "1px solid #2a2f3d",
      }}
      aria-label="A/B Compare"
    >
      <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>A/B Compare</h3>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#888" }}>
        <strong>A — Generic estimator</strong> (null context) vs{" "}
        <strong>B — Oracle squat estimator</strong>
      </p>
      <p style={noticeStyle}>
        This view compares estimator decisions only. Accuracy requires Flex reference data.
      </p>

      {unavailableMessage && !busy && !success && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            background: "#2a2438",
            border: "1px solid #5e4b8a",
            borderRadius: 4,
            color: "#d1c4e9",
            fontSize: 13,
          }}
        >
          <strong>Unsupported for this sample</strong>
          <p style={{ margin: "8px 0 0" }}>{unavailableMessage}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={busy || !detail.sample || !squatSupported}
        style={{
          padding: "8px 16px",
          background: squatSupported ? "#00695c" : "#455a64",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          cursor: busy || !squatSupported ? "not-allowed" : "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Running A/B Compare…" : "Run A/B Compare"}
      </button>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#3e2723",
            border: "1px solid #c62828",
            borderRadius: 4,
            color: "#ef9a9a",
            fontSize: 13,
          }}
        >
          <strong>Compare failed</strong>
          <p style={{ margin: "8px 0 0" }}>{error}</p>
        </div>
      )}

      {success && (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <span
              style={
                preservationTone(success.summary.aPreservationVerified) === "ok"
                  ? badgeOk
                  : badgeBad
              }
            >
              {success.summary.aPreservationVerified
                ? "Generic A preserved"
                : "Generic A preservation failed"}
            </span>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.label}>
                  <td style={{ padding: "4px 8px 4px 0", color: "#888" }}>{row.label}</td>
                  <td
                    style={{
                      padding: "4px 0",
                      color: row.tone === "bad" ? "#ef9a9a" : "#e0e0e0",
                      fontWeight: row.tone ? 600 : 400,
                    }}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 16, fontSize: 12, color: "#aaa" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#ccc" }}>Artifacts</p>
            <ul style={{ margin: 0, paddingLeft: 18, listStyle: "none" }}>
              <li style={{ marginBottom: 6 }}>
                A JSONL: <code>{success.tracePathA}</code>{" "}
                <button
                  type="button"
                  onClick={() => void revealArtifact("A")}
                  style={linkBtnStyle}
                >
                  Copy path
                </button>
              </li>
              <li style={{ marginBottom: 6 }}>
                B JSONL: <code>{success.tracePathB}</code>{" "}
                <button
                  type="button"
                  onClick={() => void revealArtifact("B")}
                  style={linkBtnStyle}
                >
                  Copy path
                </button>
              </li>
              <li>
                ab-summary.json: <code>{success.summaryPath}</code>{" "}
                <button
                  type="button"
                  onClick={() => void revealArtifact("summary")}
                  style={linkBtnStyle}
                >
                  Copy path
                </button>
              </li>
            </ul>
          </div>

          {timelineResult?.status === "success" && (
            <TimelineErrorBoundary
              fallback={
                <p style={{ marginTop: 16, fontSize: 12, color: "#ef9a9a" }}>
                  Timeline unavailable: chart render failed
                </p>
              }
            >
              <AbClampTimeline timeline={timelineResult.timeline} />
            </TimelineErrorBoundary>
          )}

          {(timelineResult?.status === "failure" || timelineResult?.status === "not_found") && (
            <p style={{ marginTop: 16, fontSize: 12, color: "#ef9a9a" }}>
              Timeline unavailable: {timelineResult.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const linkBtnStyle = {
  marginLeft: 8,
  padding: "2px 8px",
  fontSize: 11,
  background: "transparent",
  border: "1px solid #5c6bc0",
  borderRadius: 3,
  color: "#9fa8da",
  cursor: "pointer",
} as const;
