import { describe, expect, it } from "vitest";
import {
  buildAbCompareSummaryRows,
  preservationLabel,
  preservationTone,
} from "../src/abCompareUiModel.ts";

describe("AbCompare UI model", () => {
  const summary = {
    sampleCount: 100,
    clampCountA: 40,
    clampCountB: 35,
    samplesWhereBSuppressedAClamp: 5,
    maxAbsBodyZVelocityDiff: 0.12,
    meanAbsBodyZVelocityDiff: 0.03,
    finalBodyZVelocityA: 0,
    finalBodyZVelocityB: 0.05,
    aPreservationVerified: true,
    inputTimestampsMatch: true,
  };

  it("builds summary rows with required fields", () => {
    const rows = buildAbCompareSummaryRows(summary);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Sample count");
    expect(labels).toContain("Clamp events — A (Generic)");
    expect(labels).toContain("Oracle suppression count");
    expect(labels).toContain("A-preservation");
    expect(rows.find((r) => r.label === "Sample count")?.value).toBe("100");
  });

  it("preservation label is obvious for pass and fail", () => {
    expect(preservationLabel(true)).toBe("Generic A preserved");
    expect(preservationLabel(false)).toBe("Generic A preservation failed");
    expect(preservationTone(true)).toBe("ok");
    expect(preservationTone(false)).toBe("bad");
  });

  it("marks failed preservation row with bad tone", () => {
    const rows = buildAbCompareSummaryRows({
      ...summary,
      aPreservationVerified: false,
    });
    const row = rows.find((r) => r.label === "A-preservation");
    expect(row?.tone).toBe("bad");
    expect(row?.value).toBe("Generic A preservation failed");
  });
});
