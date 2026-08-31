"""Tool: parse_script -- extracts up to 20 scenes as structured JSON.

Bound to the job's raw script text via closure rather than a model-supplied
argument: the orchestrating model never needs the full script text in its
own context, only the structured result. This avoids relying on the LLM to
transcribe several pages of script verbatim as a function-call argument,
which is both wasteful and error-prone.

MAX_SCENES bounds this single extraction call, not the number of scenes
that actually get generated -- wait_for_scene_selection (called next) caps
the user's pick at 12, which in practice is almost always the binding limit.
"""

from __future__ import annotations

import json

from agent.clients import call_gemini_with_retry, gemini_text_model, get_genai_client
from agent.job_store import job_store
from agent.schemas import TraceEvent

MAX_SCENES = 20

PROMPT = """You are a script-breakdown assistant. Read the screenplay excerpt below \
and extract up to {max_scenes} scenes as JSON. Pick the first {max_scenes} \
distinct scenes (scene headings starting with INT./EXT.) if there are more.

For each scene produce:
- "heading": the slugline as written (e.g. "EXT. RAINY STREET - NIGHT")
- "title": a short, evocative 2-5 word scene title (not the slugline)
- "location": a short phrase describing where/when
- "action": the scene's action/description prose, condensed to 1-3 sentences
- "synopsis": a 1-2 sentence dramatic summary of what happens
- "dialogue": every spoken line in order, each with:
  - "speaker": character name as written
  - "line": the dialogue text
  - "direction": parenthetical stage direction immediately before the line, or null
  - "intent": your inference of the line's emotional tone/subtext in 2-4 words \
    (e.g. "quiet devastation", "wry deflection", "barely-controlled anger")

Return ONLY a JSON object: {{"scenes": [...]}} with no surrounding prose.

SCRIPT:
---
{script_text}
---
"""


def make_parse_script_tool(job_id: str, script_text: str):
    async def parse_script() -> dict:
        """Parse the uploaded screenplay excerpt into up to 20 structured scenes
        (heading, title, location, action, synopsis, and per-line dialogue with
        speaker, text, and inferred emotional intent). Call this first, exactly
        once, before any other tool."""
        await job_store.emit(job_id, TraceEvent(step="parse_script", status="started"))

        client = get_genai_client()
        response = await call_gemini_with_retry(
            client.models.generate_content,
            model=gemini_text_model(),
            contents=PROMPT.format(max_scenes=MAX_SCENES, script_text=script_text),
            config={"response_mime_type": "application/json"},
        )
        parsed = json.loads(response.text)
        scenes = parsed["scenes"][:MAX_SCENES]

        # De-duplicated, first-seen-casing speaker list across all scenes --
        # what the frontend renders the casting panel from, and the set of
        # names describe_character_reference can be called for.
        characters: list[str] = []
        seen = set()
        for scene in scenes:
            for line in scene.get("dialogue", []):
                name = (line.get("speaker") or "").strip()
                key = name.lower()
                if name and key not in seen:
                    seen.add(key)
                    characters.append(name)
        job_store.set_characters(job_id, characters)

        for i, scene in enumerate(scenes, start=1):
            scene_id = f"S{i:02d}"
            scene["id"] = scene_id
            scene["slug"] = f"{i:02d}"
            scene["number"] = f"{i:02d}"
            for j, line in enumerate(scene.get("dialogue", []), start=1):
                line["id"] = f"{scene_id}-L{j}"

            scratch = job_store.scratch_for(job_id, scene_id)
            scratch.update(
                {
                    "heading": scene["heading"],
                    "title": scene["title"],
                    "location": scene["location"],
                    "action": scene["action"],
                    "synopsis": scene["synopsis"],
                    "number": scene["number"],
                    "slug": scene["slug"],
                    "dialogue_meta": scene["dialogue"],
                }
            )

        await job_store.emit(
            job_id,
            TraceEvent(
                step="parse_script",
                status="completed",
                data={"scenes": scenes},
                detail=f"Parsed {len(scenes)} scene(s).",
            ),
        )
        return {"scenes": scenes}

    return parse_script
