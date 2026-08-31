import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PitchFrame } from "@/components/pitch/PitchFrame";
import { CastingPanel } from "@/components/pitch/CastingPanel";
import { SceneSelectionPanel } from "@/components/pitch/SceneSelectionPanel";
import { PROJECT } from "@/lib/pitch-data";
import { submitScript, subscribeToEvents } from "@/lib/api";
import type { RawEvent } from "@/lib/trace";
import { sampleScriptFile, SAMPLE_SCRIPT_TITLE } from "@/lib/sample-script";
import { uniqueSpeakers } from "@/lib/characters";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Animatic — Turn a Screenplay Into a Visual Pitch" },
      {
        name: "description",
        content:
          "Animatic turns a screenplay into a storyboarded, scored and voiced pitch package — with the agent's every step visible.",
      },
      { property: "og:title", content: "Animatic — Turn a Screenplay Into a Visual Pitch" },
      {
        property: "og:description",
        content:
          "Upload a script excerpt and watch it become storyboards, mood and score notes, and voiced dialogue — step by visible step.",
      },
    ],
  }),
  component: Upload,
});

type ParsedSceneRaw = {
  id: string;
  heading: string;
  title: string;
  number: string;
  synopsis: string;
  dialogue: Array<{ speaker: string }>;
};
type Phase = "idle" | "uploading" | "parsing" | "selecting" | "casting" | "advancing";

function Upload() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [parsedScenes, setParsedScenes] = useState<ParsedSceneRaw[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [connectionIssue, setConnectionIssue] = useState<"reconnecting" | "closed" | null>(null);

  const start = async (uploaded: File) => {
    setFile(uploaded.name);
    setPhase("uploading");
    setError(null);
    try {
      const { jobId: newJobId } = await submitScript(uploaded);
      setJobId(newJobId);
      setPhase("parsing");

      // Plain closure variable, not React state — every invocation of the
      // callback below is the same function instance for the life of this
      // subscription, so this is shared across events without the stale-
      // closure trap state would have here (state captured at callback
      // definition time wouldn't see a later setState from an earlier event).
      let selectedScenes: ParsedSceneRaw[] = [];

      const unsubscribe = subscribeToEvents(
        newJobId,
        (event: RawEvent) => {
          setConnectionIssue(null); // a real event arrived, so we're not actually stuck

          if (event.step === "parse_script" && event.status === "completed") {
            const scenes = (event.data?.["scenes"] as ParsedSceneRaw[] | undefined) ?? [];
            selectedScenes = scenes;
            setParsedScenes(scenes);
          }

          if (event.step === "wait_for_scene_selection" && event.status === "started") {
            setPhase("selecting");
          }

          // Narrows the roster to only the scenes the user actually kept,
          // before the casting panel (which reads `characters`) can render.
          if (event.step === "wait_for_scene_selection" && event.status === "completed") {
            const selectedIds = (event.data?.["selected_scene_ids"] as string[] | undefined) ?? [];
            selectedScenes = selectedScenes.filter((s) => selectedIds.includes(s.id));
            setCharacters(uniqueSpeakers(selectedScenes));
          }

          if (event.step === "wait_for_casting" && event.status === "started") {
            setPhase("casting");
          }

          // The authoritative "move on" signal — fires whether the user
          // clicked Continue in the panel below or the server-side timeout
          // elapsed with no response, so this works even if someone walks
          // away mid-cast rather than explicitly skipping. Process/$jobId.tsx
          // hydrates its own state from GET .../events/history on mount, so
          // there's no handoff to prepare here — it'll see the exact same
          // events this page just did.
          if (event.step === "wait_for_casting" && event.status === "completed") {
            setPhase("advancing");
            unsubscribe();
            navigate({ to: "/process/$jobId", params: { jobId: newJobId } });
          }

          if (event.step === "job_completed" && event.status === "failed") {
            unsubscribe();
            setError(event.detail ?? "The run failed before it could finish parsing.");
            setPhase("idle");
          }
        },
        (state) => setConnectionIssue(state),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Is the backend running?");
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";

  return (
    <PitchFrame
      status={
        phase === "casting"
          ? "Casting"
          : phase === "selecting"
            ? "Selecting scenes"
            : busy
              ? "Working"
              : "Awaiting script"
      }
      active={busy}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="border-b border-border px-6 py-10 md:px-10 lg:col-span-7 lg:border-b-0 lg:border-r">
          <span className="label text-muted-foreground">Animatic · Production Document</span>
          <h1 className="mt-6 max-w-[18ch] font-display text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-7xl">
            A script goes in. A pitch comes out.
          </h1>
          <p className="mt-6 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            Drop in an excerpt and Animatic works it scene by scene — parsing the pages, pulling a
            grounded style reference, boarding each beat, and voicing the dialogue. Every step stays
            on the page where you can read it.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-px sm:grid-cols-3">
            {[
              ["01", "Boarded", "One frame per beat, grounded on cited reference."],
              ["02", "Scored", "A mood and score line, not a mood board."],
              ["03", "Voiced", "Read aloud in a consistent voice for each character."],
            ].map(([n, t, d]) => (
              <div key={n} className="border border-border p-4">
                <span className="label text-accent">{n}</span>
                <p className="mt-2 font-display text-lg font-bold">{t}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-10 md:px-10 lg:col-span-5">
          <div className="flex items-baseline justify-between border-b-2 border-foreground pb-2">
            <h2 className="font-display text-2xl font-bold tracking-tight">Upload Manuscript</h2>
            <span className="label text-muted-foreground">PDF · FDX</span>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (busy) return;
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) void start(dropped);
            }}
            className={`mt-6 flex aspect-[4/3] flex-col items-center justify-center border-2 border-dashed px-6 text-center transition-colors ${
              dragging ? "border-accent bg-card" : "border-input"
            }`}
          >
            <div className="font-display text-5xl leading-none">+</div>
            <span className="label mt-4 text-muted-foreground">
              {phase === "uploading"
                ? "Uploading…"
                : phase === "parsing"
                  ? "Parsing script…"
                  : phase === "selecting"
                    ? "Choose your scenes below…"
                    : file
                      ? `Loaded ${file}`
                      : "Drop a script excerpt"}
            </span>
            <label className="label mt-5 cursor-pointer border border-foreground px-4 py-2 transition-colors hover:bg-foreground hover:text-background">
              Choose file
              <input
                type="file"
                accept=".pdf,.fdx,.txt"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) void start(picked);
                }}
              />
            </label>
          </div>

          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

          {connectionIssue &&
            (phase === "parsing" || phase === "selecting" || phase === "casting") && (
              <p className="mt-3 text-xs text-muted-foreground">
                {connectionIssue === "reconnecting"
                  ? "Connection interrupted — reconnecting…"
                  : "Lost connection to the backend. The run itself is unaffected and will keep " +
                    "going — refresh this page to reconnect and see live progress."}
              </p>
            )}

          <button
            type="button"
            disabled={busy}
            onClick={() => void start(sampleScriptFile())}
            className="label mt-px w-full border border-border bg-foreground px-4 py-4 text-background transition-colors hover:bg-accent disabled:opacity-50"
          >
            Try the sample script — {SAMPLE_SCRIPT_TITLE}
          </button>

          <dl className="mt-8 divide-y divide-border border-y border-border">
            {[["Excerpt", "up to 20 scenes parsed, pick up to 12"]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-3">
                <dt className="label text-muted-foreground">{k}</dt>
                <dd className="text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {phase === "selecting" && jobId && (
        <div className="border-t border-border px-6 py-10 md:px-10">
          <SceneSelectionPanel jobId={jobId} scenes={parsedScenes} onConfirmed={() => {}} />
        </div>
      )}

      {phase === "casting" && jobId && (
        <div className="border-t border-border px-6 py-10 md:px-10">
          <CastingPanel jobId={jobId} characters={characters} onConfirmed={() => {}} />
        </div>
      )}
    </PitchFrame>
  );
}
