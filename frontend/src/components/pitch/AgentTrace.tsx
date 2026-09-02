import { useState } from "react";
import type { SceneTrace, TraceStatus, TraceStepEntry } from "@/lib/trace";

const STATUS_LABEL: Record<TraceStatus, string> = {
  done: "Logged",
  running: "Working",
  pending: "Pending",
};

function StatusTag({ status }: { status: TraceStatus }) {
  const tone =
    status === "running"
      ? "text-accent"
      : status === "pending"
        ? "text-muted-foreground"
        : "text-foreground";

  return (
    <span className={`label flex shrink-0 items-center gap-1.5 ${tone}`}>
      <span
        className={`inline-block size-1.5 ${
          status === "pending"
            ? "bg-foreground/25"
            : status === "running"
              ? "bg-accent"
              : "bg-foreground"
        }`}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Row({ step }: { step: TraceStepEntry }) {
  const { status } = step;
  return (
    <div
      className={`grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-border py-4 ${
        status === "pending" ? "opacity-40" : "animate-frame-in"
      }`}
    >
      <span
        className={`label pt-1 ${status === "running" ? "text-accent" : "text-muted-foreground"}`}
      >
        {step.index}
      </span>
      <div>
        <div className="flex items-start justify-between gap-4">
          <span className={`label ${status === "running" ? "text-accent" : "text-foreground"}`}>
            {step.label}
          </span>
          <StatusTag status={status} />
        </div>

        {status !== "pending" && step.detail && (
          <p className="mt-1.5 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
            {step.detail}
          </p>
        )}

        {status === "running" && (
          <div className="relative mt-3 h-px w-full overflow-hidden bg-border">
            <span className="absolute inset-y-0 w-1/3 animate-scan bg-accent" />
          </div>
        )}
      </div>
    </div>
  );
}

// What a collapsed scene's title shows: whichever step is furthest along
// (running, or the last one to finish) -- steps proceed in SCENE_STEP_ORDER,
// so the furthest non-pending step is "what the agent is doing, or just
// did, for this scene" without needing to expand it. Once every step is
// done this reports "Complete" instead of just repeating the last step's
// label, so a finished scene doesn't read as if it's still mid-step.
function currentStepInfo(steps: TraceStepEntry[]): { label: string; status: TraceStatus } | null {
  if (steps.length > 0 && steps.every((s) => s.status === "done")) {
    return { label: "Complete", status: "done" };
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]!;
    if (step.status !== "pending") return { label: step.label, status: step.status };
  }
  return null;
}

function SceneBlock({ scene }: { scene: SceneTrace }) {
  const [expanded, setExpanded] = useState(false);
  const current = currentStepInfo(scene.steps);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 border-b border-border bg-card px-0 py-2 text-left transition-colors hover:bg-border/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="label shrink-0 text-muted-foreground">{expanded ? "▾" : "▸"}</span>
          <span className="label truncate text-muted-foreground">
            Scene {scene.sceneId} — {current?.label ?? scene.title}
          </span>
        </span>
        {current && <StatusTag status={current.status} />}
      </button>

      {expanded &&
        scene.steps.map((step) => <Row key={`${scene.sceneId}-${step.id}`} step={step} />)}
    </div>
  );
}

export function AgentTrace({
  parseStatus,
  sceneTraces,
}: {
  parseStatus: TraceStatus;
  sceneTraces: SceneTrace[];
}) {
  const totalSteps = 1 + sceneTraces.reduce((n, s) => n + s.steps.length, 0);
  const doneSteps =
    (parseStatus === "done" ? 1 : 0) +
    sceneTraces.reduce((n, s) => n + s.steps.filter((st) => st.status === "done").length, 0);

  return (
    <div>
      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-2">
        <h2 className="font-display text-2xl font-bold tracking-tight">Agent Trace</h2>
        <span className="label text-muted-foreground">
          {doneSteps} / {totalSteps} beats
        </span>
      </div>

      <div
        className={`grid grid-cols-[2.5rem_1fr] gap-x-4 border-b border-border py-4 ${
          parseStatus === "pending" ? "opacity-40" : "animate-frame-in"
        }`}
      >
        <span
          className={`label pt-1 ${parseStatus === "running" ? "text-accent" : "text-muted-foreground"}`}
        >
          00
        </span>
        <div className="flex items-center justify-between gap-4">
          <span
            className={`label ${parseStatus === "running" ? "text-accent" : "text-foreground"}`}
          >
            Parse script
          </span>
          <StatusTag status={parseStatus} />
        </div>
      </div>

      {sceneTraces.map((scene) => (
        <SceneBlock key={scene.sceneId} scene={scene} />
      ))}
    </div>
  );
}
