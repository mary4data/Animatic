"""Tool: generate_voice_lines -- Gemini TTS for every dialogue line in a scene, in parallel.

One tool call per scene rather than one per line: the agent used to invoke
this once per dialogue line, which meant a full orchestrator round-trip (plus
a sequential TTS call) per line. Since each line's synthesis is independent,
this instead reads the scene's dialogue straight out of scratch (populated by
parse_script) and fires all of that scene's TTS calls concurrently.

Multi-speaker TTS is a preview feature gated by API tier; single-speaker
calls per line work on any tier and are labeled by speaker in the frontend
transcript, per the user's explicit choice over the multi-speaker path.
Voice is picked per-speaker (not per-line), so the same character sounds the
same across every line they have in a job.
"""

from __future__ import annotations

import asyncio
import wave
from io import BytesIO

from agent.clients import call_gemini_with_retry, gemini_tts_model, get_genai_client
from agent.job_store import job_store
from agent.schemas import TraceEvent
from agent.storage import save_media

SAMPLE_RATE = 24000
_VOICE_POOL = ["Kore", "Puck", "Charon", "Fenrir", "Aoede", "Zephyr"]


def _voice_for(speaker: str) -> str:
    return _VOICE_POOL[hash(speaker) % len(_VOICE_POOL)]


def _pcm_to_wav(pcm: bytes) -> bytes:
    buf = BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm)
    return buf.getvalue()


def make_generate_voice_lines_tool(job_id: str):
    async def generate_voice_lines(scene_id: str) -> dict:
        """Synthesize voiced audio for every dialogue line in the scene with
        Gemini TTS, each styled by its inferred emotional intent, generated
        concurrently. Call once per scene, any time after parse_script for
        that scene (it needs no line-level arguments -- it reads the scene's
        dialogue itself)."""
        from google.genai import types

        scratch = job_store.scratch_for(job_id, scene_id)
        dialogue_meta = scratch.get("dialogue_meta", [])

        await job_store.emit(job_id, TraceEvent(step="generate_voice_lines", status="started", scene_id=scene_id))

        client = get_genai_client()

        async def _voice_one(meta: dict) -> dict:
            line_id = meta["id"]
            speaker = meta["speaker"]
            line = meta["line"]
            intent = meta.get("intent", "")

            response = await call_gemini_with_retry(
                client.models.generate_content,
                model=gemini_tts_model(),
                contents=f"Say this with {intent}: {line}",
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=_voice_for(speaker))
                        )
                    ),
                ),
            )
            pcm = response.candidates[0].content.parts[0].inline_data.data
            wav_bytes = _pcm_to_wav(pcm)
            audio_url = save_media(job_id, f"{line_id}.wav", wav_bytes)

            scratch["lines"].setdefault(line_id, {})
            scratch["lines"][line_id].update(
                {"speaker": speaker, "line": line, "intent": intent, "audio_url": audio_url}
            )

            await job_store.emit(
                job_id,
                TraceEvent(
                    step="generate_voice_lines",
                    status="line_completed",
                    scene_id=scene_id,
                    line_id=line_id,
                    detail=speaker,
                    data={"audio_url": audio_url},
                ),
            )
            return {"line_id": line_id, "audio_url": audio_url}

        results = list(await asyncio.gather(*(_voice_one(meta) for meta in dialogue_meta)))

        await job_store.emit(
            job_id,
            TraceEvent(
                step="generate_voice_lines",
                status="completed",
                scene_id=scene_id,
                detail=f"{len(results)} line(s) voiced.",
                data={"lines": results},
            ),
        )
        return {"scene_id": scene_id, "lines": results}

    return generate_voice_lines
