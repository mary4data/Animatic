
"""Tool: wait_for_casting -- pauses the run for optional character casting photos.

Uploading a script normally starts one continuous, fully-automatic agent run
(parse straight through assemble). This tool genuinely blocks that SAME run
on an asyncio.Event, resumed by the frontend's POST .../casting/confirm --
rather than splitting into two separate orchestrator runs -- so casting stays
one more model-decided step in the same tool-calling policy as everything
else, consistent with the rest of the pipeline.

Casting is optional at every level: if the user never responds (closes the
tab, etc.), this times out and the run proceeds exactly as if they'd
explicitly skipped every character -- "nobody answered" must degrade the
same as "answered with zero photos," never fail the job.
"""

from __future__ import annotations

import asyncio

from agent.job_store import job_store
from agent.schemas import TraceEvent

CASTING_TIMEOUT_SECONDS = 300


def make_wait_for_casting_tool(job_id: str):
    async def wait_for_casting() -> dict:
        """MANDATORY step, always call this -- immediately after parse_script
        and before ground_visual_style, generate_storyboard, or any other
        tool. It is what lets the user optionally upload a reference photo
        per character; the photo upload is optional for the user, but
        calling this tool is not optional for you, even if you expect no one
        to upload anything. Call this exactly once. Returns once the user
        confirms (with or without photos) or after a timeout if they never
        respond -- either way, proceed with whatever's in
        characters_with_photo, which is commonly an empty list."""
        job_store.set_status(job_id, "waiting_for_casting")
        await job_store.emit(job_id, TraceEvent(step="wait_for_casting", status="started"))

        try:
            await asyncio.wait_for(job_store.casting_event_for(job_id).wait(), timeout=CASTING_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            pass  # no response -- proceed as if casting was skipped entirely

        job_store.set_status(job_id, "running")
        scratch = job_store.character_scratch_for(job_id)
        with_photo = [name for name, v in scratch.items() if v.get("photo_bytes")]

        await job_store.emit(
            job_id,
            TraceEvent(step="wait_for_casting", status="completed", data={"characters_with_photo": with_photo}),
        )
        return {"characters_with_photo": with_photo}

    return wait_for_casting
