"""Tool: generate_score -- short temp-score description (Lyria audio cut from scope, see README)."""

from __future__ import annotations

import json

from agent.clients import call_gemini_with_retry, gemini_text_model, get_genai_client
from agent.job_store import job_store
from agent.schemas import TraceEvent

PROMPT = """You are a film composer's assistant writing temp-score notes for a scene.

Scene heading: {heading}
Action: {action}
Mood keywords: {mood_keywords}

Return ONLY JSON: {{"mood": "<4-8 word mood tagline>", "score": "<1-2 sentence \
description of instrumentation, texture, and pacing for a temp score>"}}"""


def make_generate_score_tool(job_id: str):
    async def generate_score(scene_id: str, heading: str, action: str, mood_keywords: str) -> dict:
        """Generate a short temp-score description for the scene: a mood tagline
        and a 1-2 sentence instrumentation/texture description. Text only --
        audio synthesis (Lyria) is out of scope for this build. Call once per
        scene, any time after parse_script for that scene."""
        await job_store.emit(job_id, TraceEvent(step="generate_score", status="started", scene_id=scene_id))

        client = get_genai_client()
        response = await call_gemini_with_retry(
            client.models.generate_content,
            model=gemini_text_model(),
            contents=PROMPT.format(heading=heading, action=action, mood_keywords=mood_keywords),
            config={"response_mime_type": "application/json"},
        )
        result = json.loads(response.text)

        scratch = job_store.scratch_for(job_id, scene_id)
        scratch["mood"] = result["mood"]
        scratch["score"] = result["score"]

        await job_store.emit(
            job_id,
            TraceEvent(
                step="generate_score",
                status="completed",
                scene_id=scene_id,
                detail=result["mood"],
                data=result,
            ),
        )
        return {"scene_id": scene_id, **result}

    return generate_score
