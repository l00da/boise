import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SampleDetail } from "./api";
import { fetchGenericVsSquatCompare, type GenericVsSquatCompareApiResult } from "./api";
import type {
  CompareStatusLabel,
  DualCounterTimeline,
  PrimaryCompareRow,
} from "../server/genericVsSquatCompare.ts";
import {
  assertNoPooledMissLabel,
  buildPerCounterExtraLanes,
  buildPerCounterMissLanes,
  buildSelectedCounterMatchLinks,
  defaultSelectedCounterId,
} from "./genericVsSquatCompareTimelineModel";

type Props = {
  exerciseId: string;
  baseName: string;
  detail: SampleDetail;
};

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(3);
}

function DualLanes({
  timeline,
  primaryRows,
  selectedCounterId,
}: {
  timeline: DualCounterTimeline;
  primaryRows: PrimaryCompareRow[];
  selectedCounterId: string | null;
}) {
  const a = timeline.captureEpochStartMs;
  const b = timeline.captureEpochEndMs;
  const span = Math.max(b - a, 1);

  const missLanes = useMemo(
    () => buildPerCounterMissLanes(timeline, primaryRows),
    [timeline, primaryRows]
  );
  const extraLanes = useMemo(
    () => buildPerCounterExtraLanes(timeline, primaryRows),
    [timeline, primaryRows]
  );
  const matchLane = useMemo(
    () => buildSelectedCounterMatchLinks(timeline, primaryRows, selectedCounterId),
    [timeline, primaryRows, selectedCounterId]
  );

  // Guardrail: never present one pooled miss total across counters.
  assertNoPooledMissLabel(missLanes.map((l) => l.label));

  const Lane = ({
    label,
    color,
    marks,
    testId,
  }: {
    label: string;
    color: string;
    marks: { key: string; epochMs: number; title?: string; widthPx?: number }[];
    testId?: string;
  }) => (
    <div style={{ marginBottom: 8 }} data-testid={testId}>
      <div
        style={{ fontSize: 11, color, marginBottom: 3, fontFamily: "ui-monospace, monospace" }}
        data-testid={testId ? `${testId}-label` : undefined}
      >
        {label}
      </div>
      <div style={{ position: "relative", height: 18, background: "#1a1d27", borderRadius: 3 }}>
        {marks.map((m) => {
          const left = ((m.epochMs - a) / span) * 100;
          return (
            <div
              key={m.key}
              title={m.title ?? m.key}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: 2,
                bottom: 2,
                width: m.widthPx ?? 4,
                marginLeft: -2,
                background: color,
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 16 }} data-testid="generic-vs-squat-lanes">
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Synchronized comparison lanes</h4>
      <p style={{ fontSize: 11, color: "#777", margin: "0 0 10px" }}>
        Misses are per counter (unavailable counters are not counted). Match links follow the
        selected row below.
      </p>
      <Lane
        label={`approved ground truth (${timeline.approvedGroundTruth.length})`}
        color="#66bb6a"
        marks={timeline.approvedGroundTruth.map((t) => ({
          key: `gt-${t.repId}`,
          epochMs: t.epochMs,
          title: t.repId,
        }))}
      />
      <Lane
        label={`generic-vbt-live (${timeline.genericLive.length})`}
        color={timeline.genericLive.length ? "#5c6bc0" : "#546e7a"}
        marks={timeline.genericLive.map((p) => ({
          key: p.predId,
          epochMs: p.epochMs,
          title: p.predId,
        }))}
      />
      <Lane
        label={`generic-vbt-replay (${timeline.genericReplay.length})`}
        color="#42a5f5"
        marks={timeline.genericReplay.map((p) => ({
          key: p.predId,
          epochMs: p.epochMs,
          title: p.predId,
        }))}
      />
      <Lane
        label={`squat-rep-cycle-v1 (${timeline.squat.length})`}
        color="#ab47bc"
        marks={timeline.squat.map((p) => ({
          key: p.predId,
          epochMs: p.epochMs,
          title: p.predId,
        }))}
      />
      {missLanes.map((lane) => (
        <Lane
          key={`miss-${lane.counterId}`}
          testId={`miss-lane-${lane.counterId}`}
          label={lane.label}
          color={lane.available ? "#ef5350" : "#546e7a"}
          marks={lane.marks}
        />
      ))}
      {extraLanes.map((lane) => (
        <Lane
          key={`extra-${lane.counterId}`}
          testId={`extra-lane-${lane.counterId}`}
          label={lane.label}
          color={lane.available ? "#ff7043" : "#546e7a"}
          marks={lane.marks}
        />
      ))}
      <Lane
        testId="match-links-lane"
        label={matchLane.label}
        color="#26c6da"
        marks={matchLane.marks}
      />
    </div>
  );
}

function modeStyle(row: PrimaryCompareRow): CSSProperties {
  if (!row.available || row.mode === "unavailable") {
    return { color: "#90a4ae", background: "#263238" };
  }
  if (row.mode === "live") return { color: "#ce93d8" };
  return { color: "#90caf9" };
}

function StatusChips({ labels }: { labels: CompareStatusLabel[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
      {labels.map((l) => (
        <span
          key={l}
          style={{
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 3,
            border: "1px solid #445",
            color: l.includes("UNAVAILABLE") || l.includes("UNPROVEN") ? "#ffcc80" : "#b0bec5",
          }}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

export function GenericVsSquatComparePanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<
    GenericVsSquatCompareApiResult,
    { status: "success" }
  > | null>(null);
  const [selectedCounterId, setSelectedCounterId] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
    setSelectedCounterId(null);
  }, [exerciseId, baseName]);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchGenericVsSquatCompare(exerciseId, baseName, {});
      if (res.status !== "success") {
        setError(
          "error" in res && res.error
            ? `${res.error}: ${res.message}`
            : res.message
        );
        return;
      }
      setResult(res);
      setSelectedCounterId(defaultSelectedCounterId(res.primaryRows));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [exerciseId, baseName]);

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Generic VBT vs squat lifecycle (real counters)</h3>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        Primary comparison on <code>{detail.baseName}</code> against the same Pass 3A ground truth.
        Live = persisted <code>appVbtCoordinator</code> events. Replay = sample-clock adapter of
        production <code>transition()</code> (<strong>PARITY_UNPROVEN</strong>). Squat ={" "}
        <code>runSquatRepCycle</code> <code>rep_complete</code> only (
        <code>squat-rep-cycle-v1</code>).
      </p>

      <button type="button" disabled={busy} onClick={() => void run()}>
        {busy ? "Comparing…" : "Run primary comparison"}
      </button>

      {error ? (
        <p style={{ color: "#ef5350", marginTop: 10 }} data-testid="generic-vs-squat-error">
          {error}
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 14 }} data-testid="generic-vs-squat-result">
          <p
            style={{
              fontSize: 13,
              color: result.summary.hasApprovedTruth ? "#cfd8dc" : "#ffcc80",
              margin: "0 0 12px",
              padding: "10px 12px",
              background: "#1a1d27",
              borderRadius: 6,
              border: "1px solid #333",
            }}
            data-testid="generic-vs-squat-summary"
          >
            {result.summary.text}
          </p>

          <p style={{ fontSize: 12, color: "#aaa", margin: "0 0 10px" }}>
            Truth: {result.truthApprovalStatus ?? "none"}
            {result.truthSource ? ` · source ${result.truthSource}` : ""} · demoExcluded=
            {String(result.demoExcluded)}
          </p>

          <div style={{ overflowX: "auto" }}>
            <table
              data-testid="generic-vs-squat-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
                  {[
                    "Counter",
                    "Mode",
                    "Predicted",
                    "TP",
                    "Miss",
                    "Extra",
                    "Precision",
                    "Recall",
                    "F1",
                  ].map((h) => (
                    <th key={h} style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.primaryRows.map((row) => (
                  <tr
                    key={row.counterId}
                    data-testid={`compare-row-${row.counterId}`}
                    onClick={() => {
                      if (row.available) setSelectedCounterId(row.counterId);
                    }}
                    style={{
                      borderBottom: "1px solid #2a2f3d",
                      cursor: row.available ? "pointer" : "default",
                      opacity: row.available ? 1 : 0.75,
                      background:
                        selectedCounterId === row.counterId
                          ? "#252a38"
                          : !row.available
                            ? "#1c2228"
                            : "transparent",
                    }}
                  >
                    <td style={{ padding: "8px" }}>
                      {row.counterName}
                      <div style={{ fontSize: 11, color: "#777" }}>{row.counterId}</div>
                      <StatusChips labels={row.statusLabels} />
                      {!row.available && row.unavailableReason ? (
                        <div style={{ fontSize: 11, color: "#90a4ae", marginTop: 4 }}>
                          {row.unavailableReason}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "8px", ...modeStyle(row) }}>{row.mode}</td>
                    <td style={{ padding: "8px" }}>{row.available ? row.predictedReps : "—"}</td>
                    <td style={{ padding: "8px" }}>{row.available ? row.truePositives : "—"}</td>
                    <td style={{ padding: "8px" }}>{row.available ? row.misses : "—"}</td>
                    <td style={{ padding: "8px" }}>{row.available ? row.extras : "—"}</td>
                    <td style={{ padding: "8px" }}>{row.available ? fmt(row.precision) : "—"}</td>
                    <td style={{ padding: "8px" }}>{row.available ? fmt(row.recall) : "—"}</td>
                    <td style={{ padding: "8px" }}>{row.available ? fmt(row.f1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DualLanes
            timeline={result.timeline}
            primaryRows={result.primaryRows}
            selectedCounterId={selectedCounterId}
          />
        </div>
      ) : null}
    </section>
  );
}
