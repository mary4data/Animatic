"""Tool: describe_character_reference -- a text casting note from a photo.

Produces a short physical-description string (approximate age range, build,
hair, coloring, notable styling) from the uploaded reference photo, folded
into every storyboard prompt for that character's scenes (see
generate_storyboard.py's character_suffix). The photo itself is kept in the
job's in-memory character scratch (not deleted here) because
generate_storyboard also attaches it directly to the image-generation call
for that character's scenes, so the same face recurs across frames instead
of a new one being invented each time. The photo is purged at end of job by
job_store.purge_character_photos regardless of how the run ends -- it never
persists beyond the run it was uploaded for.
"""

from __future__ import annotations

import json
import logging

from agent.clients import call_gemini_with_retry, gemini_text_model, get_genai_client
from agent.job_store import job_store
from agent.schemas import TraceEvent

logger = logging.getLogger(__name__)

PROMPT = """You are writing a brief casting/styling note for a storyboard artist, based \
on the attached reference photo -- context for illustrating this character alongside \
the photo itself, which the storyboard artist will also have as a direct visual reference.

Cover, in a few phrases: approximate age range (e.g. "early 30s"), general build, hair \
color and style, general skin tone/coloring, and any notable styling choices (glasses, a \
notable clothing style, etc.) visible in the photo.

Do NOT mention or guess names.

Return ONLY JSON: {"description": "<one or two sentence casting-note style description>"}"""


def make_describe_character_reference_tool(job_id: str):
    async def describe_character_reference(character_name: str) -> dict:
        """Generate a short physical-description casting note for a character
        from their uploaded reference photo (used as extra text context
        alongside the photo itself, which generate_storyboard attaches
        directly to its image calls for this character's scenes). Call once
        for each name in wait_for_casting's characters_with_photo result. A
        no-op (returns description=null) if no photo is present for that
        name -- safe to call even without checking first."""
        await job_store.emit(
            job_id, TraceEvent(step="describe_character_reference", status="started", detail=character_name)
        )

        scratch = job_store.character_scratch_for(job_id)
        entry = scratch.setdefault(character_name, {})
        photo_bytes = entry.get("photo_bytes")
        if not photo_bytes:
            await job_store.emit(
                job_id,
                TraceEvent(
                    step="describe_character_reference",
                    status="skipped",
                    detail=f"{character_name}: no photo provided",
                ),
            )
            return {"character_name": character_name, "description": None}

        try:
            client = get_genai_client()
            response = await call_gemini_with_retry(
                client.models.generate_content,
                model=gemini_text_model(),
                contents=[
                    PROMPT,
                    {"inline_data": {"mime_type": entry.get("photo_mime") or "image/jpeg", "data": photo_bytes}},
                ],
                config={"response_mime_type": "application/json"},
            )
            description = json.loads(response.text)["description"]
            entry["description"] = description
        except Exception:  # noqa: BLE001 -- a failed description shouldn't fail the whole run
            logger.exception("describe_character_reference failed for %s", character_name)
            description = None
        # photo_bytes/photo_mime deliberately kept in scratch here -- generate_storyboard
        # reads them later for this character's scenes. job_store.purge_character_photos
        # (called unconditionally in orchestrator.run_job's finally block) is what deletes
        # them, whether or not this call succeeded.

        await job_store.emit(
            job_id,
            TraceEvent(
                step="describe_character_reference",
                status="completed" if description else "failed",
                detail=f"{character_name}: {description}" if description else f"{character_name}: failed",
            ),
        )
        return {"character_name": character_name, "description": description}

    return describe_character_reference
