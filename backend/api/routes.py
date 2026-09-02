from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from agent.job_store import job_store
from agent.orchestrator import run_job
from agent.tools.wait_for_scene_selection import MAX_SELECTED_SCENES

router = APIRouter(prefix="/api/scripts", tags=["scripts"])

VISUAL_STYLES = ("realistic", "animated")


class SceneSelectionRequest(BaseModel):
    scene_ids: list[str]


def _extract_text(filename: str, data: bytes) -> str:
    if filename.lower().endswith(".pdf"):
        from io import BytesIO

        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    # .txt and best-effort .fdx (FDX is XML; not specially parsed -- see README)
    return data.decode("utf-8", errors="ignore")


@router.post("")
async def submit_script(file: UploadFile, visual_style: str = Form("realistic")):
    if visual_style not in VISUAL_STYLES:
        raise HTTPException(400, f"visual_style must be one of {VISUAL_STYLES}")

    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")

    script_text = _extract_text(file.filename or "script.txt", data)
    if not script_text.strip():
        raise HTTPException(400, "Could not extract any text from the uploaded file")

    job_id = job_store.create(visual_style=visual_style)
    asyncio.create_task(run_job(job_id, script_text, file.filename or "script"))
    return {"job_id": job_id}


@router.get("/{job_id}/events")
async def stream_events(job_id: str):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")

    async def gen():
        while True:
            event = await record.queue.get()
            if event is None:  # sentinel from job_store.close_stream
                break
            yield f"data: {json.dumps(event.model_dump())}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/{job_id}/events/history")
async def event_history(job_id: str):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    return {
        "status": record.job.status,
        "events": [e.model_dump() for e in job_store.event_log_for(job_id)],
    }


@router.get("/{job_id}/scenes")
async def get_scenes(job_id: str):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    scenes = job_store.ordered_scenes(job_id)
    return {
        "job_id": job_id,
        "status": record.job.status,
        "error": record.job.error,
        "scenes": [s.model_dump() for s in scenes],
    }


@router.delete("/{job_id}/scenes/{scene_id}/images/{order}")
async def delete_scene_image(job_id: str, scene_id: str, order: int):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    scene = record.job.scenes.get(scene_id)
    if scene is None:
        raise HTTPException(404, "Unknown scene_id")

    removed = next((img for img in scene.images if img.order == order), None)
    if removed is None:
        raise HTTPException(404, "Unknown frame order for this scene")

    scene.images = [img for img in scene.images if img.order != order]

    scratch = job_store.scratch_for(job_id, scene_id)
    scratch["images"] = [img for img in scratch.get("images", []) if img.get("order") != order]

    from agent.storage import delete_media

    delete_media(job_id, removed.url.rsplit("/", 1)[-1])
    job_store.clear_pdf_cache(job_id)

    return {"status": "deleted", "images": [i.model_dump() for i in scene.images]}


@router.post("/{job_id}/scenes/{scene_id}/images/{order}/regenerate")
async def regenerate_scene_image(job_id: str, scene_id: str, order: int):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    scene = record.job.scenes.get(scene_id)
    if scene is None:
        raise HTTPException(404, "Unknown scene_id")
    if not any(img.order == order for img in scene.images):
        raise HTTPException(404, "Unknown frame order for this scene")

    from agent.schemas import SceneImage
    from agent.tools.generate_storyboard import regenerate_beat_image

    new_image = await regenerate_beat_image(job_id, scene_id, order)
    if new_image is None:
        raise HTTPException(404, "Unknown frame order for this scene")

    updated = SceneImage(beat=new_image["beat"], url=new_image["url"], order=new_image["order"])
    scene.images = [updated if img.order == order else img for img in scene.images]
    job_store.clear_pdf_cache(job_id)

    return {"status": "regenerated", "image": updated.model_dump()}


@router.get("/{job_id}/deck.pdf")
async def deck_pdf(job_id: str):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    if record.job.status != "completed":
        raise HTTPException(409, "Job is not finished yet")

    cached = job_store.pdf_cache_for(job_id)
    if cached is None:
        from agent.pdf import generate_deck_pdf

        cached = generate_deck_pdf(record.job)
        job_store.set_pdf_cache(job_id, cached)

    return Response(content=cached, media_type="application/pdf")


@router.post("/{job_id}/scenes/select")
async def select_scenes(job_id: str, body: SceneSelectionRequest):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    if len(body.scene_ids) == 0:
        raise HTTPException(400, "Select at least one scene")
    if len(body.scene_ids) > MAX_SELECTED_SCENES:
        raise HTTPException(400, f"Maximum {MAX_SELECTED_SCENES} scenes")
    job_store.confirm_scene_selection(job_id, body.scene_ids)
    return {"status": "confirmed"}


@router.post("/{job_id}/characters/{character_name}/photo")
async def upload_character_photo(job_id: str, character_name: str, file: UploadFile):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    job_store.store_character_photo(job_id, character_name, data, file.content_type or "image/jpeg")
    return {"status": "received"}


@router.post("/{job_id}/casting/confirm")
async def confirm_casting(job_id: str):
    record = job_store.get(job_id)
    if record is None:
        raise HTTPException(404, "Unknown job_id")
    job_store.confirm_casting(job_id)
    return {"status": "confirmed"}
