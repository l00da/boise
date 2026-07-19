import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SampleDetail } from "./api";
import {
  fetchRepGroundTruthEditor,
  saveRepGroundTruthEditor,
  type RepGroundTruthEditorApiResult,
} from "./api";
import { RepGroundTruthChart } from "./RepGroundTruthChart";
import { RepGroundTruthLanes } from "./RepGroundTruthLanes";
import { buildRepGroundTruthTimeline } from "./repGroundTruthTimelineModel";
import type { RepGroundTruthSidecarV1 } from "../../../gold-grey/src/lib/boise/repGroundTruth.ts";
import type { RepGroundTruthEventType } from "../../../gold-grey/src/lib/boise/repGroundTruth.ts";
import {
  buildEventSelectionDetail,
  editorAddPhaseEvent,
  editorAddRep,
  editorApprove,
  editorDeleteEvent,
  editorDeleteRep,
  editorMoveEvent,
  editorReassignRepId,
  editorSetStatus,
  editorUnapprove,
  editorUpdateNotes,
  listRepIds,
} from "../../../gold-grey/src/lib/boise/repGroundTruthEditor.ts";

type Props = {
  exerciseId: string;
  baseName: string;
  detail: SampleDetail;
};

const PHASES: RepGroundTruthEventType[] = [
  "eccentric_start",
  "turnaround",
  "concentric_start",
  "lockout",
  "rep_complete",
];

export function RepGroundTruthPanel({ exerciseId, baseName, detail }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<
    Extract<RepGroundTruthEditorApiResult, { status: "success" }> | null
  >(null);
  const [draft, setDraft] = useState<RepGroundTruthSidecarV1 | null>(null);
  const [history, setHistory] = useState<RepGroundTruthSidecarV1[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [phaseType, setPhaseType] = useState<RepGroundTruthEventType>("eccentric_start");
  const [targetRepId, setTargetRepId] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const reset = useCallback(() => {
    setPayload(null);
    setDraft(null);
    setHistory([]);
    setSelectedEventId(null);
    setDirty(false);
    setError(null);
    setSavedNote(null);
    setExpanded(false);
  }, []);

  useEffect(() => {
    reset();
  }, [exerciseId, baseName, reset]);

  const pushDraft = useCallback((next: RepGroundTruthSidecarV1) => {
    setDraft((prev) => {
      if (prev) setHistory((h) => [...h, prev].slice(-40));
      return next;
    });
    setDirty(true);
  }, []);

  const handleLoad = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (payload && draft) {
      setExpanded(true);
      return;
    }
    setBusy(true);
    setError(null);
    setSavedNote(null);
    try {
      const res = await fetchRepGroundTruthEditor(exerciseId, baseName);
      if (res.status !== "success") {
        setError(res.message);
        return;
      }
      setPayload(res);
      setDraft(res.sidecar);
      setHistory([]);
      setDirty(false);
      const reps = listRepIds(res.sidecar);
      setTargetRepId(reps[0] ?? "");
      setExpanded(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [exerciseId, baseName, expanded, payload, draft]);

  const samples = useMemo(
    () => (payload?.sampleEpochMs ?? []).map((epochMs) => ({ epochMs })),
    [payload]
  );

  const timeline = useMemo(() => {
    if (!payload || !draft) return null;
    return buildRepGroundTruthTimeline({
      sidecar: draft,
      bodyZSeries: payload.bodyZSeries,
      captureEpochStartMs: payload.captureEpochStartMs,
      captureEpochEndMs: payload.captureEpochEndMs,
    });
  }, [payload, draft]);

  const selection = draft && selectedEventId
    ? buildEventSelectionDetail(draft, selectedEventId)
    : null;

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1]!;
      setDraft(prev);
      setDirty(true);
      return h.slice(0, -1);
    });
  };

  const onDragEvent = (eventId: string, targetEpochMs: number) => {
    if (!draft) return;
    const { sidecar } = editorMoveEvent({
      sidecar: draft,
      samples,
      eventId,
      targetEpochMs,
    });
    pushDraft(sidecar);
    setSelectedEventId(eventId);
  };

  const handleSave = async (
    sidecar?: RepGroundTruthSidecarV1,
    opts?: { explicitReapprove?: boolean }
  ) => {
    const toSave = sidecar ?? draft;
    if (!toSave) return;
    setBusy(true);
    setError(null);
    try {
      const res = await saveRepGroundTruthEditor(exerciseId, baseName, toSave, opts);
      if (res.status !== "success") {
        setError(res.message);
        return;
      }
      setDraft(res.sidecar);
      setDirty(false);
      setHistory([]);
      setSavedNote("Saved — sample.json untouched");
      if (payload) {
        setPayload({ ...payload, sidecar: res.sidecar, createdNew: false });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const labelId = detail.meta?.label?.exerciseId ?? null;

  return (
    <section style={{ marginTop: 28, borderTop: "1px solid #2a2f3d", paddingTop: 20 }}>
      <h3 style={{ margin: "0 0 4px" }}>Rep ground-truth editor (Pass 3C)</h3>
      <p style={{ fontSize: 13, color: "#888", margin: "0 0 12px" }}>
        Inspect, correct, organize, and approve draft rep markers. Approval statuses (draft /
        reviewed / approved) are separate from Boise sample keep/reject. No scoring.
        {labelId ? ` Sample label: ${labelId}.` : ""}
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => void handleLoad()}
        style={btnStyle}
      >
        {busy ? "Loading…" : expanded ? "Hide ground truth" : "Load ground truth"}
      </button>

      {error && <p style={{ color: "#ef9a9a", fontSize: 13, marginTop: 10 }}>{error}</p>}
      {savedNote && <p style={{ color: "#a5d6a7", fontSize: 13, marginTop: 8 }}>{savedNote}</p>}

      {expanded && payload && draft && timeline && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 8,
              margin: "14px 0",
            }}
          >
            <Stat label="Approval" value={draft.approvalStatus} />
            <Stat label="Source" value={draft.source} />
            <Stat label="Events" value={String(draft.events.length)} />
            <Stat label="Sidecar" value={payload.createdNew ? "created new" : "loaded"} />
            <Stat label="Dirty" value={dirty ? "yes" : "no"} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              style={btnStyle}
              onClick={() => {
                const mid =
                  payload.captureEpochStartMs +
                  (payload.captureEpochEndMs - payload.captureEpochStartMs) / 2;
                const { sidecar } = editorAddRep({
                  sidecar: draft,
                  samples,
                  targetEpochMs: mid,
                });
                pushDraft(sidecar);
              }}
            >
              Add repetition
            </button>
            <select
              value={phaseType}
              onChange={(e) => setPhaseType(e.target.value as RepGroundTruthEventType)}
              style={selectStyle}
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={targetRepId}
              onChange={(e) => setTargetRepId(e.target.value)}
              style={selectStyle}
            >
              <option value="">rep…</option>
              {listRepIds(draft).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={btnStyle}
              disabled={!targetRepId}
              onClick={() => {
                if (!targetRepId) return;
                const mid =
                  payload.captureEpochStartMs +
                  (payload.captureEpochEndMs - payload.captureEpochStartMs) / 2;
                const { sidecar } = editorAddPhaseEvent({
                  sidecar: draft,
                  samples,
                  targetEpochMs: mid,
                  repId: targetRepId,
                  eventType: phaseType,
                });
                pushDraft(sidecar);
              }}
            >
              Add phase event
            </button>
            <button type="button" style={btnStyle} disabled={history.length === 0} onClick={undo}>
              Undo unsaved
            </button>
            <button type="button" style={btnPrimary} disabled={busy || !dirty} onClick={() => void handleSave()}>
              Save
            </button>
            <button
              type="button"
              style={btnPrimary}
              disabled={busy}
              onClick={() => {
                const approved = editorApprove(draft);
                pushDraft(approved);
                void handleSave(approved, { explicitReapprove: true });
              }}
            >
              Approve & save
            </button>
            <button
              type="button"
              style={btnStyle}
              disabled={busy}
              onClick={() => pushDraft(editorUnapprove(draft))}
            >
              Unapprove
            </button>
            <button
              type="button"
              style={btnStyle}
              onClick={() => pushDraft(editorSetStatus({ sidecar: draft, approvalStatus: "draft" }))}
            >
              Mark draft
            </button>
          </div>

          <RepGroundTruthLanes
            timeline={timeline}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onDragEvent={onDragEvent}
          />
          <RepGroundTruthChart
            timeline={timeline}
            selectedEventId={selectedEventId}
            onSelectRelativeMs={(rel) => {
              // Click chart → add phase at that relative time when a rep is selected.
              if (!targetRepId) return;
              const { sidecar } = editorAddPhaseEvent({
                sidecar: draft,
                samples,
                targetEpochMs: payload.captureEpochStartMs + rel,
                repId: targetRepId,
                eventType: phaseType,
              });
              pushDraft(sidecar);
            }}
          />

          {selection && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: "#252a38",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "ui-monospace, monospace",
                color: "#ddd",
              }}
            >
              <div style={{ color: "#aaa", marginBottom: 6 }}>Selection</div>
              <div>provenance: {selection.provenance}</div>
              <div>timingMethod: {selection.timingMethod}</div>
              <div>repId: {selection.repId}</div>
              <div>phase: {selection.eventType}</div>
              <div>sampleIndex: {selection.sampleIndex}</div>
              <div>original interaction: {selection.originalInteractionEpochMs ?? "—"}</div>
              <div>corrected sample: {selection.correctedSampleEpochMs}</div>
              <div>correction offset: {selection.correctionOffsetMs ?? "—"}</div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={btnStyle}
                  onClick={() => {
                    const { sidecar } = editorDeleteEvent({
                      sidecar: draft,
                      eventId: selection.eventId,
                    });
                    pushDraft(sidecar);
                    setSelectedEventId(null);
                  }}
                >
                  Delete event
                </button>
                <button
                  type="button"
                  style={btnStyle}
                  onClick={() => {
                    const { sidecar } = editorDeleteRep({
                      sidecar: draft,
                      repId: selection.repId,
                    });
                    pushDraft(sidecar);
                    setSelectedEventId(null);
                  }}
                >
                  Delete rep (all phases)
                </button>
                <input
                  style={inputStyle}
                  defaultValue={selection.repId}
                  key={selection.eventId + "-rep"}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (!next || next === selection.repId) return;
                    const { sidecar } = editorReassignRepId({
                      sidecar: draft,
                      eventId: selection.eventId,
                      nextRepId: next,
                      reassignWholeRep: true,
                    });
                    pushDraft(sidecar);
                  }}
                />
                <input
                  style={{ ...inputStyle, minWidth: 200 }}
                  defaultValue={selection.notes ?? ""}
                  key={selection.eventId + "-notes"}
                  placeholder="notes"
                  onBlur={(e) => {
                    const { sidecar } = editorUpdateNotes({
                      sidecar: draft,
                      eventId: selection.eventId,
                      notes: e.target.value,
                    });
                    pushDraft(sidecar);
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const btnStyle: CSSProperties = {
  padding: "8px 12px",
  background: "#2a2f3d",
  color: "#eee",
  border: "1px solid #3a4050",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};

const btnPrimary: CSSProperties = {
  ...btnStyle,
  background: "#3949ab",
  border: "none",
};

const selectStyle: CSSProperties = {
  background: "#1a1d27",
  color: "#eee",
  border: "1px solid #3a4050",
  borderRadius: 4,
  padding: "8px 10px",
};

const inputStyle: CSSProperties = {
  background: "#1a1d27",
  color: "#eee",
  border: "1px solid #3a4050",
  borderRadius: 4,
  padding: "6px 8px",
  fontSize: 12,
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#252a38", borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
      <div style={{ fontSize: 15, color: "#e0e0e0", marginTop: 2 }}>{value}</div>
    </div>
  );
}
