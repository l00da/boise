import type { ScoreTimelinePayload } from "./repCounterScoreTimelineModel";

type Props = {
  timeline: ScoreTimelinePayload;
};

function Lane({
  label,
  color,
  marks,
  domainStart,
  domainEnd,
}: {
  label: string;
  color: string;
  marks: { key: string; epochMs: number; title?: string; widthPx?: number }[];
  domainStart: number;
  domainEnd: number;
}) {
  const span = Math.max(domainEnd - domainStart, 1);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color, marginBottom: 3, fontFamily: "ui-monospace, monospace" }}>
        {label} ({marks.length})
      </div>
      <div style={{ position: "relative", height: 18, background: "#1a1d27", borderRadius: 3 }}>
        {marks.map((m) => {
          const left = ((m.epochMs - domainStart) / span) * 100;
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
}

export function RepCounterScoreLanes({ timeline }: Props) {
  const { captureEpochStartMs: a, captureEpochEndMs: b } = timeline;
  return (
    <div style={{ marginBottom: 12 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 14 }}>Score timeline</h4>
      <Lane
        label="approved / GT completions"
        color="#66bb6a"
        domainStart={a}
        domainEnd={b}
        marks={timeline.truthCompletions.map((t) => ({
          key: t.repId,
          epochMs: t.epochMs,
          title: t.repId,
        }))}
      />
      <Lane
        label="selected counter predictions"
        color="#42a5f5"
        domainStart={a}
        domainEnd={b}
        marks={timeline.predCompletions.map((p) => ({
          key: p.predId,
          epochMs: p.epochMs,
          title: p.predId,
        }))}
      />
      <Lane
        label="one-to-one match links (midpoints)"
        color="#26c6da"
        domainStart={a}
        domainEnd={b}
        marks={timeline.completionErrors.map((m) => ({
          key: `${m.truthRepId}-${m.predId}`,
          epochMs: m.midEpochMs,
          title: `match ${m.truthRepId}↔${m.predId} |Δ|=${m.absErrorMs}ms`,
          widthPx: 6,
        }))}
      />
      <Lane
        label="unmatched truths (misses)"
        color="#ef5350"
        domainStart={a}
        domainEnd={b}
        marks={timeline.unmatchedTruth.map((t) => ({
          key: `miss-${t.repId}`,
          epochMs: t.epochMs,
          title: `miss ${t.repId}`,
        }))}
      />
      <Lane
        label="unmatched predictions (extras)"
        color="#ff9800"
        domainStart={a}
        domainEnd={b}
        marks={timeline.unmatchedPred.map((p) => ({
          key: `extra-${p.predId}`,
          epochMs: p.epochMs,
          title: `extra ${p.predId}`,
        }))}
      />
      <Lane
        label="completion timing errors"
        color="#ce93d8"
        domainStart={a}
        domainEnd={b}
        marks={timeline.completionErrors.map((m) => ({
          key: `cerr-${m.truthRepId}`,
          epochMs: m.midEpochMs,
          title: `|completion err|=${m.absErrorMs} ms`,
        }))}
      />
      <Lane
        label="phase timing errors"
        color="#ffd54f"
        domainStart={a}
        domainEnd={b}
        marks={timeline.phaseErrors.map((m, i) => ({
          key: `perr-${m.truthRepId}-${m.phase}-${i}`,
          epochMs: m.midEpochMs,
          title: `${m.phase} |Δ|=${m.absErrorMs} ms`,
        }))}
      />
    </div>
  );
}
