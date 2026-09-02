import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PitchFrame } from "@/components/pitch/PitchFrame";
import { AgentTrace } from "@/components/pitch/AgentTrace";
import { CastingPanel } from "@/components/pitch/CastingPanel";
import { SceneSelectionPanel } from "@/components/pitch/SceneSelectionPanel";
import { PROJECT } from "@/lib/pitch-data";
import { getEventHistory, subscribeToEvents } from "@/lib/api";
import { applyEvent, deriveSceneTraces, initialTraceState, type RawEvent } from "@/lib/trace";
import { uniqueSpeakers } from "@/lib/characters";

export const Route = createFileRoute("/process/$jobId")({
  head: () => ({
    meta: [
      { title: "Agent Trace — Animatic" },
      {
        name: "description",
        content:
          "Watch Animatic work a scene beat by beat: parse, ground, board, and voice — every step readable on the page.",
      },
    ],
  }),
  component: Process,
});

type SceneMeta = { heading: string; title: string; number: string; synopsis: string };

function Process() {
  const { jobId } = Route.useParams();
  const [state, setState] = useState(initialTraceState());
  const [scenesMeta, setScenesMeta] = useState<Record<string, SceneMeta>>({});
  const [characters, setCharacters] = useState<string[]>([]);
  const [awaitingSceneSelection, setAwaitingSceneSelection] = useState(false);
  const [awaitingCasting, setAwaitingCasting] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState<"reconnecting" | "closed" | null>(null);
  const [liveFrame, setLiveFrame] = useState<{
    sceneId: string;
    image: string | undefined;
    placeholder: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    // Plain closure variable, not React state — every invocation of
    // handleEvent below (whether from history replay or a live event) is
    // the same function instance for the life of this effect, so this is
    // shared across calls without the stale-closure trap state would have
    // here (state captured at definition time wouldn't see a later setState
    // from an earlier event).
    let parsedScenesFull: Array<{
      id: string;
      heading: string;
      title: string;
      number: string;
      synopsis: string;
      dialogue: Array<{ speaker: string }>;
    }> = [];

    function handleEvent(event: RawEvent) {
      setState((prev) => applyEvent(prev, event));

      const scenes = event.data?.["scenes"];
      if (event.step === "parse_script" && event.status === "completed" && Array.isArray(scenes)) {
        const parsedScenes = scenes as typeof parsedScenesFull;
        parsedScenesFull = parsedScenes;
        const meta: Record<string, SceneMeta> = {};
        for (const s of parsedScenes) {
          meta[s.id] = {
            heading: s.heading,
            title: s.title,
            number: s.number,
            synopsis: s.synopsis,
          };
        }
        setScenesMeta(meta);
      }

      if (event.step === "wait_for_scene_selection" && event.status === "started") {
        setAwaitingSceneSelection(true);
      }
      if (event.step === "wait_for_scene_selection" && event.status === "completed") {
        setAwaitingSceneSelection(false);
        const selectedIds = (event.data?.["selected_scene_ids"] as string[] | undefined) ?? [];
        const selected = parsedScenesFull.filter((s) => selectedIds.includes(s.id));
        setCharacters(uniqueSpeakers(selected));
      }

      if (event.step === "wait_for_casting" && event.status === "started") {
        setAwaitingCasting(true);
      }
      if (event.step === "wait_for_casting" && event.status === "completed") {
        setAwaitingCasting(false);
      }

      if (
        event.step === "generate_storyboard" &&
        event.status === "image_completed" &&
        event.scene_id
      ) {
        const imageUrl = event.data?.["image_url"] as string | undefined;
        setLiveFrame({
          sceneId: event.scene_id,
          image: imageUrl,
          placeholder: Boolean(event.data?.["placeholder"]),
        });
      }
    }

    async function hydrateThenSubscribe() {
      // A fresh mount (first visit, or navigating away from this screen and
      // back) opens a brand-new SSE connection, which never sees events an
      // earlier connection already drained — the backend's per-job queue is
      // single-consumer, not broadcast. History fetches the durable record
      // of everything that already happened and replays it through the same
      // handleEvent a live event would use, so state doesn't reset to
      // "pending" just because the page remounted.
      try {
        const history = await getEventHistory(jobId);
        if (cancelled) return;
        for (const event of history.events) handleEvent(event);
        if (history.status === "completed" || history.status === "failed") {
          // Terminal -- nothing more will ever arrive, so there's nothing
          // for a live connection to do (and no reason to leave an
          // EventSource open against a queue that's already closed).
          return;
        }
      } catch {
        // History fetch failed (e.g. backend restarted) -- fall through to
        // the live subscription, which will at least show whatever happens
        // from here on, same as before history existed.
      }

      if (cancelled) return;
      unsubscribe = subscribeToEvents(
        jobId,
        (event: RawEvent) => {
          setConnectionIssue(null); // a real event arrived, so we're not actually stuck
          handleEvent(event);
        },
        (issueState) => setConnectionIssue(issueState),
      );
    }

    void hydrateThenSubscribe();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [jobId]);

  const sceneTraces = useMemo(() => deriveSceneTraces(state), [state]);
  const finished = state.jobStatus === "completed";
  const failed = state.jobStatus === "failed";
  const sceneOrder = state.sceneOrder;
  const liveMeta = liveFrame ? scenesMeta[liveFrame.sceneId] : undefined;

  return (
    <PitchFrame
      status={failed ? "Run failed" : finished ? "Pass complete" : "Agent working"}
      active={!finished && !failed}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="border-b border-border px-6 py-8 md:px-10 lg:col-span-6 lg:border-b-0 lg:border-r">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link
              to="/scenes/$jobId"
              params={{ jobId }}
              className={`label border px-4 py-3 transition-colors ${
                finished
                  ? "border-foreground bg-foreground text-background hover:bg-accent"
                  : "pointer-events-none border-border text-muted-foreground"
              }`}
            >
              {finished ? "Review scenes →" : "Scenes unlock at pass end"}
            </Link>
          </div>

          <AgentTrace parseStatus={state.parseStatus} sceneTraces={sceneTraces} />

          {connectionIssue && !finished && !failed && (
            <p className="mt-4 text-xs text-muted-foreground">
              {connectionIssue === "reconnecting"
                ? "Connection interrupted — reconnecting…"
                : "Lost connection to the backend. The run itself is unaffected — refresh this page to reconnect and see live progress."}
            </p>
          )}

          {awaitingSceneSelection && (
            <div className="mt-6">
              <SceneSelectionPanel
                jobId={jobId}
                scenes={sceneOrder.map((id) => {
                  const meta = scenesMeta[id];
                  return {
                    id,
                    heading: meta?.heading ?? id,
                    title: meta?.title ?? id,
                    number: meta?.number ?? id,
                    synopsis: meta?.synopsis ?? "",
                  };
                })}
                onConfirmed={() => setAwaitingSceneSelection(false)}
              />
            </div>
          )}

          {awaitingCasting && (
            <div className="mt-6">
              <CastingPanel
                jobId={jobId}
                characters={characters}
                onConfirmed={() => setAwaitingCasting(false)}
              />
            </div>
          )}

          {failed && (
            <p className="mt-4 text-xs leading-relaxed text-destructive">
              {state.jobError ?? "The run failed. Check the backend logs."}
            </p>
          )}
        </div>

        <div className="px-6 py-8 md:px-10 lg:col-span-6">
          <div className="flex items-baseline justify-between border-b-2 border-foreground pb-2">
            <h2 className="font-display text-2xl font-bold tracking-tight">Live Frame</h2>
            <span className="label text-muted-foreground">{PROJECT.draft}</span>
          </div>

          <div className="mt-6 border border-border">
            {liveFrame?.image ? (
              <img
                src={liveFrame.image}
                alt={`Storyboard frame in progress — ${liveMeta?.heading ?? liveFrame.sceneId}`}
                width={1280}
                height={640}
                className="aspect-[2/1] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[2/1] w-full items-center justify-center bg-card text-center">
                <span className="label text-muted-foreground">
                  Waiting for the first storyboard frame…
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-border px-3 py-2">
              <span className="label text-muted-foreground">
                {liveMeta ? `Beat ${liveMeta.number} / ${liveMeta.heading}` : "—"}
              </span>
              <span className={`label ${finished ? "text-foreground" : "text-accent"}`}>
                {liveFrame?.placeholder ? "Placeholder" : finished ? "Locked" : "Rendering"}
              </span>
            </div>
          </div>

          <div className="my-6 rule-h animate-rule-draw" />

          <span className="label text-muted-foreground">Beat index</span>
          <div className="mt-3 grid grid-cols-2 gap-px sm:grid-cols-4">
            {sceneOrder.length === 0 ? (
              <p className="col-span-full text-xs text-muted-foreground">Parsing script…</p>
            ) : (
              sceneOrder.map((sceneId) => {
                const meta = scenesMeta[sceneId];
                const done = sceneTraces
                  .find((s) => s.sceneId === sceneId)
                  ?.steps.every((s) => s.status === "done");
                return (
                  <div
                    key={sceneId}
                    className={`border border-border p-3 ${done ? "" : "opacity-40"}`}
                  >
                    <span className={`label ${done ? "text-accent" : "text-muted-foreground"}`}>
                      {meta?.number ?? sceneId}
                    </span>
                    <p className="mt-1.5 text-[11px] leading-snug">{meta?.title ?? sceneId}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </PitchFrame>
  );
}
