"""Tool: generate_storyboard -- 2-3 storyboard frames per scene.

Originally built against Imagen 3 via Vertex AI, per the hackathon spec.
Switched to Gemini's own native image model (client.models.generate_content
with response_modalities=["IMAGE"]) after Imagen 3 turned out to return 404
"not found or your project does not have access to it" on this project --
Imagen needs separate allowlisting that wasn't available, while Gemini's
image model worked immediately through the same Developer API key already
used for text/TTS. This is the documented substitution the hackathon spec
explicitly allows ("a placeholder/simpler image model if Imagen access/quota
is an issue"). See clients.gemini_image_model() for the model name.

Rather than one generic frame, this identifies 2-3 distinct visual beats
within the scene (a single Gemini text call, model decides 2 vs 3 -- not
hardcoded) and generates one image per beat, so the frontend's ScenePlayer
can crossfade between them across the scene's dialogue-audio duration.

Each image still falls back individually to a generated placeholder frame
(solid field + caption, via Pillow) if its call fails -- rather than
crashing the whole scene. Either fallback is clearly marked in the emitted
event's `detail` and in the returned data, not silently swapped in.
"""

from __future__ import annotations

import asyncio
import json
import logging

from agent.clients import call_gemini_with_retry, gemini_image_model, gemini_text_model, get_genai_client
from agent.job_store import job_store
from agent.schemas import TraceEvent
from agent.storage import save_media

logger = logging.getLogger(__name__)

BEATS_PROMPT = """You are a storyboard artist breaking a scene into its key visual \
beats. Read the scene below and identify 2 or 3 distinct visual moments worth a \
separate storyboard frame each -- pick the number (2 or 3) that best fits how much \
visual change the scene actually has; don't pad to 3 if the scene only has 2 real \
beats. For each beat give a short name and a 1-2 sentence visual description (what's \
framed, staged, or emphasized differently from the other beats).

Scene heading: {heading}
Action: {action}
Dialogue (for context only, do not restate lines in the visual description):
{dialogue_text}

Return ONLY a JSON object: {{"beats": [{{"name": "...", "description": "..."}}, ...]}} \
with no surrounding prose."""

IMAGE_PROMPT_TEMPLATE = """Cinematic storyboard concept-art frame, 16:9, single frame, \
no text or watermarks. Scene: {heading}. {description} Style reference: {style_reference}"""


def _placeholder_png(heading: str, title: str, beat_name: str) -> bytes:
    from io import BytesIO

    from PIL import Image, ImageDraw

    img = Image.new("RGB", (1280, 720), color=(20, 22, 28))
    draw = ImageDraw.Draw(img)
    draw.rectangle([40, 40, 1240, 680], outline=(90, 95, 110), width=2)
    draw.text((64, 300), title, fill=(230, 230, 235))
    draw.text((64, 340), heading, fill=(150, 150, 160))
    draw.text((64, 380), beat_name, fill=(150, 150, 160))
    draw.text((64, 640), "placeholder frame · image generation unavailable", fill=(110, 110, 120))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


async def _identify_beats(heading: str, action: str, dialogue_meta: list[dict]) -> list[dict]:
    dialogue_text = "\n".join(f"{d.get('speaker', '')}: {d.get('line', '')}" for d in dialogue_meta) or "(none)"
    client = get_genai_client()
    response = await call_gemini_with_retry(
        client.models.generate_content,
        model=gemini_text_model(),
        contents=BEATS_PROMPT.format(heading=heading, action=action, dialogue_text=dialogue_text),
        config={"response_mime_type": "application/json"},
    )
    parsed = json.loads(response.text)
    beats = parsed.get("beats", [])[:3]
    if not beats:
        beats = [{"name": "Establishing", "description": action}]
    return beats


def make_generate_storyboard_tool(job_id: str):
    async def generate_storyboard(scene_id: str, heading: str, action: str, style_reference: str) -> dict:
        """Generate 2-3 storyboard concept-art frames for the scene's key visual
        beats, using Gemini's image model, enriched with the style_reference
        text returned by ground_visual_style. Call once per scene, after
        ground_visual_style for that scene."""
        await job_store.emit(
            job_id, TraceEvent(step="generate_storyboard", status="started", scene_id=scene_id)
        )

        from google.genai import types

        scratch = job_store.scratch_for(job_id, scene_id)
        title = scratch.get("title", scene_id)
        dialogue_meta = scratch.get("dialogue_meta", [])

        try:
            beats = await _identify_beats(heading, action, dialogue_meta)
        except Exception:  # noqa: BLE001 -- fall back to a single generic beat
            logger.exception("Beat identification failed for scene %s; using one generic beat", scene_id)
            beats = [{"name": "Establishing", "description": action}]

        # Optional casting-photo descriptions (see describe_character_reference)
        # for any speaker in this scene -- purely additive; a scene with no
        # uploaded photos produces the exact same prompts as before this existed.
        speakers = {d.get("speaker") for d in dialogue_meta}
        char_scratch = job_store.character_scratch_for(job_id)
        notes = [char_scratch[s]["description"] for s in speakers if char_scratch.get(s, {}).get("description")]
        character_suffix = " Character notes: " + "; ".join(notes) if notes else ""

        client = get_genai_client()

        async def _generate_one(order: int, beat: dict) -> dict:
            beat_name = beat.get("name", f"Beat {order}")
            beat_description = beat.get("description", action)
            prompt = IMAGE_PROMPT_TEMPLATE.format(
                heading=heading, description=beat_description, style_reference=style_reference
            ) + character_suffix

            used_placeholder = False
            try:
                response = await call_gemini_with_retry(
                    client.models.generate_content,
                    model=gemini_image_model(),
                    contents=prompt,
                    config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
                )
                part = next(p for p in response.candidates[0].content.parts if p.inline_data)
                image_bytes = part.inline_data.data
                extension = "png" if "png" in (part.inline_data.mime_type or "") else "jpg"
            except Exception:  # noqa: BLE001 -- deliberate broad fallback, see module docstring
                logger.exception(
                    "Image generation failed for scene %s beat %d; falling back to a placeholder frame",
                    scene_id,
                    order,
                )
                used_placeholder = True
                image_bytes = _placeholder_png(heading, title, beat_name)
                extension = "png"

            image_url = save_media(job_id, f"{scene_id}_{order}.{extension}", image_bytes)
            image = {"beat": beat_name, "url": image_url, "order": order, "placeholder": used_placeholder}

            await job_store.emit(
                job_id,
                TraceEvent(
                    step="generate_storyboard",
                    status="image_completed",
                    scene_id=scene_id,
                    detail=f"placeholder frame ({beat_name})" if used_placeholder else beat_name,
                    data={"beat": beat_name, "image_url": image_url, "order": order, "total": len(beats), "placeholder": used_placeholder},
                ),
            )
            return image

        # Beats are independent (each is its own image call) -- generating
        # them concurrently instead of one-by-one is what actually cuts this
        # step's wall-clock time, since it's dominated by image-model latency
        # rather than local work.
        images = list(
            await asyncio.gather(*(_generate_one(order, beat) for order, beat in enumerate(beats, start=1)))
        )
        scratch["images"] = images

        await job_store.emit(
            job_id,
            TraceEvent(
                step="generate_storyboard",
                status="completed",
                scene_id=scene_id,
                detail=f"{len(images)} frame(s) generated.",
                data={"images": images},
            ),
        )
        return {"scene_id": scene_id, "images": images}

    return generate_storyboard
