"""Tool: ground_visual_style -- Parallel Search call, satisfies hard requirement #2.

Runs a real Parallel Search before storyboard generation to pull a stylistic/
visual reference for the scene's genre/tone, and feeds a text summary of it
into the image prompt. Best-effort image: Parallel's Search API guarantees
title/url/excerpts, not an image field, so we opportunistically read one off
the result object if the SDK response happens to carry it and fall back to a
text-only grounding panel otherwise (frontend SceneDetail renders both cases).
"""

from __future__ import annotations

import asyncio

from agent.clients import get_parallel_client
from agent.job_store import job_store
from agent.schemas import TraceEvent


def make_ground_visual_style_tool(job_id: str):
    async def ground_visual_style(scene_id: str, location: str, action: str, mood_keywords: str) -> dict:
        """Look up a real stylistic/visual reference for a scene via web search,
        to ground the storyboard image in an actual comparable film/photographic
        style rather than an unguided prompt. Call once per scene, before
        generate_storyboard for that scene."""
        await job_store.emit(
            job_id, TraceEvent(step="ground_visual_style", status="started", scene_id=scene_id)
        )

        client = get_parallel_client()
        objective = (
            f"Find the cinematographic/visual style of films comparable to a scene "
            f"described as: {location}. {action}. Mood: {mood_keywords}."
        )
        search_queries = [
            f"{mood_keywords} film cinematography style",
            f"{location} scene lighting reference",
        ][:3]

        search = await asyncio.to_thread(client.search, objective=objective, search_queries=search_queries)

        results = list(getattr(search, "results", []) or [])
        top = results[0] if results else None

        excerpts: list[str] = []
        for r in results[:3]:
            excerpts.extend((getattr(r, "excerpts", None) or [])[:1])
        reference_summary = " ".join(e.strip() for e in excerpts if e)[:600] or (
            f"No strong external reference found; default to a naturalistic treatment "
            f"of: {mood_keywords}."
        )

        image_url = None
        for r in results:
            for attr in ("image", "image_url", "thumbnail", "thumbnail_url"):
                val = getattr(r, attr, None)
                if val:
                    image_url = val
                    break
            if image_url:
                break

        reference = {
            "caption": getattr(top, "title", None) or "Style reference",
            "notes": [e.strip() for e in excerpts if e][:3],
            "source_url": getattr(top, "url", None),
            "image": image_url,
        }

        scratch = job_store.scratch_for(job_id, scene_id)
        scratch["reference"] = reference
        scratch["style_reference_text"] = reference_summary

        await job_store.emit(
            job_id,
            TraceEvent(
                step="ground_visual_style",
                status="completed",
                scene_id=scene_id,
                detail=reference["caption"],
                data={"reference": reference},
            ),
        )
        return {"scene_id": scene_id, "style_reference": reference_summary, "reference": reference}

    return ground_visual_style
