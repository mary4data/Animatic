"""Test generate_score in isolation: python scripts/smoke_generate_score.py"""

import asyncio
import json

import _bootstrap  # noqa: F401
from agent.job_store import job_store
from agent.tools import make_generate_score_tool


async def main():
    job_id = job_store.create()
    tool = make_generate_score_tool(job_id)
    result = await tool(
        scene_id="S01",
        heading="EXT. RAINY STREET - NIGHT",
        action="Two figures negotiate in the fog under signage light.",
        mood_keywords="tense neo-noir",
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
