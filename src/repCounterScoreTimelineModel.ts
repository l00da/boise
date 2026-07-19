/**
 * Pass 3D — timeline lanes for truth vs predictions vs matches.
 */

import type {
  CounterScoreResult,
  MatchLink,
  PredictedRep,
  RepCounterScoreReport,
  TruthRep,
} from "../../../gold-grey/src/lib/boise/repCounterScoring.ts";

export type ScoreTimelinePayload = {
  captureEpochStartMs: number;
  captureEpochEndMs: number;
  truthCompletions: { repId: string; epochMs: number }[];
  predCompletions: { predId: string; epochMs: number }[];
  matches: MatchLink[];
  unmatchedTruth: { repId: string; epochMs: number }[];
  unmatchedPred: { predId: string; epochMs: number }[];
  completionErrors: {
    truthRepId: string;
    predId: string;
    absErrorMs: number;
    midEpochMs: number;
  }[];
  phaseErrors: {
    truthRepId: string;
    predId: string;
    phase: string;
    absErrorMs: number;
    midEpochMs: number;
  }[];
};

export function buildScoreTimeline(input: {
  report: RepCounterScoreReport;
  selected: CounterScoreResult | null;
  predictions: PredictedRep[];
  captureEpochStartMs: number;
  captureEpochEndMs: number;
}): ScoreTimelinePayload {
  const truthById = new Map(input.report.truthReps.map((t) => [t.repId, t]));
  const predById = new Map(input.predictions.map((p) => [p.predId, p]));
  const selected = input.selected;

  const truthCompletions = input.report.truthReps
    .filter((t): t is TruthRep & { completionEpochMs: number } => t.completionEpochMs !== null)
    .map((t) => ({ repId: t.repId, epochMs: t.completionEpochMs }));

  const predCompletions = input.predictions.map((p) => ({
    predId: p.predId,
    epochMs: p.completionEpochMs,
  }));

  const unmatchedTruth = (selected?.unmatchedTruthRepIds ?? [])
    .map((id) => {
      const t = truthById.get(id);
      if (!t?.completionEpochMs) return null;
      return { repId: id, epochMs: t.completionEpochMs };
    })
    .filter((x): x is { repId: string; epochMs: number } => x !== null);

  const unmatchedPred = (selected?.unmatchedPredIds ?? [])
    .map((predId) => {
      const p = predById.get(predId);
      if (!p) return null;
      return { predId, epochMs: p.completionEpochMs };
    })
    .filter((x): x is { predId: string; epochMs: number } => x !== null);

  const completionErrors =
    selected?.matches.map((m) => {
      const truth = truthById.get(m.truthRepId)!;
      const pred = predById.get(m.predId)!;
      return {
        truthRepId: m.truthRepId,
        predId: m.predId,
        absErrorMs: m.absCompletionErrorMs,
        midEpochMs: (truth.completionEpochMs! + pred.completionEpochMs) / 2,
      };
    }) ?? [];

  const phaseErrors =
    selected?.matches.flatMap((m) => {
      const truth = truthById.get(m.truthRepId)!;
      const pred = predById.get(m.predId)!;
      return m.phaseErrors.map((pe) => {
        const tMs = truth.phases[pe.phase as keyof typeof truth.phases]!;
        const pMs = pred.phases?.[pe.phase as keyof NonNullable<typeof pred.phases>] ?? tMs;
        return {
          truthRepId: m.truthRepId,
          predId: m.predId,
          phase: pe.phase,
          absErrorMs: pe.absErrorMs,
          midEpochMs: (tMs + pMs) / 2,
        };
      });
    }) ?? [];

  return {
    captureEpochStartMs: input.captureEpochStartMs,
    captureEpochEndMs: input.captureEpochEndMs,
    truthCompletions,
    predCompletions,
    matches: selected?.matches ?? [],
    unmatchedTruth,
    unmatchedPred,
    completionErrors,
    phaseErrors,
  };
}
