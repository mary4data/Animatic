"""Tool: describe_character_reference -- a casting note from a photo, never a face match.

Hard boundary: the photo is only ever sent to a Gemini *text-generation*
call that produces a short physical-description string -- general age
range, build, hair, coloring, notable styling. It is NEVER passed into
image generation, and the system makes no attempt at face-preservation,
face-swap, or subject-consistency-from-image. The output describes a
fictional character inspired by the photo's general look, not a rendering
of the actual uploaded person. The raw photo bytes are deleted from scratch
immediately after this call, whether it succeeds or fails.
"""

from __future__ import annotations

import json
import logging

from agent.clients import call_gemini_with_retry, gemini_text_model, get_genai_client
from agent.job_store import job_store
from agent.schemas import TraceEvent

logger = logging.getLogger(__name__)

PROMPT = """You are writing a brief casting/styling note for a storyboard artist, based \
on the attached reference photo. Describe only general, non-identifying visual \
characteristics useful for illustrating a FICTIONAL character inspired by this photo's \
general look -- NOT a description meant to reproduce or identify the actual person.

Cover, in a few phrases: approximate age range (e.g. "early 30s"), general build, hair \
color and style, general skin tone/coloring, and any notable styling choices (glasses, a \
notable clothing style, etc.) visible in the photo.

Do NOT mention or guess names. Do NOT attempt to identify who this is. Do NOT describe \
facial features with enough precision to reconstruct an exact likeness (no exact \
measurements or highly specific facial geometry) -- stay at the level of a casting note, \
e.g. "athletic build, short dark hair, warm brown skin tone, wire-frame glasses."

Return ONLY JSON: {"description": "<one or two sentence casting-note style description>"}"""


def make_describe_character_reference_tool(job_id: str):
    async def describe_character_reference(character_name: str) -> dict:
        """Generate a general, non-identifying physical-description casting
        note for a character from their uploaded reference photo. Call once
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
        finally:
            # Hard boundary: the raw photo never outlives this call, success or not.
            entry.pop("photo_bytes", None)
            entry.pop("photo_mime", None)

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
