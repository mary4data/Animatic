"""Run the real ADK-driven agent loop end to end against the sample script,
printing every SSE event as it's emitted -- the full agentic pipeline test.
python scripts/smoke_orchestrator.py"""

import asyncio
import json

import _bootstrap  # noqa: F401
from agent.job_store import job_store
from agent.orchestrator import run_job
from smoke_parse_script import SAMPLE_SCRIPT


async def print_events(job_id: str):
    record = job_store.get(job_id)
    while True:
        event = await record.queue.get()
        if event is None:
            break
        print(json.dumps(event.model_dump(), indent=2))


async def main():
    job_id = job_store.create()
    await asyncio.gather(
        run_job(job_id, SAMPLE_SCRIPT, "sample.txt"),
        print_events(job_id),
    )

    scenes = job_store.ordered_scenes(job_id)
    print(f"\n=== {len(scenes)} scene(s) assembled ===")
    print(json.dumps([s.model_dump() for s in scenes], indent=2))


if __name__ == "__main__":
    asyncio.run(main())
