"""Test generate_storyboard (Gemini image model, falls back to a placeholder
frame on failure) in isolation: python scripts/smoke_generate_storyboard.py"""

import asyncio
import json

import _bootstrap  # noqa: F401
from agent.job_store import job_store
from agent.tools import make_generate_storyboard_tool


async def main():
    job_id = job_store.create()
    job_store.scratch_for(job_id, "S01")["title"] = "The Shattered Mirror"
    tool = make_generate_storyboard_tool(job_id)
    result = await tool(
        scene_id="S01",
        heading="EXT. RAINY STREET - NIGHT",
        action="Two figures negotiate in the fog under signage light.",
        style_reference="Tungsten practical key light, 35mm, shallow focus, neo-noir.",
    )
    print(json.dumps(result, indent=2))
    print(f"Written under: backend/storage/{job_id}/")


if __name__ == "__main__":
    asyncio.run(main())
