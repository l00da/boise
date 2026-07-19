import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  fetchCapabilities,
  fetchOverview,
  fetchSample,
  fetchSamples,
  runReplay,
  type CapabilityEntry,
  type DatasetOverview,
  type ReplayResult,
  type SampleDetail,
  type SampleListItem,
} from "./api";
import { SampleChart } from "./SampleChart";
import { AbComparePanel } from "./AbComparePanel";
import { AbcBottomResetPanel } from "./AbcBottomResetPanel";
import { CausalSquatBottomPanel } from "./CausalSquatBottomPanel";
import { MotionAccountingPanel } from "./MotionAccountingPanel";
import { SquatReadyGatePanel } from "./SquatReadyGatePanel";
import { RepGroundTruthPanel } from "./RepGroundTruthPanel";
import { RepCounterScorePanel } from "./RepCounterScorePanel";
import { GenericVsSquatComparePanel } from "./GenericVsSquatComparePanel";
import { BottomReversalMissPanel } from "./BottomReversalMissPanel";
import { UnavailablePanel } from "./UnavailablePanel";

const panelStyle: CSSProperties = {
  background: "#1a1d27",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
  border: "1px solid #2a2f3d",
};

export function App() {
  const [overview, setOverview] = useState<DatasetOverview | null>(null);
  const [samples, setSamples] = useState<SampleListItem[]>([]);
  const [selected, setSelected] = useState<{ exerciseId: string; baseName: string } | null>(null);
  const [detail, setDetail] = useState<SampleDetail | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityEntry[]>([]);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, sm, cap] = await Promise.all([
        fetchOverview(),
        fetchSamples(),
        fetchCapabilities(),
      ]);
      setOverview(ov);
      setSamples(sm.samples);
      setCapabilities(cap.audit.entries);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setReplay(null);
      return;
    }
    void fetchSample(selected.exerciseId, selected.baseName)
      .then(setDetail)
      .catch((err) => setError((err as Error).message));
  }, [selected]);

  const classifierCap = capabilities.find((c) => c.capability === "classifier_desktop");
  const projectionCap = capabilities.find((c) => c.capability === "projection_scatter");

  async function handleReplay() {
    if (!selected) return;
    setReplayBusy(true);
    try {
      const result = await runReplay(selected.exerciseId, selected.baseName);
      setReplay(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setReplayBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Boise Workbench</h1>
        <p style={{ color: "#888", margin: "4px 0 0" }}>
          Dataset browser + replay (Passes 11–22)
        </p>
      </header>

      {error && (
        <div style={{ ...panelStyle, borderColor: "#c62828", color: "#ef9a9a" }}>{error}</div>
      )}

      {overview && (
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Dataset Overview</h2>
          <p>
            <strong>{overview.totalSamples}</strong> samples · root:{" "}
            <code style={{ fontSize: 12 }}>{overview.dataRoot}</code>
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#888" }}>
                <th>Exercise</th>
                <th>Kept</th>
                <th>Rejected</th>
                <th>Unreviewed</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(overview.countsByExercise).map(([ex, counts]) => (
                <tr key={ex}>
                  <td>{ex}</td>
                  <td>{counts.kept}</td>
                  <td>{counts.rejected}</td>
                  <td>{counts.unreviewed}</td>
                  <td>{counts.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {overview.integrityIssues.length > 0 && (
            <p style={{ color: "#ffab91", fontSize: 13 }}>
              {overview.integrityIssues.length} integrity issue(s) detected
            </p>
          )}
        </section>
      )}

      <section style={panelStyle}>
        <h2 style={{ marginTop: 0 }}>Samples</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#888" }}>
              <th>Exercise</th>
              <th>Base</th>
              <th>Status</th>
              <th>Trigger</th>
              <th>Duration</th>
              <th>Collector</th>
              <th>Captured</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((row) => (
              <tr
                key={`${row.exerciseId}/${row.baseName}`}
                onClick={() => setSelected({ exerciseId: row.exerciseId, baseName: row.baseName })}
                style={{
                  cursor: "pointer",
                  background:
                    selected?.baseName === row.baseName && selected?.exerciseId === row.exerciseId
                      ? "#2a3148"
                      : undefined,
                }}
              >
                <td>{row.exerciseId}</td>
                <td>{row.baseName}</td>
                <td>{row.status}</td>
                <td>{row.triggerId}</td>
                <td>{row.durationSec != null ? `${row.durationSec.toFixed(2)}s` : "—"}</td>
                <td>{row.collectorName}</td>
                <td>{row.capturedAtIso.slice(0, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {detail && (
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>
            {detail.exerciseId} / {detail.baseName}
          </h2>
          {detail.meta && (
            <p style={{ fontSize: 14, color: "#aaa" }}>
              Status: <strong>{detail.meta.status}</strong> · Label: {detail.meta.label.exerciseId}{" "}
              · Trigger: {detail.meta.captureTrigger.triggerId}
            </p>
          )}
          {detail.sample && <SampleChart samples={detail.sample.samples} />}

          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={() => void handleReplay()}
              disabled={replayBusy || !detail.sample}
              style={{
                padding: "8px 16px",
                background: "#3949ab",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: replayBusy ? "wait" : "pointer",
              }}
            >
              {replayBusy ? "Replaying…" : "Replay (A-novbt)"}
            </button>
            {replay && (
              <p style={{ fontSize: 13, color: "#aaa", marginTop: 8 }}>
                {replay.cached ? "Cache hit" : "Computed"} · {replay.stats.samples} samples ·{" "}
                {replay.stats.clampCount} clamps · peak |bodyZ|={replay.stats.peakAbsBodyZ.toFixed(4)}{" "}
                · insideVBTWindow={String(replay.stats.insideVBTWindow)}
                {replay.determinismVerified && " · determinism ✓"}
              </p>
            )}
          </div>

          {selected && detail && (
            <AbComparePanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <BottomReversalMissPanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <AbcBottomResetPanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <CausalSquatBottomPanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <MotionAccountingPanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <SquatReadyGatePanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <RepGroundTruthPanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <GenericVsSquatComparePanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {selected && detail && (
            <RepCounterScorePanel
              exerciseId={selected.exerciseId}
              baseName={selected.baseName}
              detail={detail}
            />
          )}

          {classifierCap && (
            <UnavailablePanel
              title="Classifier probabilities (Pass 15)"
              reason={classifierCap.reason}
              evidencePaths={classifierCap.evidencePaths}
            />
          )}
          {projectionCap && (
            <UnavailablePanel
              title="Projection scatter (Pass 16)"
              reason={projectionCap.reason}
              evidencePaths={projectionCap.evidencePaths}
            />
          )}
        </section>
      )}
    </div>
  );
}
