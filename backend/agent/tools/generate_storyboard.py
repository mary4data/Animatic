"""Tool: generate_storyboard -- up to 3 storyboard frames per scene, capped by dialogue-line count.

Originally built against Imagen 3 via Vertex AI, per the hackathon spec.
Switched to Gemini's own native image model (client.models.generate_content
with response_modalities=["IMAGE"]) after Imagen 3 turned out to return 404
"not found or your project does not have access to it" on this project --
Imagen needs separate allowlisting that wasn't available, while Gemini's
image model worked immediately through the same Developer API key already
used for text/TTS. This is the documented substitution the hackathon spec
explicitly allows ("a placeholder/simpler image model if Imagen access/quota
is an issue"). See clients.gemini_image_model() for the model name.

Rather than one generic frame, this identifies distinct visual beats within
the scene (a single Gemini text call, model decides how many -- not
hardcoded) and generates one image per beat, so the frontend's ScenePlayer
can crossfade between them across the scene's dialogue-audio duration. The
beat count is capped at one per dialogue line (a scene with 1 line of
dialogue gets at most 1 frame, never the old flat 2-3), with an overall
ceiling of 3 so a long, dialogue-heavy scene doesn't balloon into a frame
per line -- see _max_beats_for.

Each image still falls back individually to a generated placeholder frame
(solid field + caption, via Pillow) if its call fails -- rather than
crashing the whole scene. Either fallback is clearly marked in the emitted
event's `detail` and in the returned data, not silently swapped in.

Cast-photo consistency: for any speaker in the scene with an uploaded
reference photo (see describe_character_reference.py), that photo's raw
bytes are attached directly to every one of this scene's image-generation
calls, alongside a text instruction to keep that character's face/likeness
consistent with it. This is what gives a cast character the same face
across frames and scenes, rather than a new face being invented per call.

regenerate_beat_image() (called from api/routes.py's
POST .../images/{order}/regenerate, after a job has already finished) reuses
_render_beat_image -- the same rendering path the main per-scene loop uses --
with the beat's original name/description read back out of scratch (this
tool stores it there specifically so a later regenerate has it). One caveat:
job_store.purge_character_photos deletes uploaded cast photos unconditionally
at end of run, so a regenerate on an already-completed job falls back to
text-only character notes even for a scene that originally had a reference
photo attached -- there is no way around this without keeping photos around
past the run, which the privacy design deliberately doesn't do.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from agent.clients import call_gemini_with_retry, gemini_image_model, gemini_text_model, get_genai_client
from agent.job_store import job_store
from agent.schemas import TraceEvent
from agent.storage import read_media, save_media

logger = logging.getLogger(__name__)

BEATS_PROMPT = """You are a storyboard artist breaking a scene into its key visual \
beats. Read the scene below and identify at most {max_beats} distinct visual moment(s) \
worth a separate storyboard frame each -- pick the number (from 1 up to {max_beats}) \
that best fits how much visual change the scene actually has; don't pad to {max_beats} \
if the scene has fewer real beats than that. For each beat give a short name and a 1-2 \
sentence visual description (what's framed, staged, or emphasized differently from the \
other beats).

Scene heading: {heading}
Action: {action}
Dialogue (for context only, do not restate lines in the visual description):
{dialogue_text}

Return ONLY a JSON object: {{"beats": [{{"name": "...", "description": "..."}}, ...]}} \
with no surrounding prose."""

IMAGE_PROMPT_TEMPLATE = """{style_directive}

Storyboard frame, 16:9, single frame, no text or watermarks. Scene: {heading}. {description}
Supplementary mood/lighting/composition reference only -- the rendering style described \
above always takes precedence over this reference's own visual style, which may not match \
it: {style_reference}"""

DEFAULT_VISUAL_STYLE = "realistic"

# User-selectable at upload time (see api/routes.py's VISUAL_STYLES / job_store's
# visual_style), applied identically to every frame in a run so the whole pitch
# package renders in one consistent look instead of drifting scene to scene with
# whatever ground_visual_style's web-search reference happened to look like.
STYLE_DIRECTIVES = {
    "realistic": (
        "Photorealistic cinematic style: real actors and real locations, natural film "
        "lighting, shot on 35mm with a shallow depth of field -- not illustrated, not "
        "animated, not a painting or line drawing."
    ),
    "animated": (
        "Stylized animated concept-art style: clean cel-shaded illustration, flat and "
        "consistent color palette, bold linework, like key art from an animated feature "
        "-- not photorealistic, not live-action photography."
    ),
}


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


def _max_beats_for(dialogue_meta: list[dict]) -> int:
    """At most one frame per dialogue line, capped at 3 overall; a scene with
    no dialogue (or a single line) still gets its one establishing frame."""
    return max(1, min(3, len(dialogue_meta)))


def _character_suffix_for(job_id: str, dialogue_meta: list[dict]) -> tuple[str, list[str], dict]:
    """Text casting notes and (when the photo is still available -- see
    module docstring) reference-photo speakers, for whichever characters
    speak in this scene. Shared by the main per-scene loop and regenerate."""
    speakers = {d.get("speaker") for d in dialogue_meta}
    char_scratch = job_store.character_scratch_for(job_id)
    notes = [char_scratch[s]["description"] for s in speakers if char_scratch.get(s, {}).get("description")]
    suffix = " Character notes: " + "; ".join(notes) if notes else ""

    photo_speakers = [s for s in speakers if char_scratch.get(s, {}).get("photo_bytes")]
    if photo_speakers:
        suffix += (
            " Reference photo(s) attached for: " + ", ".join(sorted(photo_speakers)) + ". "
            "Render each of those characters with a face and general likeness consistent "
            "with their attached reference photo, adapted into this scene's illustrated "
            "storyboard style -- keep their identity consistent with the photo across frames."
        )
    return suffix, photo_speakers, char_scratch


async def _render_beat_image(
    job_id: str,
    scene_id: str,
    order: int,
    *,
    beat_name: str,
    beat_description: str,
    heading: str,
    title: str,
    style_reference: str,
    character_suffix: str,
    photo_speakers: list[str],
    char_scratch: dict,
    reference_images: list[tuple[bytes, str]] | None = None,
) -> dict:
    """Renders one beat's image and saves it. Used both by the main per-scene
    generation loop and by regenerate_beat_image; callers own scratch/event
    bookkeeping around this since the two have different needs there.

    reference_images (regenerate_beat_image only) are other already-rendered
    frames from the same scene, attached as image inputs alongside the text
    prompt so the model has an actual visual target for style/framing/
    character-appearance consistency instead of relying on the text prompt
    alone to land on the same rendering twice."""
    from google.genai import types

    client = get_genai_client()
    style_directive = STYLE_DIRECTIVES.get(
        job_store.visual_style_for(job_id), STYLE_DIRECTIVES[DEFAULT_VISUAL_STYLE]
    )
    prompt = (
        IMAGE_PROMPT_TEMPLATE.format(
            style_directive=style_directive,
            heading=heading,
            description=beat_description,
            style_reference=style_reference,
        )
        + character_suffix
    )
    if reference_images:
        prompt += (
            " Additional attached reference image(s): other already-generated frames from "
            "this same scene. Match this frame's rendering style, color grading, lighting, "
            "and any characters' established appearance to those reference frames, for "
            "visual consistency across the scene."
        )

    contents: list = [prompt]
    for speaker in photo_speakers:
        entry = char_scratch[speaker]
        contents.append(
            {"inline_data": {"mime_type": entry.get("photo_mime") or "image/jpeg", "data": entry["photo_bytes"]}}
        )
    for ref_bytes, ref_mime in reference_images or []:
        contents.append({"inline_data": {"mime_type": ref_mime, "data": ref_bytes}})

    used_placeholder = False
    try:
        response = await call_gemini_with_retry(
            client.models.generate_content,
            model=gemini_image_model(),
            contents=contents,
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

    # A fresh, unique filename per render (not a fixed scene_id/order name)
    # so a regenerated frame gets a new URL -- browsers cache aggressively by
    # URL, and reusing the old one risks the old image sticking around.
    image_url = save_media(job_id, f"{scene_id}_{order}_{uuid.uuid4().hex[:8]}.{extension}", image_bytes)
    return {
        "beat": beat_name,
        "description": beat_description,
        "url": image_url,
        "order": order,
        "placeholder": used_placeholder,
    }


async def regenerate_beat_image(job_id: str, scene_id: str, order: int) -> dict | None:
    """Re-renders a single existing frame in place, reusing its original
    beat name/description and the scene's heading/style-reference/character
    context from scratch (all still available -- see job_store.py, scratch
    is never cleared). Returns the new image dict, or None if scene_id/order
    isn't a known existing frame for this job.

    Also anchors the render to the scene's other existing (non-placeholder)
    frame(s), read back off disk as image references -- see
    _render_beat_image's reference_images. This is the only way a regenerate
    can still roughly track a cast photo's established look once the job has
    finished: the raw photo itself is long gone by then (job_store.
    purge_character_photos deletes it unconditionally at end of run -- see
    module docstring), but a sibling frame rendered while the photo was still
    available is a visual trace of that look, and gives the model something
    concrete to match regardless of whether a photo was ever involved."""
    scratch = job_store.scratch_for(job_id, scene_id)
    existing_images = scratch.get("images", [])
    existing = next((img for img in existing_images if img.get("order") == order), None)
    if existing is None:
        return None

    dialogue_meta = scratch.get("dialogue_meta", [])
    character_suffix, photo_speakers, char_scratch = _character_suffix_for(job_id, dialogue_meta)

    reference_images: list[tuple[bytes, str]] = []
    for sibling in existing_images:
        if sibling.get("order") == order or sibling.get("placeholder"):
            continue
        filename = sibling["url"].rsplit("/", 1)[-1]
        data = read_media(job_id, filename)
        if data:
            mime = "image/png" if filename.lower().endswith(".png") else "image/jpeg"
            reference_images.append((data, mime))
        if len(reference_images) >= 2:
            break

    new_image = await _render_beat_image(
        job_id,
        scene_id,
        order,
        beat_name=existing.get("beat", f"Beat {order}"),
        beat_description=existing.get("description") or scratch.get("action", ""),
        heading=scratch.get("heading", ""),
        title=scratch.get("title", scene_id),
        style_reference=scratch.get("style_reference_text", ""),
        character_suffix=character_suffix,
        photo_speakers=photo_speakers,
        char_scratch=char_scratch,
        reference_images=reference_images,
    )

    scratch["images"] = [new_image if img.get("order") == order else img for img in existing_images]
    return new_image


async def _identify_beats(heading: str, action: str, dialogue_meta: list[dict], max_beats: int) -> list[dict]:
    dialogue_text = "\n".join(f"{d.get('speaker', '')}: {d.get('line', '')}" for d in dialogue_meta) or "(none)"
    client = get_genai_client()
    response = await call_gemini_with_retry(
        client.models.generate_content,
        model=gemini_text_model(),
        contents=BEATS_PROMPT.format(heading=heading, action=action, dialogue_text=dialogue_text, max_beats=max_beats),
        config={"response_mime_type": "application/json"},
    )
    parsed = json.loads(response.text)
    beats = parsed.get("beats", [])[:max_beats]
    if not beats:
        beats = [{"name": "Establishing", "description": action}]
    return beats


def make_generate_storyboard_tool(job_id: str):
    async def generate_storyboard(scene_id: str, heading: str, action: str, style_reference: str) -> dict:
        """Generate up to 3 storyboard concept-art frames for the scene's key
        visual beats, using Gemini's image model, enriched with the
        style_reference text returned by ground_visual_style. The frame
        count is capped at one per dialogue line in the scene (never more
        frames than sentences of dialogue). Call once per scene, after
        ground_visual_style for that scene."""
        await job_store.emit(
            job_id, TraceEvent(step="generate_storyboard", status="started", scene_id=scene_id)
        )

        scratch = job_store.scratch_for(job_id, scene_id)
        title = scratch.get("title", scene_id)
        dialogue_meta = scratch.get("dialogue_meta", [])
        max_beats = _max_beats_for(dialogue_meta)

        try:
            beats = await _identify_beats(heading, action, dialogue_meta, max_beats)
        except Exception:  # noqa: BLE001 -- fall back to a single generic beat
            logger.exception("Beat identification failed for scene %s; using one generic beat", scene_id)
            beats = [{"name": "Establishing", "description": action}]

        # Optional casting-photo descriptions and reference photos (see
        # describe_character_reference) for any speaker in this scene --
        # purely additive; a scene with no uploaded photos produces the exact
        # same prompts and calls as before this existed.
        character_suffix, photo_speakers, char_scratch = _character_suffix_for(job_id, dialogue_meta)

        async def _generate_one(order: int, beat: dict) -> dict:
            beat_name = beat.get("name", f"Beat {order}")
            beat_description = beat.get("description", action)

            image = await _render_beat_image(
                job_id,
                scene_id,
                order,
                beat_name=beat_name,
                beat_description=beat_description,
                heading=heading,
                title=title,
                style_reference=style_reference,
                character_suffix=character_suffix,
                photo_speakers=photo_speakers,
                char_scratch=char_scratch,
            )

            await job_store.emit(
                job_id,
                TraceEvent(
                    step="generate_storyboard",
                    status="image_completed",
                    scene_id=scene_id,
                    detail=f"placeholder frame ({beat_name})" if image["placeholder"] else beat_name,
                    data={
                        "beat": beat_name,
                        "image_url": image["url"],
                        "order": order,
                        "total": len(beats),
                        "placeholder": image["placeholder"],
                    },
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
