"""Test parse_script in isolation:  python scripts/smoke_parse_script.py"""

import asyncio
import json

import _bootstrap  # noqa: F401
from agent.job_store import job_store
from agent.tools import make_parse_script_tool

SAMPLE_SCRIPT = """
EXT. RAINY STREET - NIGHT

Wet asphalt reflects the neon like a shattered mirror. KAEL stands alone,
his silhouette cut against the fog.

KAEL
(not turning around)
You keep the record. I keep the door. That was the whole arrangement.

ELARA
Arrangements are for people who plan on a second meeting.

INT. DATA CELL - CONTINUOUS

The screen flicker is the only pulse in the room.

MARCUS
Plans change when the payload gets this heavy. Look at the readouts.

ELARA
(flat)
I stopped reading them the night they started lying.
"""


async def main():
    job_id = job_store.create()
    tool = make_parse_script_tool(job_id, SAMPLE_SCRIPT)
    result = await tool()
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
