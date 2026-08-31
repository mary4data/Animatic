"""Tool: assemble_output -- finalizes one scene's Scene record from prior tool results.

Reads the job's scratch space (populated by parse_script/ground_visual_style/
generate_storyboard/generate_score/generate_voice_lines for this scene_id)
and writes the finished pydantic Scene into the job store, where
GET /api/scripts/:job_id/scenes picks it up. Call once per scene, after all
of that scene's dialogue lines have been voiced.
"""

from __future__ import annotations

import wave

from agent.job_store import job_store
from agent.schemas import DialogueLine, Scene, SceneImage, SceneReference, TraceEvent
from agent.storage import STORAGE_ROOT


def _wav_seconds(job_id: str, audio_url: str) -> float:
    filename = audio_url.rsplit("/", 1)[-1]
    path = STORAGE_ROOT / job_id / filename
    try:
        with wave.open(str(path), "rb") as wf:
            return wf.getnframes() / wf.getframerate()
    except Exception:  # noqa: BLE001
        return 0.0


def _format_duration(seconds: float) -> str:
    total = round(seconds)
    return f"{total // 60:02d}:{total % 60:02d}"


def make_assemble_output_tool(job_id: str):
    async def assemble_output(scene_id: str) -> dict:
        """Finalize the given scene into the output package, after its image,
        score, and all dialogue lines are ready. Call once per scene, last,
        after every other tool for that scene_id."""
        await job_store.emit(job_id, TraceEvent(step="assemble_output", status="started", scene_id=scene_id))

        scratch = job_store.scratch_for(job_id, scene_id)

        dialogue: list[DialogueLine] = []
        total_seconds = 0.0
        for meta in scratch.get("dialogue_meta", []):
            line_state = scratch["lines"].get(meta["id"], {})
            audio_url = line_state.get("audio_url")
            if audio_url:
                total_seconds += _wav_seconds(job_id, audio_url)
            dialogue.append(
                DialogueLine(
                    id=meta["id"],
                    speaker=meta["speaker"],
                    line=meta["line"],
                    intent=meta.get("intent", ""),
                    direction=meta.get("direction"),
                    audio_url=audio_url,
                )
            )

        reference = scratch.get("reference")
        images = [
            SceneImage(beat=image["beat"], url=image["url"], order=image["order"])
            for image in scratch.get("images", [])
        ]
        scene = Scene(
            id=scene_id,
            slug=scratch.get("slug", scene_id),
            number=scratch.get("number", scene_id),
            heading=scratch.get("heading", ""),
            title=scratch.get("title", scene_id),
            images=images,
            mood=scratch.get("mood"),
            score=scratch.get("score"),
            synopsis=scratch.get("synopsis", ""),
            dialogue=dialogue,
            duration=_format_duration(total_seconds),
            reference=SceneReference(**reference) if reference else None,
        )
        job_store.add_scene(job_id, scene)

        await job_store.emit(
            job_id,
            TraceEvent(
                step="assemble_output",
                status="completed",
                scene_id=scene_id,
                detail=f"Scene {scene_id} assembled.",
                data={"scene": scene.model_dump()},
            ),
        )
        return {"scene_id": scene_id, "status": "assembled"}

    return assemble_output
