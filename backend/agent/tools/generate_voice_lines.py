"""Tool: generate_voice_lines -- Gemini TTS, one call per dialogue line (single-speaker mode).

Multi-speaker TTS is a preview feature gated by API tier; single-speaker
calls per line work on any tier and are labeled by speaker in the frontend
transcript, per the user's explicit choice over the multi-speaker path.
Voice is picked per-speaker (not per-line), so the same character sounds the
same across every line they have in a job.
"""

from __future__ import annotations

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
    async def generate_voice_lines(scene_id: str, line_id: str, speaker: str, line: str, intent: str) -> dict:
        """Synthesize a single dialogue line's voiced audio with Gemini TTS,
        styled by its inferred emotional intent. Call once per line."""
        from google.genai import types

        await job_store.emit(
            job_id,
            TraceEvent(step="generate_voice_lines", status="started", scene_id=scene_id, line_id=line_id),
        )

        client = get_genai_client()
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

        scratch = job_store.scratch_for(job_id, scene_id)
        scratch["lines"].setdefault(line_id, {})
        scratch["lines"][line_id].update(
            {
                "speaker": speaker,
                "line": line,
                "intent": intent,
                "audio_url": audio_url,
            }
        )

        await job_store.emit(
            job_id,
            TraceEvent(
                step="generate_voice_lines",
                status="completed",
                scene_id=scene_id,
                line_id=line_id,
                detail=speaker,
                data={"audio_url": audio_url},
            ),
        )
        return {"scene_id": scene_id, "line_id": line_id, "audio_url": audio_url}

    return generate_voice_lines
