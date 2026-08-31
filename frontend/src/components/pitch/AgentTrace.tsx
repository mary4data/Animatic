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
        <div key={scene.sceneId}>
          <div className="border-b border-border bg-card px-0 py-2">
            <span className="label text-muted-foreground">
              Scene {scene.sceneId} — {scene.title}
            </span>
          </div>
          {scene.steps.map((step) => (
            <Row key={`${scene.sceneId}-${step.id}`} step={step} />
          ))}
        </div>
      ))}
    </div>
  );
}
