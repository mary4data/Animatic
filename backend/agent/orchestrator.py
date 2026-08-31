"""The orchestrator: a single ADK Agent with all its tools registered, deciding
tool order itself from an instruction policy -- this file does not hardcode
a linear pipeline; see README for why this satisfies the "agentic, not a
script" requirement.

Concurrency model: one Agent + Runner + InMemorySessionService per job run,
built fresh in run_job() with job-bound tool closures. That keeps concurrent
jobs fully isolated (no shared agent/session state) at the cost of a little
setup overhead per run, which is a good trade for a hackathon's job volume.
"""

from __future__ import annotations

import logging

from agent.clients import gemini_text_model
from agent.job_store import job_store
from agent.schemas import TraceEvent
from agent.tools import (
    make_assemble_output_tool,
    make_describe_character_reference_tool,
    make_generate_score_tool,
    make_generate_storyboard_tool,
    make_generate_voice_lines_tool,
    make_ground_visual_style_tool,
    make_parse_script_tool,
    make_wait_for_casting_tool,
    make_wait_for_scene_selection_tool,
)

logger = logging.getLogger(__name__)

INSTRUCTION = """You are the Animatic production agent. You turn a screenplay \
excerpt into a storyboarded, scored, voiced pitch package, one scene at a time.

Follow this policy exactly, in order. Do not skip any numbered step, even ones that \
sound optional -- "optional" describes what the USER may skip (uploading a photo, \
picking fewer than 12 scenes), not a step you may skip calling:

1. Call parse_script() first, exactly once, with no arguments. It returns up \
   to 20 scenes, each with dialogue lines (id, speaker, line, intent, direction).

2. Call wait_for_scene_selection() second, exactly once, immediately after \
   parse_script and before wait_for_casting or any other tool. This step is \
   MANDATORY to call even though the user's response inside it is optional. It \
   pauses and returns "selected_scene_ids": [...] -- the ONLY scenes you will work \
   on. Ignore every parsed scene not in that list for the rest of this run.

3. Call wait_for_casting() third, exactly once, immediately after \
   wait_for_scene_selection and before calling ground_visual_style, \
   generate_storyboard, or any other tool. This step is MANDATORY to call even \
   though the user's response inside it is optional -- you must call this tool \
   regardless of whether you expect anyone to upload a photo. It pauses and returns \
   "characters_with_photo": [...]. For EVERY name in that list, call \
   describe_character_reference(character_name) once. An empty list is a normal, \
   common result -- proceed to step 4 either way.

4. For EACH scene id in selected_scene_ids, in order, do all of the following \
   before moving to the next scene:
   a. Call ground_visual_style(scene_id, location, action, mood_keywords) once, \
      using the scene's location/action and a short mood phrase you infer from \
      the scene, to get a real grounded style reference.
   b. Call generate_storyboard(scene_id, heading, action, style_reference) once, \
      passing the style_reference text from step (a).
   c. Call generate_score(scene_id, heading, action, mood_keywords) once.
   d. For EACH dialogue line in the scene, call generate_voice_lines(scene_id, \
      line_id, speaker, line, intent) once.
   e. Once every dialogue line in the scene has been voiced, call \
      assemble_output(scene_id) exactly once to finalize that scene.

5. After every selected scene has been assembled, respond with a short plain-text \
   summary of what you produced (scene count, characters cast). Do not call any tool \
   after the last assemble_output.

Never call ground_visual_style or generate_storyboard before both wait_for_scene_selection \
and wait_for_casting have returned -- this is the single most important ordering rule in \
this policy. Never call assemble_output for a scene before all of its lines are voiced. \
Never process a parsed scene that isn't in selected_scene_ids. Make your own judgment \
call about mood_keywords wording -- you are the one deciding it, not a fixed template."""


def _build_tools(job_id: str, script_text: str) -> list:
    from google.adk.tools import FunctionTool

    return [
        FunctionTool(func=make_parse_script_tool(job_id, script_text)),
        FunctionTool(func=make_wait_for_scene_selection_tool(job_id)),
        FunctionTool(func=make_wait_for_casting_tool(job_id)),
        FunctionTool(func=make_describe_character_reference_tool(job_id)),
        FunctionTool(func=make_ground_visual_style_tool(job_id)),
        FunctionTool(func=make_generate_storyboard_tool(job_id)),
        FunctionTool(func=make_generate_score_tool(job_id)),
        FunctionTool(func=make_generate_voice_lines_tool(job_id)),
        FunctionTool(func=make_assemble_output_tool(job_id)),
    ]


async def run_job(job_id: str, script_text: str, filename: str) -> None:
    from google.adk.agents import Agent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types

    job_store.set_status(job_id, "running")

    try:
        agent = Agent(
            name="animatic_agent",
            model=gemini_text_model(),
            instruction=INSTRUCTION,
            tools=_build_tools(job_id, script_text),
        )

        session_service = InMemorySessionService()
        await session_service.create_session(app_name="animatic", user_id="animatic", session_id=job_id)
        runner = Runner(agent=agent, app_name="animatic", session_service=session_service)

        message = genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=f"Process the uploaded script '{filename}'. Begin.")],
        )

        async for event in runner.run_async(user_id="animatic", session_id=job_id, new_message=message):
            if event.is_final_response():
                logger.info("job %s final response: %s", job_id, event.content)

        job_store.set_status(job_id, "completed")
        await job_store.emit(job_id, TraceEvent(step="job_completed", status="completed"))
    except Exception as exc:  # noqa: BLE001 -- surface any failure to the client instead of hanging
        logger.exception("job %s failed", job_id)
        job_store.set_status(job_id, "failed", error=str(exc))
        await job_store.emit(job_id, TraceEvent(step="job_completed", status="failed", detail=str(exc)))
    finally:
        # Safety net: a photo must never outlive the run, even if the model
        # never called describe_character_reference for it (e.g. it errored
        # out before reaching that step).
        job_store.purge_character_photos(job_id)
        await job_store.close_stream(job_id)
