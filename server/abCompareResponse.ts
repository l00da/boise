import type { AbClampTimelinePayload } from "../src/abClampTimelineModel.ts";
import type { AbCompareResult, AbCompareSuccess } from "./abCompare.ts";

/** Stable API aliases for velocity rows and grouped clamp episodes. */
export function finalizeAbCompareTimeline(
  payload: AbClampTimelinePayload
): AbClampTimelinePayload {
  const velocitySeries = payload.velocitySeries ?? payload.rows ?? [];
  const groupedEpisodes = payload.groupedEpisodes ?? payload.episodes ?? [];

  return {
    ...payload,
    velocitySeries,
    rows: payload.rows ?? velocitySeries,
    individualOverlays: payload.individualOverlays ?? [],
    groupedEpisodes,
    episodes: payload.episodes ?? groupedEpisodes,
    oracleBottomReversalCount: payload.oracleBottomReversalCount ?? 0,
    disclaimer: payload.disclaimer ?? "",
  };
}

/** Ensures successful compare responses always carry a chartable timeline before res.json(). */
export function toAbCompareHttpBody(result: AbCompareResult): AbCompareResult {
  if (result.status !== "success") {
    return result;
  }

  const timeline = finalizeAbCompareTimeline(result.timeline);
  if (!Array.isArray(timeline.rows) || timeline.rows.length === 0) {
    throw new Error("A/B compare succeeded but timeline.rows is empty");
  }
  if (!Array.isArray(timeline.episodes)) {
    throw new Error("A/B compare succeeded but timeline.episodes is missing");
  }

  const body: AbCompareSuccess = {
    ...result,
    timeline,
  };
  return body;
}
