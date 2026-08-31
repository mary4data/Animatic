// Turns the raw SSE event stream from GET /api/scripts/:jobId/events into the
// step-by-step shape AgentTrace renders. The mock trace this replaced was a
// flat 5-step list for one representative scene, animated by a client-side
// timer; the real run is `parse_script` once, then a repeating group of
// steps *per scene* (up to 3) — this module folds per-line/per-image events
// into one aggregate row per scene per step, matching the design's
// scene-level granularity rather than exploding into a row per dialogue
// line or per storyboard image.

export type TraceStatus = "done" | "running" | "pending";

export type SceneStepId =
  "ground_visual_style" | "generate_storyboard" | "generate_score" | "generate_voice_lines";

export const SCENE_STEP_ORDER: SceneStepId[] = [
  "ground_visual_style",
  "generate_storyboard",
  "generate_score",
  "generate_voice_lines",
];

export const STEP_LABEL: Record<SceneStepId, string> = {
  ground_visual_style: "Pull style reference",
  generate_storyboard: "Generate storyboard",
  generate_score: "Generate score",
  generate_voice_lines: "Synthesize voice lines",
};

export type TraceStepEntry = {
  id: SceneStepId;
  index: string;
  label: string;
  status: TraceStatus;
  detail?: string | undefined;
};

export type SceneTrace = {
  sceneId: string;
  title: string;
  steps: TraceStepEntry[];
};

export type RawEvent = {
  step: string;
  status: string;
  scene_id: string | null;
  line_id?: string | null;
  detail?: string | null;
  data?: Record<string, unknown> | null;
};

type ParsedSceneSummary = { id: string; heading: string; title: string; number: string };

export type TraceState = {
  parseStatus: TraceStatus;
  parseDetail?: string | undefined;
  sceneOrder: string[];
  sceneTitles: Record<string, string>;
  stepStatus: Record<string, Partial<Record<SceneStepId, RawEvent[]>>>;
  jobStatus: "running" | "completed" | "failed" | "pending";
  jobError?: string | undefined;
};

export function initialTraceState(): TraceState {
  return {
    parseStatus: "pending",
    sceneOrder: [],
    sceneTitles: {},
    stepStatus: {},
    jobStatus: "pending",
  };
}

export function applyEvent(state: TraceState, event: RawEvent): TraceState {
  const next: TraceState = {
    ...state,
    sceneOrder: [...state.sceneOrder],
    sceneTitles: { ...state.sceneTitles },
    stepStatus: { ...state.stepStatus },
  };

  if (event.step === "job_completed") {
    next.jobStatus = event.status === "failed" ? "failed" : "completed";
    if (event.detail) next.jobError = event.detail;
    return next;
  }

  if (event.step === "parse_script") {
    next.parseStatus = event.status === "completed" ? "done" : "running";
    if (event.detail) next.parseDetail = event.detail;
    const scenes = event.data?.["scenes"];
    if (event.status === "completed" && Array.isArray(scenes)) {
      for (const s of scenes as ParsedSceneSummary[]) {
        if (!next.sceneOrder.includes(s.id)) next.sceneOrder.push(s.id);
        next.sceneTitles[s.id] = s.title;
      }
    }
    return next;
  }

  // Not per-scene, and narrows sceneOrder/sceneTitles down to only what the
  // user actually kept -- parse_script's own event added every parsed scene
  // (up to 20) before the user ever got to choose; without this, unselected
  // scenes would sit in the Beat index forever "pending" since the agent
  // never touches them again after this point.
  if (event.step === "wait_for_scene_selection") {
    if (event.status === "completed") {
      const selected = event.data?.["selected_scene_ids"];
      if (Array.isArray(selected)) {
        const ids = new Set(selected as string[]);
        next.sceneOrder = next.sceneOrder.filter((id) => ids.has(id));
        const titles: Record<string, string> = {};
        for (const id of next.sceneOrder) {
          if (next.sceneTitles[id]) titles[id] = next.sceneTitles[id]!;
        }
        next.sceneTitles = titles;
      }
    }
    return next;
  }

  if (!event.scene_id) return next;

  if (!next.sceneOrder.includes(event.scene_id)) next.sceneOrder.push(event.scene_id);
  next.stepStatus[event.scene_id] = { ...(next.stepStatus[event.scene_id] ?? {}) };
  const stepId = event.step as SceneStepId;
  const existing = next.stepStatus[event.scene_id]![stepId] ?? [];
  next.stepStatus[event.scene_id]![stepId] = [...existing, event];

  next.jobStatus = next.jobStatus === "pending" ? "running" : next.jobStatus;
  return next;
}

// Only a literal "completed" status ends a step — everything else ("started",
// or a tool's own intermediate sub-status like generate_storyboard's
// per-image "image_completed" ticks, or generate_voice_lines' per-line
// started/completed pairs) counts as still "running", surfacing that event's
// detail text. Treating any non-"started" status as terminal (the previous
// behavior) made a scene's step flicker done→running→done as each
// intermediate sub-event arrived; this one-line generalization fixes that
// for both the existing per-line voice events and the new per-image ones.
function statusFromEvents(events: RawEvent[] | undefined): {
  status: TraceStatus;
  detail?: string | undefined;
} {
  if (!events || events.length === 0) return { status: "pending" };
  const last = events[events.length - 1]!;
  if (last.status === "completed") return { status: "done", detail: last.detail ?? undefined };
  return { status: "running", detail: last.detail ?? undefined };
}

export function deriveSceneTraces(state: TraceState): SceneTrace[] {
  return state.sceneOrder.map((sceneId) => {
    const perStep = state.stepStatus[sceneId] ?? {};
    const steps: TraceStepEntry[] = SCENE_STEP_ORDER.map((id, i) => {
      const index = String(i + 1).padStart(2, "0");
      const { status, detail } = statusFromEvents(perStep[id]);
      return { id, index, label: STEP_LABEL[id], status, detail };
    });
    return { sceneId, title: state.sceneTitles[sceneId] ?? sceneId, steps };
  });
}
