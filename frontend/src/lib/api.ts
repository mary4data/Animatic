import type { Scene } from "@/lib/pitch-data";
import type { RawEvent } from "@/lib/trace";

const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] as string | undefined;

if (!API_BASE_URL && typeof window !== "undefined") {
  console.warn("VITE_API_BASE_URL is not set — API calls will fail. See frontend/.env.example.");
}

function apiUrl(path: string): string {
  return `${API_BASE_URL ?? ""}${path}`;
}

export type VisualStyle = "realistic" | "animated";

export async function submitScript(
  file: File,
  visualStyle: VisualStyle = "realistic",
): Promise<{ jobId: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("visual_style", visualStyle);
  const res = await fetch(apiUrl("/api/scripts"), { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { job_id: string };
  return { jobId: data.job_id };
}

// Wire shapes from the backend (snake_case, matches backend/agent/schemas.py).
type RawDialogueLine = {
  id: string;
  speaker: string;
  line: string;
  intent: string;
  direction: string | null;
  audio_url: string | null;
};

type RawSceneReference = {
  caption: string;
  notes: string[];
  source_url: string | null;
  image: string | null;
};

type RawSceneImage = {
  beat: string;
  url: string;
  order: number;
};

type RawScene = {
  id: string;
  slug: string;
  number: string;
  heading: string;
  title: string;
  images: RawSceneImage[];
  mood: string | null;
  score: string | null;
  synopsis: string;
  dialogue: RawDialogueLine[];
  duration: string | null;
  reference: RawSceneReference | null;
};

// Mapped to the frontend's existing camelCase Scene shape rather than
// changing every component prop.
function mapScene(raw: RawScene): Scene {
  return {
    id: raw.id,
    slug: raw.slug,
    number: raw.number,
    heading: raw.heading,
    title: raw.title,
    images: raw.images,
    mood: raw.mood,
    score: raw.score,
    synopsis: raw.synopsis,
    duration: raw.duration,
    dialogue: raw.dialogue.map((d) => ({
      id: d.id,
      speaker: d.speaker,
      line: d.line,
      intent: d.intent,
      direction: d.direction,
      audioUrl: d.audio_url,
    })),
    reference: raw.reference
      ? {
          caption: raw.reference.caption,
          notes: raw.reference.notes,
          sourceUrl: raw.reference.source_url,
          image: raw.reference.image,
        }
      : null,
  };
}

export async function getScenes(jobId: string): Promise<{
  status: "queued" | "running" | "completed" | "failed";
  error: string | null;
  scenes: Scene[];
}> {
  const res = await fetch(apiUrl(`/api/scripts/${jobId}/scenes`));
  if (!res.ok) throw new Error(`Failed to fetch scenes: ${res.status}`);
  const data = (await res.json()) as {
    status: "queued" | "running" | "completed" | "failed";
    error: string | null;
    scenes: RawScene[];
  };
  return { status: data.status, error: data.error, scenes: data.scenes.map(mapScene) };
}

/** Uploads an optional reference photo for a character (see CastingPanel) —
 * used only to derive a general text description server-side, never fed
 * into image generation, and deleted right after that description is made. */
export async function uploadCharacterPhoto(
  jobId: string,
  characterName: string,
  file: File,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    apiUrl(`/api/scripts/${jobId}/characters/${encodeURIComponent(characterName)}/photo`),
    {
      method: "POST",
      body: form,
    },
  );
  if (!res.ok) throw new Error(`Failed to upload photo: ${res.status} ${await res.text()}`);
}

/** Resumes the paused agent run — with or without any photos uploaded. */
export async function confirmCasting(jobId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/scripts/${jobId}/casting/confirm`), { method: "POST" });
  if (!res.ok) throw new Error(`Failed to confirm casting: ${res.status} ${await res.text()}`);
}

/** Removes one storyboard frame from a scene. Returns the scene's remaining
 * frames so the caller can update local state without a full re-fetch. */
export async function deleteSceneImage(
  jobId: string,
  sceneId: string,
  order: number,
): Promise<{ images: RawSceneImage[] }> {
  const res = await fetch(apiUrl(`/api/scripts/${jobId}/scenes/${sceneId}/images/${order}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete frame: ${res.status} ${await res.text()}`);
  return (await res.json()) as { images: RawSceneImage[] };
}

/** Re-renders one existing frame in place (same beat, a fresh image) and
 * returns it — the URL changes even though the beat/order don't, so callers
 * should replace rather than merge into their existing image list. */
export async function regenerateSceneImage(
  jobId: string,
  sceneId: string,
  order: number,
): Promise<{ image: RawSceneImage }> {
  const res = await fetch(
    apiUrl(`/api/scripts/${jobId}/scenes/${sceneId}/images/${order}/regenerate`),
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Failed to regenerate frame: ${res.status} ${await res.text()}`);
  return (await res.json()) as { image: RawSceneImage };
}

/** Fetches the generated pitch-deck PDF as a blob, for a completed job.
 * Cached server-side after the first call, so a repeat click is fast. */
export async function fetchDeckPdf(jobId: string): Promise<Blob> {
  const res = await fetch(apiUrl(`/api/scripts/${jobId}/deck.pdf`));
  if (!res.ok) throw new Error(`Failed to generate PDF: ${res.status} ${await res.text()}`);
  return res.blob();
}

/** Resumes the paused agent run with the chosen scene ids (max 12) — only
 * these scenes get boarded, scored, and voiced. */
export async function selectScenes(jobId: string, sceneIds: string[]): Promise<void> {
  const res = await fetch(apiUrl(`/api/scripts/${jobId}/scenes/select`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scene_ids: sceneIds }),
  });
  if (!res.ok) throw new Error(`Failed to select scenes: ${res.status} ${await res.text()}`);
}

/** Every event the job has ever emitted, for hydrating a fresh page load
 * (a new SSE connection never sees events an earlier connection already
 * drained — the backend's per-job queue is single-consumer, not broadcast).
 * `status` is the job's current status, so the caller can skip opening a
 * live connection entirely when the run is already done. */
export async function getEventHistory(
  jobId: string,
): Promise<{ status: string; events: RawEvent[] }> {
  const res = await fetch(apiUrl(`/api/scripts/${jobId}/events/history`));
  if (!res.ok) throw new Error(`Failed to fetch event history: ${res.status}`);
  return (await res.json()) as { status: string; events: RawEvent[] };
}

/**
 * Subscribes to the job's SSE event stream. Returns an unsubscribe function.
 *
 * Fallback note: if SSE proves unreliable (proxy buffering, older browsers),
 * poll GET /api/scripts/:jobId/scenes on an interval instead — the scenes
 * endpoint is idempotent and safe to poll.
 *
 * `onConnectionIssue` is optional and was missing entirely until this was
 * flagged as a real gap: a dropped connection previously failed completely
 * silently (no error, no retry visibility) — from the outside, that looks
 * identical to the page just being broken. The browser's EventSource retries
 * automatically on its own (per the SSE spec) unless it's been explicitly
 * closed, so "reconnecting" here is usually transient, not fatal — but the
 * caller can now at least show *something* instead of a silent hang.
 */
export function subscribeToEvents(
  jobId: string,
  onEvent: (event: RawEvent) => void,
  onConnectionIssue?: (state: "reconnecting" | "closed") => void,
): () => void {
  const source = new EventSource(apiUrl(`/api/scripts/${jobId}/events`));
  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as RawEvent);
    } catch {
      // ignore malformed frames
    }
  };
  source.onerror = () => {
    onConnectionIssue?.(source.readyState === EventSource.CLOSED ? "closed" : "reconnecting");
  };
  return () => source.close();
}
