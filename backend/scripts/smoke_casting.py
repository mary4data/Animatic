"""Test the casting-photo feature's two pieces in isolation, against real
APIs, before trusting it wired into the live orchestrator:

1. wait_for_casting's timeout-degrades-gracefully path (nobody ever confirms).
2. describe_character_reference against a real photo -- printed so you can
   eyeball that it reads like a casting note, and that the raw photo bytes
   are still in scratch afterward (generate_storyboard reads them later; see
   job_store.purge_character_photos for when they actually get deleted).

python scripts/smoke_casting.py <path-to-a-test-photo.jpg>"""

import asyncio
import sys

import _bootstrap  # noqa: F401
from agent.job_store import job_store
from agent.tools import make_describe_character_reference_tool, make_wait_for_casting_tool
from agent.tools.wait_for_casting import CASTING_TIMEOUT_SECONDS
import agent.tools.wait_for_casting as wait_for_casting_module


async def test_timeout():
    print(f"--- wait_for_casting timeout path (overriding {CASTING_TIMEOUT_SECONDS}s -> 2s) ---")
    wait_for_casting_module.CASTING_TIMEOUT_SECONDS = 2
    job_id = job_store.create()
    tool = make_wait_for_casting_tool(job_id)
    result = await tool()  # nobody ever calls confirm_casting -- should time out and return cleanly
    print("result:", result)
    record = job_store.get(job_id)
    print("job status after timeout:", record.job.status)
    assert result == {"characters_with_photo": []}
    assert record.job.status == "running"
    print("OK -- timed out and proceeded as if casting was skipped.\n")


async def test_description(photo_path: str):
    print(f"--- describe_character_reference against {photo_path} ---")
    job_id = job_store.create()
    with open(photo_path, "rb") as f:
        data = f.read()
    job_store.store_character_photo(job_id, "KAEL", data, "image/jpeg")

    tool = make_describe_character_reference_tool(job_id)
    result = await tool(character_name="KAEL")
    print("result:", result)

    scratch = job_store.character_scratch_for(job_id)
    print("scratch entry after call:", {k: v for k, v in scratch.get("KAEL", {}).items() if k != "photo_bytes"})
    assert "photo_bytes" in scratch.get("KAEL", {}), "photo bytes should still be in scratch for generate_storyboard"
    assert "description" in scratch.get("KAEL", {}), "a casting-note description should have been added"
    job_store.purge_character_photos(job_id)
    assert "photo_bytes" not in scratch.get("KAEL", {}), "purge_character_photos should delete the photo bytes"
    print("OK -- photo bytes persisted through the call for generate_storyboard, and purge_character_photos clears them.")


async def main():
    await test_timeout()
    if len(sys.argv) > 1:
        await test_description(sys.argv[1])
    else:
        print("(pass a photo path as argv[1] to also test describe_character_reference)")


if __name__ == "__main__":
    asyncio.run(main())
