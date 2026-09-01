"""Directly chain every tool for one scene, end to end, bypassing the ADK
agent loop -- a fast sanity check that the tools themselves work and compose
correctly before trusting the model-driven orchestrator.
python scripts/smoke_full_pipeline.py"""

import asyncio
import json

import _bootstrap  # noqa: F401
from agent.job_store import job_store
from agent.tools import (
    make_assemble_output_tool,
    make_generate_score_tool,
    make_generate_storyboard_tool,
    make_generate_voice_lines_tool,
    make_ground_visual_style_tool,
    make_parse_script_tool,
)
from smoke_parse_script import SAMPLE_SCRIPT


async def main():
    job_id = job_store.create()

    parse = make_parse_script_tool(job_id, SAMPLE_SCRIPT)
    ground = make_ground_visual_style_tool(job_id)
    board = make_generate_storyboard_tool(job_id)
    score = make_generate_score_tool(job_id)
    voice = make_generate_voice_lines_tool(job_id)
    assemble = make_assemble_output_tool(job_id)

    parsed = await parse()
    scene = parsed["scenes"][0]
    scene_id = scene["id"]
    print(f"Parsed {len(parsed['scenes'])} scene(s); running scene {scene_id} end to end.")

    await ground(scene_id=scene_id, location=scene["location"], action=scene["action"], mood_keywords="tense neo-noir")
    await board(scene_id=scene_id, heading=scene["heading"], action=scene["action"], style_reference="neo-noir, tungsten key light")
    await score(scene_id=scene_id, heading=scene["heading"], action=scene["action"], mood_keywords="tense neo-noir")

    await voice(scene_id=scene_id)

    result = await assemble(scene_id=scene_id)
    print(json.dumps(result, indent=2))

    scenes = job_store.ordered_scenes(job_id)
    print(json.dumps([s.model_dump() for s in scenes], indent=2))


if __name__ == "__main__":
    asyncio.run(main())
