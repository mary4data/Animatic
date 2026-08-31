"""Pydantic models shared between the agent tools, the job store, and the API layer.

These mirror the frontend's `Scene`/`TraceStep` shapes in
frontend/src/lib/pitch-data.ts as closely as possible so the API layer can
serialize them with no translation step.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TraceStatus = Literal["done", "running", "pending"]

# Documented, not enforced by pydantic -- the terminal "job_completed" event
# doesn't belong to any one tool, so `step` stays a free-form str below.
STEP_IDS = (
    "parse_script",
    "ground_visual_style",
    "generate_storyboard",
    "generate_score",
    "generate_voice_lines",
    "assemble_output",
)


class TraceEvent(BaseModel):
    """One SSE payload. `status` is tool-local ("started"/"completed"/...),
    not the frontend's TraceStatus -- the frontend derives TraceStatus per
    step from the sequence of these events (see AgentTrace.tsx)."""

    step: str
    status: str
    scene_id: str | None = None
    line_id: str | None = None
    detail: str | None = None
    data: dict | None = None


class DialogueLine(BaseModel):
    id: str
    speaker: str
    line: str
    intent: str
    direction: str | None = None
    audio_url: str | None = None


class SceneReference(BaseModel):
    caption: str
    notes: list[str] = Field(default_factory=list)
    source_url: str | None = None
    image: str | None = None  # best-effort; absent when Parallel result had no image


class SceneImage(BaseModel):
    beat: str
    url: str
    order: int


class Scene(BaseModel):
    id: str
    slug: str
    number: str
    heading: str
    title: str
    images: list[SceneImage] = Field(default_factory=list)
    mood: str | None = None
    score: str | None = None
    synopsis: str
    dialogue: list[DialogueLine]
    duration: str | None = None
    reference: SceneReference | None = None


class ParsedScene(BaseModel):
    """What parse_script extracts, before grounding/generation fill in the rest."""

    id: str
    slug: str
    number: str
    heading: str
    title: str
    location: str
    action: str
    synopsis: str
    dialogue: list[DialogueLine]


class Job(BaseModel):
    job_id: str
    status: Literal[
        "queued", "running", "waiting_for_scene_selection", "waiting_for_casting", "completed", "failed"
    ] = "queued"
    error: str | None = None
    scenes: dict[str, Scene] = Field(default_factory=dict)
    scene_order: list[str] = Field(default_factory=list)
    characters: list[str] = Field(default_factory=list)

    class Config:
        arbitrary_types_allowed = True
