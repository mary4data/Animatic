import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { PitchFrame } from "@/components/pitch/PitchFrame";
import { CastingPanel } from "@/components/pitch/CastingPanel";
import { SceneSelectionPanel } from "@/components/pitch/SceneSelectionPanel";
import { PROJECT } from "@/lib/pitch-data";
import { getEventHistory, submitScript, subscribeToEvents, type VisualStyle } from "@/lib/api";
import type { RawEvent } from "@/lib/trace";
import { sampleScriptFile, SAMPLE_SCRIPT_TITLE } from "@/lib/sample-script";
import { uniqueSpeakers } from "@/lib/characters";
import { clearStoredJob, getStoredJob, setStoredJob } from "@/lib/session";

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
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("realistic");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [parsedScenes, setParsedScenes] = useState<ParsedSceneRaw[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [connectionIssue, setConnectionIssue] = useState<"reconnecting" | "closed" | null>(null);
  // A stored job that's already running/completed — offered as a dismissible
  // link, never a forced redirect (see the mount effect below): this page's
  // job is to let the user upload something, and a leftover session from an
  // earlier visit should never be able to block or hijack that.
  const [resumable, setResumable] = useState<{
    to: "/process/$jobId" | "/scenes/$jobId";
    jobId: string;
    label: string;
  } | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  // Flipped the instant a real upload starts, so a resume() from the mount
  // effect that's still in flight (awaiting getEventHistory) knows to
  // abandon whatever it was about to do instead of clobbering the new
  // upload's state out from under it.
  const supersededRef = useRef(false);
  // Not React state — every invocation of handleEvent below (whether from
  // history replay on resume or a live event) is the same function instance
  // for the life of the subscription, so this is shared across events
  // without the stale-closure trap state would have here (state captured at
  // callback definition time wouldn't see a later setState from an earlier
  // event).
  const selectedScenesRef = useRef<ParsedSceneRaw[]>([]);

  const handleEvent = useCallback(
    (forJobId: string, event: RawEvent) => {
      setConnectionIssue(null); // a real event arrived, so we're not actually stuck

      if (event.step === "parse_script" && event.status === "completed") {
        const scenes = (event.data?.["scenes"] as ParsedSceneRaw[] | undefined) ?? [];
        selectedScenesRef.current = scenes;
        setParsedScenes(scenes);
      }

      if (event.step === "wait_for_scene_selection" && event.status === "started") {
        setPhase("selecting");
      }

      // Narrows the roster to only the scenes the user actually kept,
      // before the casting panel (which reads `characters`) can render.
      if (event.step === "wait_for_scene_selection" && event.status === "completed") {
        const selectedIds = (event.data?.["selected_scene_ids"] as string[] | undefined) ?? [];
        selectedScenesRef.current = selectedScenesRef.current.filter((s) =>
          selectedIds.includes(s.id),
        );
        setCharacters(uniqueSpeakers(selectedScenesRef.current));
      }

      if (event.step === "wait_for_casting" && event.status === "started") {
        setPhase("casting");
      }

      // The authoritative "move on" signal — fires whether the user clicked
      // Continue in the panel below or the server-side timeout elapsed with
      // no response, so this works even if someone walks away mid-cast
      // rather than explicitly skipping. Process/$jobId.tsx hydrates its own
      // state from GET .../events/history on mount, so there's no handoff to
      // prepare here — it'll see the exact same events this page just did.
      // The stored job id deliberately isn't cleared here: navigating back
      // to "/" later should still resume (redirecting straight past this
      // page) rather than presenting a blank form for a run that's already
      // past this point.
      if (event.step === "wait_for_casting" && event.status === "completed") {
        setPhase("advancing");
        unsubscribeRef.current?.();
        navigate({ to: "/process/$jobId", params: { jobId: forJobId } });
      }

      if (event.step === "job_completed" && event.status === "failed") {
        unsubscribeRef.current?.();
        setError(event.detail ?? "The run failed before it could finish parsing.");
        setPhase("idle");
      }
    },
    [navigate],
  );

  // A script stays "loaded" across a refresh, or navigating back to this
  // page, until a new one is actually uploaded (see start() below) -- not
  // just lost because the tab reloaded mid-parse. Mirrors how
  // process/$jobId.tsx already survives a refresh via the job id in its URL
  // plus GET .../events/history; this page has no such URL param for the
  // pre-casting phases it drives, so the job id is kept in localStorage
  // instead (see lib/session.ts).
  useEffect(() => {
    const stored = getStoredJob();
    if (!stored) return;

    let cancelled = false;

    async function resume() {
      if (!stored) return;
      try {
        const history = await getEventHistory(stored.jobId);
        // A real upload may have started while this fetch was in flight
        // (see start()) -- if so, that upload owns the page now, and acting
        // on this stale result (however harmless it might look) is exactly
        // the kind of race that used to yank people away from a fresh
        // upload towards an unrelated old job. Bail unconditionally.
        if (cancelled || supersededRef.current) return;

        if (history.status === "completed") {
          setResumable({
            to: "/scenes/$jobId",
            jobId: stored.jobId,
            label: "your last finished pitch",
          });
          return;
        }
        if (history.status === "running") {
          // Casting is already done for this run -- process/$jobId owns
          // every phase from here on.
          setResumable({
            to: "/process/$jobId",
            jobId: stored.jobId,
            label: "your run in progress",
          });
          return;
        }
        if (history.status === "failed") {
          // Nothing to resume into and nothing worth offering a link to --
          // just drop it so a later visit starts clean.
          clearStoredJob();
          return;
        }

        // queued / waiting_for_scene_selection / waiting_for_casting -- still
        // in the part of the flow this page itself drives: replay what
        // already happened, then pick the live stream back up from here.
        setFile(stored.fileName);
        setJobId(stored.jobId);
        setPhase("parsing");
        for (const event of history.events) handleEvent(stored.jobId, event);
        if (cancelled || supersededRef.current) return;
        unsubscribeRef.current = subscribeToEvents(
          stored.jobId,
          (event: RawEvent) => handleEvent(stored.jobId, event),
          (state) => setConnectionIssue(state),
        );
      } catch {
        // The stored job is no longer resolvable (e.g. the backend
        // restarted and its in-memory store lost it) -- drop it rather than
        // getting stuck offering a link to a session that no longer exists.
        if (!cancelled && !supersededRef.current) clearStoredJob();
      }
    }

    void resume();
    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
    };
    // Deliberately mount-only: this resumes whatever was already in
    // localStorage when the page first loaded, not a reaction to state
    // start() itself already manages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async (uploaded: File) => {
    supersededRef.current = true;
    setResumable(null);
    unsubscribeRef.current?.();
    selectedScenesRef.current = [];
    setFile(uploaded.name);
    setPhase("uploading");
    setError(null);
    try {
      const { jobId: newJobId } = await submitScript(uploaded, visualStyle);
      setJobId(newJobId);
      setStoredJob(newJobId, uploaded.name);
      setPhase("parsing");

      unsubscribeRef.current = subscribeToEvents(
        newJobId,
        (event: RawEvent) => handleEvent(newJobId, event),
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
            <h2 className="font-display text-2xl font-bold tracking-tight">
              {phase === "selecting"
                ? "Pick Your Scenes"
                : phase === "casting"
                  ? "Cast Your Characters"
                  : "Upload Manuscript"}
            </h2>
            {phase !== "selecting" && phase !== "casting" && (
              <span className="label text-muted-foreground">PDF · FDX</span>
            )}
          </div>

          {resumable && (
            <div className="mt-4 flex items-center justify-between gap-3 border border-border bg-card px-4 py-3">
              <button
                type="button"
                onClick={() => navigate({ to: resumable.to, params: { jobId: resumable.jobId } })}
                className="label text-left text-accent underline underline-offset-4 hover:no-underline"
              >
                Continue {resumable.label} →
              </button>
              <button
                type="button"
                onClick={() => setResumable(null)}
                aria-label="Dismiss"
                className="label shrink-0 text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          )}

          {connectionIssue &&
            (phase === "parsing" || phase === "selecting" || phase === "casting") && (
              <p className="mt-3 text-xs text-muted-foreground">
                {connectionIssue === "reconnecting"
                  ? "Connection interrupted — reconnecting…"
                  : "Lost connection to the backend. The run itself is unaffected and will keep " +
                    "going — refresh this page to reconnect and see live progress."}
              </p>
            )}

          {phase === "selecting" && jobId ? (
            // Kept in this same quadrant (not a separate section further down
            // the page) so picking scenes right after upload needs no scroll.
            <div className="mt-4">
              <SceneSelectionPanel jobId={jobId} scenes={parsedScenes} onConfirmed={() => {}} />
            </div>
          ) : phase === "casting" && jobId ? (
            <div className="mt-4">
              <CastingPanel jobId={jobId} characters={characters} onConfirmed={() => {}} />
            </div>
          ) : (
            <>
              <div className="mt-6">
                <span className="label text-muted-foreground">Storyboard style</span>
                <div className="mt-2 grid grid-cols-2 gap-px">
                  {(
                    [
                      ["realistic", "Realistic", "Photoreal, cinematic, live-action look."],
                      ["animated", "Animated", "Illustrated, cel-shaded concept art."],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      disabled={busy}
                      aria-pressed={visualStyle === value}
                      onClick={() => setVisualStyle(value)}
                      className={`border p-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-50 ${
                        visualStyle === value
                          ? "border-accent bg-card"
                          : "border-border hover:border-foreground/40"
                      }`}
                    >
                      <span
                        className={`label block ${visualStyle === value ? "text-accent" : "text-foreground"}`}
                      >
                        {label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                        {hint}
                      </span>
                    </button>
                  ))}
                </div>
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
                className={`mt-4 flex aspect-[4/3] flex-col items-center justify-center border-2 border-dashed px-6 text-center transition-colors ${
                  dragging ? "border-accent bg-card" : "border-input"
                }`}
              >
                <div className="font-display text-5xl leading-none">+</div>
                <span className="label mt-4 text-muted-foreground">
                  {phase === "uploading"
                    ? "Uploading…"
                    : phase === "parsing"
                      ? "Parsing script…"
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
            </>
          )}
        </div>
      </div>
    </PitchFrame>
  );
}
