"""In-memory job state + per-job SSE event queue.

Hackathon-scoped: a single Python process holds everything. This only works
correctly on Cloud Run with `--min-instances=1 --max-instances=1` (no
horizontal scaling, no multi-worker uvicorn) -- see README for the
GCS/Firestore/Redis upgrade path for a non-demo deployment.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field

from agent.schemas import Job, Scene, TraceEvent


@dataclass
class JobRecord:
    job: Job
    queue: "asyncio.Queue[TraceEvent | None]" = field(default_factory=asyncio.Queue)
    # Every event ever emitted for this job, in order -- the queue above is
    # single-consumer and drained as it's read, so a fresh SSE connection
    # (e.g. after navigating away from the Trace screen and back) sees none
    # of what already happened. This is the durable record a client replays
    # through the same reducer a live event would use, before subscribing to
    # the live queue for whatever comes next.
    event_log: list[TraceEvent] = field(default_factory=list)
    # scratch space tool calls accumulate into before assemble_output finalizes
    # a Scene -- e.g. {"S01": {"image_url": ..., "score": ..., "lines": {...}}}
    scratch: dict[str, dict] = field(default_factory=dict)
    # keyed by character name: {"photo_bytes": bytes, "photo_mime": str, ...}.
    # describe_character_reference adds a "description" alongside the photo
    # (it no longer deletes the photo -- generate_storyboard reads it later,
    # per scene, to keep that character's face consistent across frames).
    # Never written to disk (agent/storage.py's save_media is for durable
    # media; this stays in-memory only) and is unconditionally purged at the
    # end of every run -- see purge_character_photos.
    character_scratch: dict[str, dict] = field(default_factory=dict)
    # Chosen once at upload time (POST /api/scripts), applied to every
    # storyboard frame in the run -- see generate_storyboard.py's
    # STYLE_DIRECTIVES. "realistic" or "animated".
    visual_style: str = "realistic"
    casting_event: asyncio.Event = field(default_factory=asyncio.Event)
    scene_selection_event: asyncio.Event = field(default_factory=asyncio.Event)
    selected_scene_ids: list[str] = field(default_factory=list)
    # Generated once on first GET .../deck.pdf, served straight from memory on
    # every request after -- local file I/O + drawing only, no API calls, so
    # generation itself is already fast; this just avoids redoing it per click.
    pdf_cache: bytes | None = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}

    def create(self, visual_style: str = "realistic") -> str:
        job_id = uuid.uuid4().hex[:12]
        self._jobs[job_id] = JobRecord(job=Job(job_id=job_id), visual_style=visual_style)
        return job_id

    def visual_style_for(self, job_id: str) -> str:
        return self._jobs[job_id].visual_style

    def get(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    async def emit(self, job_id: str, event: TraceEvent) -> None:
        record = self._jobs.get(job_id)
        if record is None:
            return
        record.event_log.append(event)
        await record.queue.put(event)

    def event_log_for(self, job_id: str) -> list[TraceEvent]:
        return self._jobs[job_id].event_log

    async def close_stream(self, job_id: str) -> None:
        record = self._jobs.get(job_id)
        if record is None:
            return
        await record.queue.put(None)  # sentinel: tells the SSE route to stop

    def scratch_for(self, job_id: str, scene_id: str) -> dict:
        record = self._jobs[job_id]
        return record.scratch.setdefault(scene_id, {"lines": {}})

    def add_scene(self, job_id: str, scene: Scene) -> None:
        record = self._jobs[job_id]
        record.job.scenes[scene.id] = scene
        if scene.id not in record.job.scene_order:
            record.job.scene_order.append(scene.id)

    def set_status(self, job_id: str, status: str, error: str | None = None) -> None:
        record = self._jobs[job_id]
        record.job.status = status  # type: ignore[assignment]
        if error:
            record.job.error = error

    def ordered_scenes(self, job_id: str) -> list[Scene]:
        record = self._jobs[job_id]
        return [record.job.scenes[sid] for sid in record.job.scene_order if sid in record.job.scenes]

    def set_characters(self, job_id: str, names: list[str]) -> None:
        self._jobs[job_id].job.characters = names

    def character_scratch_for(self, job_id: str) -> dict[str, dict]:
        return self._jobs[job_id].character_scratch

    def casting_event_for(self, job_id: str) -> asyncio.Event:
        return self._jobs[job_id].casting_event

    def parsed_scene_ids(self, job_id: str) -> list[str]:
        """Scene ids in parse order -- scratch is a plain dict populated by
        parse_script's for-loop in scene order, and dict insertion order is
        guaranteed since Python 3.7, so this needs no separate bookkeeping."""
        return list(self._jobs[job_id].scratch.keys())

    def scene_selection_event_for(self, job_id: str) -> asyncio.Event:
        return self._jobs[job_id].scene_selection_event

    def set_selected_scenes(self, job_id: str, scene_ids: list[str]) -> None:
        self._jobs[job_id].selected_scene_ids = scene_ids

    def selected_scene_ids_for(self, job_id: str) -> list[str]:
        return self._jobs[job_id].selected_scene_ids

    def confirm_scene_selection(self, job_id: str, scene_ids: list[str]) -> None:
        record = self._jobs[job_id]
        record.selected_scene_ids = scene_ids
        record.scene_selection_event.set()

    def store_character_photo(self, job_id: str, character_name: str, data: bytes, mime: str) -> None:
        scratch = self._jobs[job_id].character_scratch
        entry = scratch.setdefault(character_name, {})
        entry["photo_bytes"] = data
        entry["photo_mime"] = mime

    def confirm_casting(self, job_id: str) -> None:
        self._jobs[job_id].casting_event.set()

    def pdf_cache_for(self, job_id: str) -> bytes | None:
        return self._jobs[job_id].pdf_cache

    def set_pdf_cache(self, job_id: str, data: bytes) -> None:
        self._jobs[job_id].pdf_cache = data

    def clear_pdf_cache(self, job_id: str) -> None:
        """Invalidates a cached deck PDF -- call after any edit to a scene's
        images (delete/regenerate) so the next .../deck.pdf request rebuilds
        it instead of serving a PDF with the old frame(s)."""
        self._jobs[job_id].pdf_cache = None

    def purge_character_photos(self, job_id: str) -> None:
        """The single point where uploaded photo bytes are deleted: called
        unconditionally in orchestrator.run_job's finally block. Covers both
        the normal case (a photo describe_character_reference/generate_storyboard
        used all run) and the safety-net case (describe_character_reference was
        never called for it, e.g. the run errored out early) -- a photo must
        never outlive the run it was uploaded for, either way."""
        for entry in self._jobs[job_id].character_scratch.values():
            entry.pop("photo_bytes", None)
            entry.pop("photo_mime", None)


job_store = JobStore()
