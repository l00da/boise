# Boise Workbench — Known Blockers

## Pass 19 — A/B Replay Comparison

**Status: BLOCKED**

The M3 `ExerciseContext` seam is absent from estimator replay. `runEstimatorReplay`
in `gold-grey/src/lib/imu/replay/replayRunner.ts` only accepts `insideVBTWindow`;
`IMUStreamProcessor.push()` has no exercise-context parameter.

Evidence: `gold-grey/docs/boise/PASS0-EVIDENCE.md` §7 — estimator/replay ExerciseContext **ABSENT**.

A VBT-layer `ExerciseContext` type exists at `gold-grey/src/vbt/contracts.ts` but is
not wired into the replay path. Do not build speculative B plumbing until M3 Pass 2/3
lands the oracle context seam in the estimator.

## Pass 15/16 — Classifier & Projection (Branch B)

**Status: NOT AVAILABLE**

Pass 0 DESKTOP VERDICT: `NOT EXECUTABLE` — numpy/sklearn pickle incompatibility.
Pass 1 FEATURE-TRANSFORM VERDICT: `NOT AVAILABLE` — no saved `feature_pipeline.joblib`.

UI shows honest unavailable panels; no mock probabilities or projection placement.

## Pass 21 — Flex Scoring

**Status: CONDITIONAL**

`flexCompare.ts` and `compare:flex` npm script are present. Scoring requires a
`reptile.flex.reference.v1` sidecar per sample (`flex-reference.json`). No committed
reference JSON in repo; tests build sidecars inline.
