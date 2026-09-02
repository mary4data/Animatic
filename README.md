# Animatic

Turns a script excerpt (PDF, FDX, or plain text) into a pitch-ready package: parses up
to 20 scenes, lets the user pick up to 12 to actually produce, lets the user optionally
cast each character from a reference photo, then generates — per scene — up to 3
crossfaded storyboard frames (never more than the scene has dialogue lines), a
one-line temp-score description, and voiced dialogue,
all visible step by step as the agent works. The finished package exports as a
printable PDF pitch deck.

Built for **Agentic Cinema: The Summer Blockbuster Hackathon**, targeting the
**Parallel** partner track (see "How Parallel is used" below).

**Demo video:** [youtube.com/watch?v=1rRlX1GPeu4](https://www.youtube.com/watch?v=1rRlX1GPeu4)

## What it solves

Most scripts never get visualized for a pitch because concept art, composers, and
voice actors are too expensive at the development stage. Animatic gives a writer
or producer a fast, visible first pass — and shows its work at every step, not just
the final output.

## Architecture

Two views of the same run: **what talks to what** (below), then **the order the agent
calls its tools**.

```mermaid
flowchart LR
    subgraph FE["Frontend · TanStack Start / React (SSR)"]
        direction TB
        UP["Upload"]
        SEL["Select scenes"]
        CST["Cast"]
        PRC["Process<br/>(live trace)"]
        SCN["Scenes"]
        DCK["Deck"]
        UP --> SEL --> CST --> PRC --> SCN --> DCK
    end

    subgraph BE["Backend · FastAPI"]
        direction TB
        API["api/routes.py"]
        STORE[("job_store<br/>job state · photo scratch<br/>per-job SSE queue")]
        DISK[("/media on local disk<br/>frames .jpg · voice .wav")]
        PDFGEN["pdf.py · reportlab"]
    end

    ORCH["<b>agent/orchestrator.py</b><br/>one Google ADK Agent (Gemini)<br/>9 FunctionTools, model-chosen order"]

    GEM["Gemini API<br/>text · image · TTS"]
    PAR["Parallel Search API"]

    UP -->|"POST /api/scripts"| API
    SEL -->|"POST …/scenes/select"| API
    CST -->|"POST …/characters/:name/photo<br/>POST …/casting/confirm"| API
    API -->|"create_task(run_job)"| ORCH
    API -->|"sets the asyncio.Event<br/>a paused tool waits on"| STORE
    STORE -.->|"resumes the same run"| ORCH
    ORCH -->|"one JSON trace event<br/>per tool start / finish"| STORE
    STORE -->|"SSE GET …/events<br/>+ /events/history replay"| PRC
    ORCH -->|"writes frames + audio"| DISK
    API -->|"GET …/scenes"| SCN
    DISK -->|"GET /media/…"| SCN
    DCK -->|"GET …/deck.pdf"| PDFGEN
    ORCH ==>|"function-calling loop"| GEM
    ORCH ==>|"ground_visual_style"| PAR

    classDef ext fill:#fdf1dc,stroke:#a8620a,color:#1a1a1a;
    classDef agent fill:#e6f0fd,stroke:#1a56b8,color:#1a1a1a;
    class GEM,PAR ext;
    class ORCH agent;
```

**Run order.** Bold names are the 9 ADK tools; ⏸ marks the two human-in-the-loop
pauses, which block the *same* agent run rather than splitting it into two.

```mermaid
flowchart TB
    START(["POST /api/scripts"]) --> P

    P["<b>parse_script</b><br/>≤ 20 scenes, dialogue lines + intent"]
    W1["⏸ <b>wait_for_scene_selection</b><br/>blocks on asyncio.Event<br/>timeout → first 12 scenes"]
    W2["⏸ <b>wait_for_casting</b><br/>blocks on asyncio.Event<br/>5-min timeout → zero photos"]
    D["<b>describe_character_reference</b><br/>once per uploaded photo · Gemini text"]

    P --> W1 --> W2 --> D

    subgraph LOOP["then for each selected scene, in order (≤ 12 scenes)"]
        direction TB
        G["<b>ground_visual_style</b><br/>Parallel Search · real network call"]
        B["<b>generate_storyboard</b><br/>Gemini image · ≤ 3 frames<br/>(≤ 1 per dialogue line, + cast photo)"]
        S["<b>generate_score</b><br/>Gemini text · temp-score line"]
        V["<b>generate_voice_lines</b><br/>Gemini TTS · one call per line"]
        A["<b>assemble_output</b><br/>finalize the scene"]
        G --> B --> S --> V --> A
    end

    D --> G
    A -.->|"next selected scene"| G
    A --> DONE(["job_completed<br/>→ Scenes · Deck · deck.pdf"])

    classDef pause fill:#fdf1dc,stroke:#a8620a,color:#1a1a1a;
    class W1,W2 pause;
```

The frontend is the existing Lovable export at [`/frontend`](frontend) — integrated,
not rebuilt. The backend is new, at [`/backend`](backend).

## How Gemini + ADK are used

The orchestrator ([`backend/agent/orchestrator.py`](backend/agent/orchestrator.py)) is
a single [Google ADK](https://google.github.io/adk-docs/) `Agent`, backed by Gemini,
with all 9 pipeline steps registered as `FunctionTool`s. **The pipeline is not a
hardcoded script** — the agent's instruction states the policy (parse once → let the
user pick scenes → let the user cast characters → per scene: ground → board → score →
voice each line → assemble), and the *model* decides, from each tool's return value,
when a step's preconditions are satisfied and what to call next.

**Design choice, called out explicitly:** rather than parsing ADK's internal
`Event`/`FunctionCall` stream to drive the frontend's live trace (fragile, and hard
to shape exactly to the frontend's needs under hackathon time pressure), each tool
function pushes its own structured JSON event onto the job's queue at start/completion.
This is what `GET /api/scripts/:job_id/events` streams out over SSE, and what
`GET /api/scripts/:job_id/events/history` replays for a client that connects (or
reconnects) after some of that already happened. The 9 tools still fully satisfy the
"agentic, model-driven" requirement — this only changes how we *observe* the run, not
who decides what happens in it.

**Two genuine human-in-the-loop pauses, same run.** `wait_for_scene_selection`
(`backend/agent/tools/wait_for_scene_selection.py`) and `wait_for_casting`
(`backend/agent/tools/wait_for_casting.py`) each block the *same* orchestrator run on
an `asyncio.Event`, resumed by a frontend `POST` (`.../scenes/select`,
`.../casting/confirm`) — rather than splitting the job into two separate agent runs.
Both are mandatory for the model to call, but optional for the user to answer: an
unanswered casting pause degrades, after a 5-minute timeout, to "zero photos" (a
normal, valid outcome). An unanswered scene-selection pause can't degrade the same
way — "generate nothing" would be a broken result — so it times out to the first 12
parsed scenes instead, keeping the run moving.

**Cast-photo consistency, and its lifecycle.** An uploaded reference photo is sent to
a Gemini text call (`describe_character_reference.py`) for a short casting note
(approximate age range, build, hair, general coloring), *and* the raw photo bytes are
attached directly to every `generate_storyboard` image-generation call for that
character's scenes (`generate_storyboard.py`), so the same face recurs across frames
instead of a new one being invented per call. The photo is kept in the job's
in-memory scratch state for the run and deleted unconditionally at the end of it —
`job_store.purge_character_photos`, called in `orchestrator.run_job`'s `finally` block
— whether the run succeeded, failed, or never got to `describe_character_reference` at
all. It is never written to disk and never outlives the run it was uploaded for.

*Note: an earlier build also had a self-QC step here — sending each generated voice
line back to Gemini as multimodal audio input to check whether the delivery matched
the line's intended emotion, with one retry on mismatch. That tool
(`check_tone_match`) has since been removed from the tool set; `generate_voice_lines`
now asks Gemini TTS to read each line "with {intent}" and takes that as final, with no
listen-back check. See "Scope cuts" below.*

## How Parallel is used

`backend/agent/tools/ground_visual_style.py` calls the **Parallel Search API** (via
the `parallel-web` SDK) at runtime, once per scene, before that scene's storyboard is
generated — this is a real network call during agent execution, not a mention in a
doc. It searches for a stylistic/visual reference matching the scene's mood and
location, and the resulting text summary is folded directly into the image prompt
for `generate_storyboard`. The grounding panel in the Scenes view ("Why this looks
this way") shows the real caption, excerpt notes, and source URL Parallel returned.

Parallel's Search API guarantees `title`/`url`/`excerpts`, not an image field, so the
reference image shown alongside that text is **best-effort**: the tool opportunistically
reads an image URL off the result if the SDK response happens to carry one, and falls
back to a text-only grounding panel when it doesn't.

## Scope cuts (hackathon time budget)

- **Up to 20 scenes parsed per run, up to 12 selected for generation** — hard caps in
  `parse_script` (`MAX_SCENES`) and `wait_for_scene_selection` (`MAX_SELECTED_SCENES`),
  not the whole script if it runs longer than that.
- **Imagen 3 substituted with Gemini's own native image model** — originally planned
  as Imagen 3 via Vertex AI per the hackathon spec, but Imagen 3 returned `404 ...
  your project does not have access to it` (needs separate allowlisting we don't
  have). Substituted with `gemini-3.1-flash-image` by default, via the same Developer
  API key already used for text/TTS — no Vertex/ADC needed — which the hackathon spec
  explicitly allows ("a placeholder/simpler image model if Imagen access/quota is an
  issue"). Each scene gets up to 3 frames (one per identified visual beat, capped at
  one frame per dialogue line, crossfaded in the frontend), and each frame falls
  back individually to a generated placeholder if
  its own call fails, rather than crashing the scene — visible in the trace
  (`detail: "placeholder frame (...)"`), not silently swapped in.
- **No tone/emotion QC pass on generated voice lines** — see the note at the end of
  "How Gemini + ADK are used"; a prior self-QC + retry step was removed and has not
  been reinstated.
- **Text-only temp-score description**, not audio — Lyria audio synthesis is future
  work, not built here.
- **Single-speaker Gemini TTS**, one call per dialogue line, labeled by speaker —
  multi-speaker mode is a preview feature gated by API tier; this works on any tier.
- **`.fdx` (Final Draft XML) uploads are read as plain text**, not properly parsed —
  the upload UI accepts them, but there's no XML-aware extraction. `.pdf` is parsed
  properly (via `pypdf`); use `.pdf`/`.txt` for reliable extraction.
- **Deck PDF export is real** (`GET /api/scripts/:job_id/deck.pdf`, rendered with
  `reportlab`, cached in memory after the first request) — the **share button is
  still an inert stub** in the UI, flagged rather than silently implemented or
  removed. See "Future work".
- **Job state is in-memory** (Python dict + `asyncio.Queue`, including the
  in-progress character-photo scratch), and generated media is written to local disk
  — see "Known limitations" below before deploying beyond a single demo instance.

## Repo layout

```
/frontend   existing Lovable export (TanStack Start / React), integrated in place
/backend
  /agent
    orchestrator.py   ADK Agent + instruction + tool registration
    schemas.py        pydantic models (Scene, TraceEvent, Job, ...)
    job_store.py       in-memory job state, character-photo scratch, per-job SSE queue
    pdf.py              deck.pdf rendering (reportlab) — plain function, not an agent tool
    clients.py, storage.py
    tools/             the 9 tools, one file each: parse_script,
                        wait_for_scene_selection, wait_for_casting,
                        describe_character_reference, ground_visual_style,
                        generate_storyboard, generate_score, generate_voice_lines,
                        assemble_output
  /api
    main.py            FastAPI app, CORS, static /media mount
    routes.py           POST /api/scripts, GET .../events (SSE + /history),
                         GET .../scenes, POST .../scenes/select,
                         POST .../characters/:name/photo, POST .../casting/confirm,
                         GET .../deck.pdf
  /scripts              smoke_<tool-or-flow>.py — test each tool/flow in isolation
  /storage               generated images/audio (gitignored)
LICENSE (MIT)
```

## Setup — backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in the keys below
```

You need, in `.env`:

| Key | Where to get it | Used for |
| --- | --- | --- |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | ADK orchestrator, parse/score, casting descriptions, TTS, storyboard images |
| `PARALLEL_API_KEY` | [platform.parallel.ai](https://platform.parallel.ai) | `ground_visual_style` |

That's it — no GCP project or Application Default Credentials needed for the current
build. (`GOOGLE_CLOUD_PROJECT`/Vertex AI vars are still in `.env.example`, unused, only
in case you get real Imagen 3 access later — see "Scope cuts" above.)

**Test tools in isolation before trusting the full loop** (per-tool smoke scripts, see
`backend/scripts/`):

```bash
python scripts/smoke_parse_script.py
python scripts/smoke_ground_visual_style.py      # real Parallel Search call
python scripts/smoke_generate_storyboard.py      # real Gemini image call (or placeholder fallback)
python scripts/smoke_generate_score.py
python scripts/smoke_casting.py <photo.jpg>      # wait_for_casting timeout path + describe_character_reference
python scripts/smoke_full_pipeline.py            # ground → board → score → voice → assemble, one scene
python scripts/smoke_orchestrator.py             # the real ADK agent loop, full script (both pauses included)
```

**Gemini API key troubleshooting:** if `smoke_orchestrator.py` or `smoke_generate_score.py`
fail with `404 NOT_FOUND ... no longer available to new users`, the pinned model name in
`GEMINI_TEXT_MODEL` has been deprecated for new keys — this already happened once during
development (`gemini-2.5-flash` → deprecated), which is why the default is
`gemini-flash-latest`, a self-updating alias, rather than a pinned version. If you see a
`429 RESOURCE_EXHAUSTED ... prepayment credits are depleted` instead, that's unrelated to
the model name — go to [ai.studio/projects](https://ai.studio/projects) and add
billing/credits to the project your API key belongs to.

Then run the API:

```bash
uvicorn api.main:app --reload --port 8000
```

Sanity-check it directly:

```bash
curl -F "file=@/path/to/script.txt" localhost:8000/api/scripts   # -> {"job_id": "..."}
curl -N localhost:8000/api/scripts/<job_id>/events                # watch the SSE stream
curl localhost:8000/api/scripts/<job_id>/scenes                   # finished scenes
```

## Setup — frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev
```

Open the printed local URL, upload a script (or click "Try the sample script"), and
watch it move through Upload → Select scenes → Cast → Process → Scenes → Deck.

## Known limitations

- **Single-instance only.** The job store and SSE queues are an in-memory Python
  dict — they are not shared across multiple Cloud Run instances or worker
  processes. Deploy the backend with `--min-instances=1 --max-instances=1` (see
  below) for the hackathon demo. A real deployment would move this to
  GCS (media) + Firestore/Redis (job state + pub/sub) — not built here.
- **SSE, no polling fallback implemented.** The API contract allows polling
  `GET .../scenes` as a fallback if SSE proves unreliable under review, but SSE
  wired up cleanly in this build, so polling isn't implemented. If it needs to
  change, `frontend/src/lib/api.ts` documents where to add it. (A dropped SSE
  connection is at least surfaced to the user now — `subscribeToEvents`'s
  `onConnectionIssue` callback — rather than failing silently.)
- **Casting and scene-selection pauses live only in the job's in-memory state.**
  Like the rest of job state, a pending `wait_for_casting`/
  `wait_for_scene_selection` pause does not survive a backend restart —
  consistent with "Job state is in-memory" above, called out separately here
  because these two pauses can leave a run genuinely blocked mid-flight, not
  just a finished job's data unavailable.

## Deploying

### Backend → Cloud Run

```bash
cd backend
gcloud run deploy pitch-bible-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 1 \
  --set-env-vars GEMINI_API_KEY=...,PARALLEL_API_KEY=...,ALLOWED_ORIGINS=https://your-frontend-url,PUBLIC_BASE_URL=https://your-backend-url.a.run.app
```

`PUBLIC_BASE_URL` and `ALLOWED_ORIGINS` need the *actual* deployed URLs — you'll
likely deploy once to learn the backend's URL, then redeploy both services with the
real values filled in.

### Frontend → Cloud Run

The Lovable export's Vite config defaults to a Cloudflare Workers build target;
`frontend/vite.config.ts` overrides this to Nitro's `node-server` preset so it can
run as a plain Node container instead (see the comment there).

```bash
cd frontend
gcloud run deploy pitch-bible-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --build-arg VITE_API_BASE_URL=https://your-backend-url.a.run.app
```

`VITE_API_BASE_URL` is a **build-time** value (Vite inlines it into the client
bundle) — never hardcode a localhost/preview URL; pass the real deployed backend URL
as a build arg, per `frontend/Dockerfile`.

### Manual setup you'll need to do once

1. A GCP project with the **Cloud Run API** enabled, to deploy the backend and frontend
   containers (Vertex AI is not needed — see "Scope cuts" above).
2. Get a Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
3. Get a Parallel API key from [platform.parallel.ai](https://platform.parallel.ai).
4. After first deploy, update `ALLOWED_ORIGINS` (backend) and `VITE_API_BASE_URL`
   (frontend build arg) with each other's real URLs and redeploy both.

## Demo flow

Upload a script (or use the sample) → parse completes, then pick up to 12 of the
parsed scenes in the scene-selection panel → optionally upload a reference photo per
character in the casting panel (or skip) → watch the Process screen work through
ground → board → score → voice → assemble per scene, live over SSE, with the live
storyboard frame streaming in as each beat renders → open Scenes for the finished
storyboard/score/voiced-dialogue package → open Deck for the assembled view and export
the pitch package as a PDF.

## Future work

- Lyria-based temp-score audio (currently text-only).
- A tone/emotion QC pass on generated voice lines (a prior build had one; it isn't in
  the current tool set — see "How Gemini + ADK are used").
- Deck share-link (export-to-PDF is now real; share is still an inert stub in the UI).
- GCS + Firestore/Redis backing store, to run beyond a single Cloud Run instance.
- Proper `.fdx` (Final Draft XML) parsing.
