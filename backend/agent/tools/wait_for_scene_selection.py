"""Tool: wait_for_scene_selection -- pauses the run so the user can pick which
parsed scenes actually get generated.

Same shape as wait_for_casting: a genuine pause on the SAME orchestrator run
via an asyncio.Event, resumed by the frontend's POST .../scenes/select --
rather than splitting into two separate orchestrator runs.

Unlike casting (where "nobody answered" degrades to "zero photos", a normal
and valid outcome), an unanswered scene selection can't degrade to "generate
zero scenes" -- that would be a broken, empty result. So an unanswered
timeout here instead defaults to the first 12 parsed scenes, keeping the run
moving rather than producing nothing.

Also narrows the job's character roster to only the selected scenes'
speakers, since wait_for_casting (called right after this) should only ask
about characters that will actually appear in the generated output.
"""

from __future__ import annotations

import asyncio

from agent.job_store import job_store
from agent.schemas import TraceEvent

SCENE_SELECTION_TIMEOUT_SECONDS = 300
MAX_SELECTED_SCENES = 12


def make_wait_for_scene_selection_tool(job_id: str):
    async def wait_for_scene_selection() -> dict:
        """MANDATORY step, always call this -- immediately after parse_script
        and before wait_for_casting or any other tool. It lets the user pick
        which of the parsed scenes (up to 12) actually get generated. Call
        this exactly once. Returns once the user submits a selection, or
        after a timeout if they never respond, in which case it falls back
        to the first 12 parsed scenes automatically. Only ever iterate over
        the scene ids in the returned selected_scene_ids for every later
        step -- ignore any parsed scene not in that list."""
        job_store.set_status(job_id, "waiting_for_scene_selection")
        await job_store.emit(job_id, TraceEvent(step="wait_for_scene_selection", status="started"))

        parsed_ids = job_store.parsed_scene_ids(job_id)
        default_selection = parsed_ids[:MAX_SELECTED_SCENES]

        try:
            await asyncio.wait_for(
                job_store.scene_selection_event_for(job_id).wait(), timeout=SCENE_SELECTION_TIMEOUT_SECONDS
            )
            selected = job_store.selected_scene_ids_for(job_id) or default_selection
        except asyncio.TimeoutError:
            selected = default_selection
            job_store.set_selected_scenes(job_id, selected)

        job_store.set_status(job_id, "running")

        speakers: list[str] = []
        seen = set()
        for scene_id in selected:
            scratch = job_store.scratch_for(job_id, scene_id)
            for line in scratch.get("dialogue_meta", []):
                name = (line.get("speaker") or "").strip()
                key = name.lower()
                if name and key not in seen:
                    seen.add(key)
                    speakers.append(name)
        job_store.set_characters(job_id, speakers)

        await job_store.emit(
            job_id,
            TraceEvent(
                step="wait_for_scene_selection",
                status="completed",
                data={"selected_scene_ids": selected},
            ),
        )
        return {"selected_scene_ids": selected}

    return wait_for_scene_selection
